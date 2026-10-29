export interface AccountProfile { id: string; fullName: string; username: string; email: string; avatarUrl: string; bio: string; jobTitle: string; team: string; emailVerified: boolean; authProviders: string[]; createdAt: string; updatedAt: string; }
const BASE = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`;
export async function authRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}/api/auth${path}`, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Request could not be completed.');
  return data;
}
export const googleLoginUrl = `${BASE}/api/auth/google`;
