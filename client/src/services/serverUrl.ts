const configuredUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_SERVER_URL;

export const serverUrl = (configuredUrl || window.location.origin).replace(/\/$/, '');
