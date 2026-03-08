export type ApiErrorKind =
  | "offline"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "server"
  | "unknown";

export type NormalizedApiError = {
  kind: ApiErrorKind;
  code: string;
  userMessage: string;
  rawMessage: string;
};

const MESSAGE_BY_KIND: Record<ApiErrorKind, string> = {
  offline: "Geen internetverbinding of server niet bereikbaar.",
  timeout: "Request timeout. Probeer opnieuw.",
  unauthorized: "Geen toegang (401). Controleer je sessie.",
  forbidden: "Toegang geweigerd (403).",
  not_found: "Inhoud niet gevonden (404).",
  server: "Serverfout. Probeer later opnieuw.",
  unknown: "Er is iets misgegaan. Probeer opnieuw.",
};

function inferStatusCode(message: string): number | null {
  const m = String(message || "").match(/\b(401|403|404|408|429|500|502|503|504)\b/);
  if (!m) return null;
  const parsed = Number(m[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeApiError(input: unknown): NormalizedApiError {
  const rawMessage = String((input as any)?.message || input || "").trim();
  const message = rawMessage.toLowerCase();
  const status = inferStatusCode(rawMessage);

  if (
    message.includes("network") ||
    message.includes("netwerk") ||
    message.includes("failed to fetch") ||
    message.includes("niet bereikbaar")
  ) {
    return { kind: "offline", code: "OFFLINE", userMessage: MESSAGE_BY_KIND.offline, rawMessage };
  }
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("abort") ||
    status === 408 ||
    status === 504
  ) {
    return { kind: "timeout", code: "TIMEOUT", userMessage: MESSAGE_BY_KIND.timeout, rawMessage };
  }
  if (status === 401) {
    return { kind: "unauthorized", code: "HTTP_401", userMessage: MESSAGE_BY_KIND.unauthorized, rawMessage };
  }
  if (status === 403) {
    return { kind: "forbidden", code: "HTTP_403", userMessage: MESSAGE_BY_KIND.forbidden, rawMessage };
  }
  if (status === 404) {
    return { kind: "not_found", code: "HTTP_404", userMessage: MESSAGE_BY_KIND.not_found, rawMessage };
  }
  if (status === 429 || (status !== null && status >= 500)) {
    return { kind: "server", code: `HTTP_${status}`, userMessage: MESSAGE_BY_KIND.server, rawMessage };
  }

  return { kind: "unknown", code: "UNKNOWN", userMessage: MESSAGE_BY_KIND.unknown, rawMessage };
}

export function buildErrorReference(prefix = "NX"): string {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${ts}-${rnd}`;
}
