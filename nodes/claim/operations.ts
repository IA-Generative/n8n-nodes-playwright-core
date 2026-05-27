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

function extractClaimFqdn(responseBody: unknown): string | undefined {
	if (!responseBody || typeof responseBody !== 'object') {
		return undefined;
	}

	const body = responseBody as {
		data?: {
			fqdn?: unknown;
		};
	};

	return typeof body.data?.fqdn === 'string' ? body.data.fqdn.trim() : undefined;
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
	const headers = {
		'Content-Type': 'application/json',
		'X-Session-ID': claimSessionId,
	};

	let response: Awaited<ReturnType<typeof fetch>>;

	try {
		response = await fetch(joinUrl(claimControllerUrl, '/claim'), {
			method: 'POST',
			headers,
			body: JSON.stringify({
				TTL: ttl,
			}),
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

	const fqdn = extractClaimFqdn(responseBody);

	if (!fqdn) {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			'Claim controller response does not contain data.fqdn',
			{ itemIndex },
		);
	}

	return {
		json: {
			browserEndpoint: `ws://${fqdn}`,
		},
		pairedItem: {
			item: itemIndex,
		},
	};
}
