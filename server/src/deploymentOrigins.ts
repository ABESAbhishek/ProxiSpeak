function asOrigin(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return '';
  return normalized.includes('://') ? normalized.replace(/\/$/, '') : `https://${normalized}`;
}

export function getAllowedClientOrigins() {
  return [
    ...(process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(value => value.trim()),
    asOrigin(process.env.VERCEL_URL),
    asOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  ].filter(Boolean);
}
