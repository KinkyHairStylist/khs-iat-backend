import { IntegrationAuthError, IntegrationCallError } from "./errors";

const TIMEOUT_MS = 20_000;

export interface CallOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string>;
  /** Statuses that mean the credentials are dead (default 401). */
  authStatuses?: number[];
  /** Statuses that count as success with no body (e.g. 404 on a delete). */
  okStatuses?: number[];
}

/** A provider request with a timeout; dead credentials throw IntegrationAuthError, other failures IntegrationCallError. */
export async function callProvider<T>(provider: string, action: string, url: string, opts: CallOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  }
  const res = await fetch(url, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (opts.okStatuses?.includes(res.status)) return undefined as T;
  const text = await res.text();
  if (!res.ok) {
    if ((opts.authStatuses ?? [401]).includes(res.status)) throw new IntegrationAuthError(`${provider} no longer accepts the saved access. Please reconnect.`);
    throw new IntegrationCallError(provider, action, res.status, text.slice(0, 300));
  }
  return (text ? JSON.parse(text) : undefined) as T;
}
