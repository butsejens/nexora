/**
 * YouTube trailer helpers — keep playback in-app and locked to one video.
 */

const YOUTUBE_KEY_RE = /^[A-Za-z0-9_-]{6,}$/;

export function buildTrailerCandidates(value: unknown): string[] {
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (YOUTUBE_KEY_RE.test(raw)) return [raw];

  const out = new Set<string>();
  const pushIfValid = (candidate: string) => {
    const key = String(candidate || "").trim();
    if (YOUTUBE_KEY_RE.test(key)) out.add(key);
  };

  try {
    const parsed = new URL(raw);
    pushIfValid(parsed.searchParams.get("v") || "");
    const parts = parsed.pathname.split("/").filter(Boolean);
    pushIfValid(parts[parts.length - 1] || "");
  } catch {
    const regex = /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw)) !== null) {
      pushIfValid(match[1] || "");
    }
  }

  return Array.from(out);
}

export function isValidYoutubeKey(key: string): boolean {
  return YOUTUBE_KEY_RE.test(String(key || "").trim());
}

/** HTTPS origin used so WebViews send a valid Referer (fixes YouTube error 153). */
export const TRAILER_EMBED_ORIGIN = "https://www.youtube.com";

export function buildYoutubeEmbedUrl(videoKey: string): string {
  const key = encodeURIComponent(String(videoKey || "").trim());
  const params = new URLSearchParams({
    autoplay: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    controls: "1",
    fs: "1",
    iv_load_policy: "3",
    enablejsapi: "1",
    origin: TRAILER_EMBED_ORIGIN,
  });
  return `${TRAILER_EMBED_ORIGIN}/embed/${key}?${params.toString()}`;
}

/**
 * Local HTML shell hosting a single YouTube iframe.
 * Loaded with baseUrl=TRAILER_EMBED_ORIGIN so WKWebView/Android WebView
 * attach a trusted Referer and Error 153 goes away.
 */
export function buildYoutubeTrailerHtml(videoKey: string): string {
  const embedUrl = buildYoutubeEmbedUrl(videoKey);
  const safeSrc = embedUrl
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #000;
        overflow: hidden;
      }
      iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        background: #000;
      }
    </style>
  </head>
  <body>
    <iframe
      id="trailer"
      src="${safeSrc}"
      title="Trailer"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
    <script>
      (function () {
        // Block in-page navigation away from the embed (related videos, YouTube chrome).
        document.addEventListener("click", function (event) {
          var target = event.target;
          while (target && target !== document.body) {
            if (target.tagName === "A") {
              event.preventDefault();
              event.stopPropagation();
              return false;
            }
            target = target.parentNode;
          }
        }, true);
      })();
    </script>
  </body>
</html>`;
}

/** Allow only YouTube player / CDN assets — never browse the full site. */
export function isAllowedTrailerNavigation(url: string): boolean {
  const value = String(url || "").trim().toLowerCase();
  if (!value || value === "about:blank") return true;
  if (value.startsWith("data:") || value.startsWith("blob:")) return true;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname || "";

    const hostOk =
      host === "youtube.com" ||
      host === "youtube-nocookie.com" ||
      host === "googlevideo.com" ||
      host === "ytimg.com" ||
      host === "ggpht.com" ||
      host === "google.com" ||
      host === "gstatic.com" ||
      host === "googleapis.com" ||
      host === "youtube.googleapis.com" ||
      host.endsWith(".youtube.com") ||
      host.endsWith(".googlevideo.com") ||
      host.endsWith(".ytimg.com") ||
      host.endsWith(".ggpht.com") ||
      host.endsWith(".gstatic.com");

    if (!hostOk) return false;

    // Block full YouTube browsing destinations (keep users on the embed player).
    if (
      host === "youtu.be" ||
      path === "/" ||
      path.startsWith("/watch") ||
      path.startsWith("/shorts/") ||
      path.startsWith("/results") ||
      path.startsWith("/feed") ||
      path.startsWith("/channel") ||
      path.startsWith("/@") ||
      path.startsWith("/user/") ||
      path.startsWith("/playlist")
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
