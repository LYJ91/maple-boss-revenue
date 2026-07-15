export type SyncScope = "calculator" | "todo";
export const SYNC_EVENT = "maple:sync-change";
export const HISTORY_EVENT = "maple:history-change";

export interface StateEnvelope<T = unknown> {
  exists: boolean;
  revision: number;
  schemaVersion?: number;
  updatedAt?: string;
  payload: T | null;
}

async function authenticatedFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const { authToken } = await import("./auth");
  const token = await authToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    revision?: number;
  };
  if (!res.ok) {
    const error = Object.assign(
      new Error(body.error ?? `요청 실패 (${res.status})`),
      { status: res.status, body },
    );
    throw error;
  }
  return body;
}

export const getRemoteState = <T>(scope: SyncScope) =>
  authenticatedFetch<StateEnvelope<T>>(`/api/state?scope=${scope}`);

export const putRemoteState = <T>(
  scope: SyncScope,
  payload: T,
  baseRevision: number,
  force = false,
) =>
  authenticatedFetch<{ revision: number; updatedAt: string }>("/api/state", {
    method: "PUT",
    body: JSON.stringify({
      scope,
      payload,
      baseRevision,
      schemaVersion: 1,
      force,
    }),
  });

export const getRemoteHistory = () =>
  authenticatedFetch<{ records: unknown[] }>("/api/history");
export const putRemoteHistory = (record: unknown) =>
  authenticatedFetch<{ ok: true }>("/api/history", {
    method: "PUT",
    body: JSON.stringify(record),
  });

export interface ServerAccount {
  id: string;
  label: string;
  connected: boolean;
}
export const createServerAccount = (
  label: string,
  apiKey: string,
  id?: string,
) =>
  authenticatedFetch<{ account: ServerAccount }>("/api/nexon-accounts", {
    method: "POST",
    body: JSON.stringify({ id, label, apiKey }),
  });
export const deleteServerAccount = (id: string) =>
  authenticatedFetch<{ ok: true }>(
    `/api/nexon-accounts?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );

export function notifySync(scope: SyncScope, payload: unknown): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENT, { detail: { scope, payload } }),
    );
  }
}
export function notifyHistory(record: unknown): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: record }));
  }
}

export async function authRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  return authenticatedFetch<T>(url, init);
}
