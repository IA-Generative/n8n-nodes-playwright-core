export function isCustomScriptEnabled(
    rawValue = process.env.N8N_PLAYWRIGHT_NODE_CUSTOM_SCRIPT_ENABLED,
): boolean {
    return rawValue?.trim().toLowerCase() === 'true';
}
