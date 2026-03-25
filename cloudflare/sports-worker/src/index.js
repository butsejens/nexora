const inflightRequests = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const analytics = env.SPORTS_ANALYTICS;
    const trackingId = crypto.randomUUID();

    if (request.method === "OPTIONS") {
      return withCors(
        new Response(null, {
          status: 204,
          headers: {
            "access-control-max-age": "86400",
          },
        }),
        request,
        env
      );
    }

    if (!path.startsWith("/api/sports/")) {
      return withCors(new Response("Not Found", { status: 404 }), request, env);
    }

    const origin = (env.RENDER_SPORTS_ORIGIN || "https://nexora-api-8xxb.onrender.com").replace(/\/$/, "");
    const upstreamUrl = `${origin}${path}${url.search}`;
    const method = request.method.toUpperCase();
    const cacheMode = String(env.CACHE_MODE || "hybrid").toLowerCase();
    const canUseKv = cacheMode !== "d1-only";
    const allowStaleWhileRevalidate = String(env.CACHE_STALE_UNTIL_REVALIDATE || "true").toLowerCase() !== "false";
    const upstreamTimeoutMs = Number(env.UPSTREAM_TIMEOUT_MS || 15000);
    const upstreamMaxAttempts = Math.max(1, Number(env.UPSTREAM_MAX_ATTEMPTS || 2));

    if (method !== "GET" && method !== "HEAD") {
      logAnalytics(analytics, { trackingId, path, method, cacheState: "passthrough", status: 0 });
      const upstream = await proxyPass(request, upstreamUrl, upstreamTimeoutMs, 1);
      return withCors(upstream, request, env);
    }

    const now = Date.now();
    const cacheKey = `sports:${method}:${path}${url.search || ""}`;
    const ttlMs = resolveTtlMs(path);
    const kvTtlSeconds = Math.ceil(ttlMs / 1000);

    let response = null;
    let cacheState = "miss";

    const existingInFlight = inflightRequests.get(cacheKey);
    if (existingInFlight) {
      try {
        const inflightResponse = await existingInFlight;
        const cloned = inflightResponse.clone();
        cloned.headers.set("x-nexora-cache", "inflight");
        cloned.headers.set("x-nexora-cache-key", cacheKey);
        return withCors(cloned, request, env);
      } catch (_) {}
    }

    try {
      response = canUseKv ? await tryKVCache(env.SPORTS_CACHE_KV, cacheKey) : null;
      if (response) {
        cacheState = "kv-hit";
      }
    } catch (_) {}

    if (!response) {
      try {
        response = await tryD1Cache(env.SPORTS_DB, cacheKey, now);
        if (response) {
          cacheState = "d1-hit";
        }
      } catch (_) {}
    }

    if (response) {
      logAnalytics(analytics, { trackingId, path, method, cacheState, status: response.status });
      response.headers.set("x-nexora-cache", cacheState);
      response.headers.set("x-nexora-cache-key", cacheKey);
      return withCors(response, request, env);
    }

    const upstreamTask = (async () => {
      try {
      const upstreamResponse = await fetchWithTimeout(upstreamUrl, request, upstreamTimeoutMs, upstreamMaxAttempts);
      const contentType = upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8";
      const bodyText = await upstreamResponse.text();
      const status = upstreamResponse.status;

      if (status >= 200 && status < 300) {
        persistCaches(env, cacheKey, status, contentType, bodyText, kvTtlSeconds, now + ttlMs, canUseKv);
      }

      const headers = new Headers();
      headers.set("content-type", contentType);
      headers.set("x-nexora-cache", "miss");
      headers.set("x-nexora-upstream", origin);
      const swrSeconds = allowStaleWhileRevalidate ? kvTtlSeconds * 2 : 0;
      headers.set("cache-control", `public, max-age=${kvTtlSeconds}, stale-while-revalidate=${swrSeconds}`);

      logAnalytics(analytics, { trackingId, path, method, cacheState: "miss", status });
      return withCors(new Response(bodyText, { status, headers }), request, env);
    } catch (error) {
      const fallbackResponse = allowStaleWhileRevalidate
        ? await tryD1Cache(env.SPORTS_DB, cacheKey, now, true)
        : null;
      if (fallbackResponse) {
        logAnalytics(analytics, { trackingId, path, method, cacheState: "d1-stale", status: fallbackResponse.status });
        fallbackResponse.headers.set("x-nexora-cache", "d1-stale");
        return withCors(fallbackResponse, request, env);
      }

      logAnalytics(analytics, { trackingId, path, method, cacheState: "error", status: 502, error: String(error) });
      return withCors(new Response(
        JSON.stringify({
          error: "Sports upstream unavailable",
          source: "cloudflare-worker",
          trackingId,
        }),
        {
          status: 502,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      ), request, env);
    }
    })();

    inflightRequests.set(cacheKey, upstreamTask);
    try {
      return await upstreamTask;
    } finally {
      inflightRequests.delete(cacheKey);
    }
  },
};


