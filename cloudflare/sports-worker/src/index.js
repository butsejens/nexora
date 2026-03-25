export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const analytics = env.SPORTS_ANALYTICS;
    const trackingId = crypto.randomUUID();

    if (!path.startsWith("/api/sports/")) {
      return new Response("Not Found", { status: 404 });
    }

    const origin = (env.RENDER_SPORTS_ORIGIN || "https://nexora-api-8xxb.onrender.com").replace(/\/$/, "");
    const upstreamUrl = `${origin}${path}${url.search}`;
    const method = request.method.toUpperCase();

    if (method !== "GET" && method !== "HEAD") {
      logAnalytics(analytics, { trackingId, path, method, cacheState: "passthrough", status: 0 });
      return proxyPass(request, upstreamUrl);
    }

    const now = Date.now();
    const cacheKey = `sports:${method}:${path}${url.search ? "?" + url.searchParams.toString() : ""}`;
    const ttlMs = resolveTtlMs(path);
    const kvTtlSeconds = Math.ceil(ttlMs / 1000);

    let response = null;
    let cacheState = "miss";
    let source = "upstream";

    try {
      response = await tryKVCache(env.SPORTS_CACHE_KV, cacheKey);
      if (response) {
        cacheState = "kv-hit";
        source = "kv";
      }
    } catch (_) {}

    if (!response) {
      try {
        response = await tryD1Cache(env.SPORTS_DB, cacheKey, now);
        if (response) {
          cacheState = "d1-hit";
          source = "d1";
        }
      } catch (_) {}
    }

    if (response) {
      logAnalytics(analytics, { trackingId, path, method, cacheState, status: response.status });
      response.headers.set("x-nexora-cache", cacheState);
      response.headers.set("x-nexora-cache-key", cacheKey);
      return response;
    }

    try {
      const upstreamResponse = await fetchWithTimeout(upstreamUrl, request, 30000);
      const contentType = upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8";
      const bodyText = await upstreamResponse.text();
      const status = upstreamResponse.status;

      if (status >= 200 && status < 300) {
        persistCaches(env, cacheKey, status, contentType, bodyText, kvTtlSeconds, now + ttlMs);
      }

      const headers = new Headers();
      headers.set("content-type", contentType);
      headers.set("x-nexora-cache", "miss");
      headers.set("x-nexora-upstream", origin);
      headers.set("cache-control", `public, max-age=${kvTtlSeconds}, stale-while-revalidate=${kvTtlSeconds * 2}`);

      logAnalytics(analytics, { trackingId, path, method, cacheState: "miss", status });
      return new Response(bodyText, { status, headers });
    } catch (error) {
      const fallbackResponse = await tryD1Cache(env.SPORTS_DB, cacheKey, now, true);
      if (fallbackResponse) {
        logAnalytics(analytics, { trackingId, path, method, cacheState: "d1-stale", status: fallbackResponse.status });
        fallbackResponse.headers.set("x-nexora-cache", "d1-stale");
        return fallbackResponse;
      }

      logAnalytics(analytics, { trackingId, path, method, cacheState: "error", status: 502, error: String(error) });
      return new Response(
        JSON.stringify({
          error: "Sports upstream unavailable",
          source: "cloudflare-worker",
          trackingId,
        }),
        {
          status: 502,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );
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

async function persistCaches(env, cacheKey, status, contentType, bodyText, kvTtlSeconds, expiresAt) {
  const kvPromise = (async () => {
    if (!env.SPORTS_CACHE_KV) return;
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

async function fetchWithTimeout(url, request, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function proxyPass(request, upstreamUrl) {
  return fetch(upstreamUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
  });
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
