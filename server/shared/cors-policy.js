/**
 * Nexora – CORS Policy
 *
 * Development without ALLOWED_ORIGIN allows every origin. Production refuses
 * to start without it, so the API is never left open by a missing env var.
 *
 * ALLOWED_ORIGIN may hold one origin or a comma-separated list. Requests
 * without an Origin header (the native app, curl, health checks) are allowed.
 */

export function parseAllowedOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function buildCorsOptions({ allowedOrigin, nodeEnv }) {
  const origins = parseAllowedOrigins(allowedOrigin);

  if (origins.length === 0) {
    if (nodeEnv === "production") {
      throw new Error(
        "ALLOWED_ORIGIN must be set in production (comma-separated list of web origins)",
      );
    }
    return undefined;
  }

  const allowed = new Set(origins);
  return {
    // Refused origins get no CORS headers, so the browser blocks them without a 500.
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    credentials: true,
  };
}