async function tryKVCache(kv, cacheKey) {
  if (!kv) return null;
  try {
    const data = await kv.get(cacheKey, "json");
    if (data && data.expiresAt > Date.now()) {
      return buildCachedResponse(data.status, data.contentType, data.body);
    }
    if (data) await kv.delete(cacheKey);
    return null;
  } catch (_) {
    return null;
  }
}

async function tryD1Cache(db, cacheKey, now, allowStale = false) {
  if (!db) return null;
  try {
    const row = await db
      .prepare("SELECT status, content_type, body, expires_at FROM sports_cache WHERE cache_key = ?1")
      .bind(cacheKey)
      .first();

    if (!row) return null;
    const expiresAt = Number(row.expires_at);
    if (allowStale || expiresAt > now) {
      return buildCachedResponse(row.status, row.content_type, row.body);
    }
    return null;
  } catch (_) {
    return null;
  }
}

async function persistCaches(env, cacheKey, status, contentType, bodyText, kvTtlSeconds, expiresAt, canUseKv) {
  const kvPromise = (async () => {
    if (!canUseKv || !env.SPORTS_CACHE_KV) return;
    try {
      await env.SPORTS_CACHE_KV.put(
        cacheKey,
        JSON.stringify({
          status,
          contentType,
          body: bodyText,
          expiresAt,
        }),
        { expirationTtl: kvTtlSeconds }
      );
    } catch (_) {}
  })();

  const d1Promise = (async () => {
    if (!env.SPORTS_DB) return;
    try {
      await env.SPORTS_DB
        .prepare(
          `INSERT INTO sports_cache (cache_key, status, content_type, body, expires_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(cache_key) DO UPDATE SET
             status = excluded.status,
             content_type = excluded.content_type,
             body = excluded.body,
             expires_at = excluded.expires_at,
             updated_at = excluded.updated_at`
        )
        .bind(cacheKey, status, contentType, bodyText, expiresAt, Date.now())
        .run();
    } catch (_) {}
  })();

  await Promise.allSettled([kvPromise, d1Promise]);
}

function buildCachedResponse(status, contentType, bodyText) {
  const headers = new Headers();
  headers.set("content-type", contentType || "application/json; charset=utf-8");
  return new Response(bodyText || "{}", {
    status: Number(status) || 200,
    headers,
  });
}

async function fetchWithTimeout(url, request, timeoutMs, maxAttempts = 1) {
  const headers = buildUpstreamHeaders(request.headers);

  let attempt = 0;
  let lastError;
  while (attempt < maxAttempts) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        signal: controller.signal,
      });

      if (!isRetryableStatus(response.status) || attempt >= maxAttempts) {
        clearTimeout(timeout);
        return response;
      }
      clearTimeout(timeout);
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt >= maxAttempts) throw error;
    }
  }

  throw lastError || new Error("Upstream request failed");
}

async function proxyPass(request, upstreamUrl, timeoutMs = 15000, maxAttempts = 1) {
  return fetchWithTimeout(upstreamUrl, request, timeoutMs, maxAttempts);
}

async function logAnalytics(analytics, event) {
  if (!analytics) return;
  try {
    await analytics.writeDataPoint({
      indexes: [event.path, event.cacheState, String(event.status)],
      blobs: [JSON.stringify(event)],
      doubles: [event.status || 0],
    });
  } catch (_) {}
}

function resolveTtlMs(path) {
  if (path.includes("/live")) return 15 * 1000;
  if (path.includes("/today") || path.includes("/by-date")) return 60 * 1000;
  if (path.includes("/menu-tools") || path.includes("/highlights")) return 5 * 60 * 1000;
  if (path.includes("/match/") || path.includes("/stream/")) return 45 * 1000;
  if (path.includes("/competition") || path.includes("/standings") || path.includes("/top")) return 5 * 60 * 1000;
  if (path.includes("/team/") || path.includes("/player/")) return 2 * 60 * 1000;
  return 60 * 1000;
}

function isRetryableStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

function buildUpstreamHeaders(incomingHeaders) {
  const headers = new Headers(incomingHeaders);
  const blocked = [
    "host",
    "content-length",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "cf-connecting-ip",
    "cf-ray",
    "x-real-ip",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
  ];
  for (const key of blocked) {
    headers.delete(key);
  }
  headers.set("x-forwarded-proto", "https");
  return headers;
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers || {});
  const origin = resolveCorsOrigin(request, env);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type, Authorization, X-Requested-With");
  headers.set("access-control-expose-headers", "x-nexora-cache,x-nexora-cache-key,x-nexora-upstream,cache-control");
  const vary = headers.get("vary");
  if (!vary) {
    headers.set("vary", "Origin");
  } else if (!vary.toLowerCase().includes("origin")) {
    headers.set("vary", `${vary}, Origin`);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function resolveCorsOrigin(request, env) {
  const configured = String(env?.CORS_ALLOW_ORIGIN || "*").trim();
  if (configured === "*") return "*";

  const origin = request.headers.get("origin") || "";
  const allowList = configured
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (origin && allowList.includes(origin)) {
    return origin;
  }
  return allowList[0] || "*";
}
