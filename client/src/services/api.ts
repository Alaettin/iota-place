const API_BASE = "";

// Session token (HMAC-signed, replaces raw walletId header)
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<{ ok: boolean; status: number; payload: T }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  // Merge caller-provided headers (can override defaults)
  if (options?.headers) {
    Object.assign(headers, options.headers);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  const payload = await res.json();
  return { ok: res.ok, status: res.status, payload };
}

export async function fetchCanvasBinary(): Promise<Uint8Array> {
  const res = await fetch(`${API_BASE}/api/canvas`);
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function fetchConfig(): Promise<{
  config: { width: number; height: number; paymentMode: "mock" | "iota"; collectionAddress?: string; network?: string };
  palette: string[];
  season: { id: number; name: string; startDate: string; endDate: string | null } | null;
}> {
  const res = await fetch(`${API_BASE}/api/canvas/config`);
  const data = await res.json();
  return { config: data.config, palette: data.palette, season: data.season || null };
}
