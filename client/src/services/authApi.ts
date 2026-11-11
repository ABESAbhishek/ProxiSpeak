export interface AccountProfile {
  id: string;
  fullName: string;
  username: string;
  email: string;
  avatarUrl: string;
  bio: string;
  jobTitle: string;
  team: string;
  emailVerified: boolean;
  authProviders: string[];
  createdAt: string;
  updatedAt: string;
}

export const AUTH_TOKEN_KEY = 'proxispeak_auth_token';

/**
 * Resolves the backend base URL.
 * Prefers explicit environment variable, falls back to localhost:3001 in dev,
 * and uses relative path in production (avoiding invalid :3001 ports on Vercel).
 */
export const getBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_SERVER_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
    if (isLocal) {
      return `${window.location.protocol}//${hostname}:3001`;
    }
    // In production deployments (e.g. Vercel), use relative path so reverse proxies and rewrites work
    return '';
  }

  return 'http://localhost:3001';
};

export function getStoredAuthToken(): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // Ignore storage quota or access errors
  }
}

export async function authRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/auth${path}`;

  const headers: Record<string, string> = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  // Pass bearer token if available to support cross-origin deployments (Vercel frontend + separate backend)
  const token = getStoredAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000)
    });

    const data = (await response.json().catch(() => ({}))) as T & { error?: string; token?: string };

    if (!response.ok) {
      if (response.status === 401 && path === '/me') {
        setStoredAuthToken(null);
      }
      throw new Error(data.error || 'Request could not be completed.');
    }

    if (data && typeof data === 'object' && 'token' in data && typeof data.token === 'string') {
      setStoredAuthToken(data.token);
    }

    return data;
  } catch (error: unknown) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
      const target = baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'server');
      throw new Error(`Cannot connect to the backend server at ${target}. Please verify your backend server is deployed and VITE_SERVER_URL is configured in your Vercel settings.`);
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('Server request timed out. Please check your backend connection.');
    }
    throw error;
  }
}

export const googleLoginUrl = `${getBaseUrl()}/api/auth/google`;
