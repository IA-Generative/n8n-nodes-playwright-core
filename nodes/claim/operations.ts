import { randomUUID } from 'crypto';
import { IExecuteFunctions, INodeExecutionData, NodeOperationError } from 'n8n-workflow';

type ExecuteFunctionsWithClaimMetadata = IExecuteFunctions & {
	getWorkflow?: () => {
		id?: string | number;
		name?: string;
	};
	getMode?: () => string;
	getExecutionId?: () => string | undefined;
};

export function inferSelectorType(selector: string): 'css' | 'xpath' {
	const trimmedSelector = selector.trim();

	return trimmedSelector.startsWith('/') || trimmedSelector.startsWith('(') ? 'xpath' : 'css';
}

export function resolveUrl(url: string, baseUrl: string): string {
	try {
		return new URL(url, baseUrl).toString();
	} catch {
		return url;
	}
}

function slugifyClaimSessionPart(value: unknown, fallback: string): string {
	const slug = String(value ?? '')
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-_]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

	return slug || fallback;
}

function isClaimDevMode(mode: string): boolean {
	return mode === 'manual' || mode === 'test';
}

function buildClaimSessionId(executeFunctions: IExecuteFunctions): string {
	const context = executeFunctions as ExecuteFunctionsWithClaimMetadata;
	const workflow = typeof context.getWorkflow === 'function' ? context.getWorkflow() : undefined;
	const mode = typeof context.getMode === 'function' ? context.getMode() : '';
	const executionId =
		typeof context.getExecutionId === 'function' ? context.getExecutionId() : undefined;

	const workflowId = slugifyClaimSessionPart(workflow?.id, 'unknown-workflow');
	const workflowSlug = slugifyClaimSessionPart(workflow?.name, 'unnamed-workflow');
	const suffix = isClaimDevMode(mode)
		? 'dev'
		: slugifyClaimSessionPart(executionId, randomUUID());

	return `${workflowId}-${workflowSlug}-${suffix}`;
}

function joinUrl(baseUrl: string, path: string): string {
	return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

interface ClaimCreateResponse {
	data?: { fqdn?: unknown };
	id?: unknown;
	expiresAt?: unknown;
	preProvisioned?: unknown;
	releaseMethod?: unknown;
	releasePath?: unknown;
	renewMethod?: unknown;
	renewPath?: unknown;
	status?: unknown;
}

function extractClaimCreateResponse(body: unknown): {
	fqdn: string;
	id: string;
	expiresAt: string | undefined;
	preProvisioned: boolean | undefined;
	releaseMethod: string | undefined;
	releasePath: string | undefined;
	renewMethod: string | undefined;
	renewPath: string | undefined;
	status: string | undefined;
} | undefined {
	if (!body || typeof body !== 'object') return undefined;

	const r = body as ClaimCreateResponse;
	const fqdn = typeof r.data?.fqdn === 'string' ? r.data.fqdn.trim() : undefined;
	const id = typeof r.id === 'string' ? r.id.trim() : undefined;

	if (!fqdn || !id) return undefined;

	return {
		fqdn,
		id,
		expiresAt: typeof r.expiresAt === 'string' ? r.expiresAt : undefined,
		preProvisioned: typeof r.preProvisioned === 'boolean' ? r.preProvisioned : undefined,
		releaseMethod: typeof r.releaseMethod === 'string' ? r.releaseMethod : undefined,
		releasePath: typeof r.releasePath === 'string' ? r.releasePath : undefined,
		renewMethod: typeof r.renewMethod === 'string' ? r.renewMethod : undefined,
		renewPath: typeof r.renewPath === 'string' ? r.renewPath : undefined,
		status: typeof r.status === 'string' ? r.status : undefined,
	};
}

async function callClaimController(
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
	url: string,
	method: string,
	body: Record<string, unknown> | undefined,
	timeout: number,
): Promise<Response> {
	try {
		return await fetch(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: body !== undefined ? JSON.stringify(body) : undefined,
			signal: AbortSignal.timeout(timeout),
		});
	} catch (error: any) {
		const causeMessage = error.cause?.message || error.cause?.code || error.message;
		throw new NodeOperationError(
			executeFunctions.getNode(),
			`Failed to call claim controller: ${causeMessage}`,
			{ itemIndex },
		);
	}
}

export async function handleClaimCreateInstance(
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const claimControllerUrl = (
		executeFunctions.getNodeParameter('claimControllerUrl', itemIndex) as string
	).trim();
	const ttl = (executeFunctions.getNodeParameter('claimTtl', itemIndex) as string).trim();
	const timeout = executeFunctions.getNodeParameter('claimTimeout', itemIndex, 120000) as number;

	if (!claimControllerUrl) {
		throw new NodeOperationError(executeFunctions.getNode(), 'Claim Controller URL is required', {
			itemIndex,
		});
	}

	if (!ttl) {
		throw new NodeOperationError(executeFunctions.getNode(), 'TTL is required', {
			itemIndex,
		});
	}

	const claimSessionId = buildClaimSessionId(executeFunctions);

	let response: Response;

	try {
		response = await fetch(joinUrl(claimControllerUrl, '/claim'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Session-ID': claimSessionId,
			},
			body: JSON.stringify({ ttl }),
			signal: AbortSignal.timeout(timeout),
		});
	} catch (error: any) {
		const causeMessage = error.cause?.message || error.cause?.code || error.message;
		throw new NodeOperationError(
			executeFunctions.getNode(),
			`Failed to call claim controller: ${causeMessage}`,
			{ itemIndex },
		);
	}

	if (!response.ok) {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			`Claim controller returned HTTP ${response.status}`,
			{ itemIndex },
		);
	}

	let responseBody: unknown;

	try {
		responseBody = await response.json();
	} catch {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			'Claim controller response is not valid JSON',
			{ itemIndex },
		);
	}

	const parsed = extractClaimCreateResponse(responseBody);

	if (!parsed) {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			'Claim controller response does not contain required fields (data.fqdn, id)',
			{ itemIndex },
		);
	}

	return {
		json: {
			browserEndpoint: `ws://${parsed.fqdn}`,
			claimId: parsed.id,
			claimControllerUrl,
			expiresAt: parsed.expiresAt,
			preProvisioned: parsed.preProvisioned,
			releaseMethod: parsed.releaseMethod,
			releasePath: parsed.releasePath,
			renewMethod: parsed.renewMethod,
			renewPath: parsed.renewPath,
			status: parsed.status,
		},
		pairedItem: { item: itemIndex },
	};
}

export async function handleRenewClaim(
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const claimControllerUrl = (
		executeFunctions.getNodeParameter('claimControllerUrl', itemIndex) as string
	).trim();
	const claimId = (
		executeFunctions.getNodeParameter('claimId', itemIndex) as string
	).trim();
	const ttl = (executeFunctions.getNodeParameter('claimTtl', itemIndex) as string).trim();
	const timeout = executeFunctions.getNodeParameter('claimTimeout', itemIndex, 120000) as number;

	if (!claimControllerUrl) {
		throw new NodeOperationError(executeFunctions.getNode(), 'Claim Controller URL is required', {
			itemIndex,
		});
	}

	if (!claimId) {
		throw new NodeOperationError(executeFunctions.getNode(), 'Claim ID is required', {
			itemIndex,
		});
	}

	if (!ttl) {
		throw new NodeOperationError(executeFunctions.getNode(), 'TTL is required', { itemIndex });
	}

	const response = await callClaimController(
		executeFunctions,
		itemIndex,
		joinUrl(claimControllerUrl, `/renew/${claimId}`),
		'POST',
		{ ttl },
		timeout,
	);

	if (!response.ok) {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			`Claim controller returned HTTP ${response.status}`,
			{ itemIndex },
		);
	}

	let responseBody: unknown;

	try {
		responseBody = await response.json();
	} catch {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			'Claim controller response is not valid JSON',
			{ itemIndex },
		);
	}

	const r = responseBody as {
		expiresAt?: string;
		id?: string;
		renewMethod?: string;
		renewPath?: string;
		status?: string;
	};

	return {
		json: {
			claimId: r.id ?? claimId,
			claimControllerUrl,
			expiresAt: r.expiresAt,
			renewMethod: r.renewMethod,
			renewPath: r.renewPath,
			status: r.status,
		},
		pairedItem: { item: itemIndex },
	};
}

export async function handleReleaseClaim(
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const claimControllerUrl = (
		executeFunctions.getNodeParameter('claimControllerUrl', itemIndex) as string
	).trim();
	const claimId = (
		executeFunctions.getNodeParameter('claimId', itemIndex) as string
	).trim();
	const timeout = executeFunctions.getNodeParameter('claimTimeout', itemIndex, 120000) as number;

	if (!claimControllerUrl) {
		throw new NodeOperationError(executeFunctions.getNode(), 'Claim Controller URL is required', {
			itemIndex,
		});
	}

	if (!claimId) {
		throw new NodeOperationError(executeFunctions.getNode(), 'Claim ID is required', {
			itemIndex,
		});
	}

	const response = await callClaimController(
		executeFunctions,
		itemIndex,
		joinUrl(claimControllerUrl, `/release/${claimId}`),
		'POST',
		undefined,
		timeout,
	);

	if (!response.ok) {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			`Claim controller returned HTTP ${response.status}`,
			{ itemIndex },
		);
	}

	// Body is {} — consume and ignore
	try {
		await response.json();
	} catch {
		// silently ignore parse errors on empty/missing body
	}

	return {
		json: {
			claimId,
			released: true,
		},
		pairedItem: { item: itemIndex },
	};
}
