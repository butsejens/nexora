type PageRequestEvent = {
  page: string;
  method: string;
  route: string;
  status?: number;
  durationMs?: number;
  kind: "network" | "error";
};

type PageStats = {
  opens: number;
  requests: number;
  duplicateRequests: number;
  lastOpenedAt: string;
  lastRequestAt?: string;
};

const OFFSCREEN_PAGE = "__offscreen__";

let activePage = "";
const statsByPage = new Map<string, PageStats>();
const requestKeyCounter = new Map<string, number>();

function ensureStats(page: string): PageStats {
  const existing = statsByPage.get(page);
  if (existing) return existing;
  const initial: PageStats = {
    opens: 0,
    requests: 0,
    duplicateRequests: 0,
    lastOpenedAt: new Date(0).toISOString(),
  };
  statsByPage.set(page, initial);
  return initial;
}

export function setActivePage(pageName: string): void {
  const page = String(pageName || "").trim() || OFFSCREEN_PAGE;
  activePage = page;
  requestKeyCounter.clear();

  const stats = ensureStats(page);
  stats.opens += 1;
  stats.lastOpenedAt = new Date().toISOString();

  if (__DEV__) {
    console.info(`[page-only] active page: ${page}`);
  }
}

export function clearActivePage(pageName?: string): void {
  if (!activePage) return;
  if (pageName && activePage !== pageName) return;
  if (__DEV__) {
    console.info(`[page-only] page blurred: ${activePage}`);
  }
  activePage = "";
  requestKeyCounter.clear();
}

export function getActivePage(): string {
  return activePage || OFFSCREEN_PAGE;
}

export function recordPageRequest(event: Omit<PageRequestEvent, "page">): void {
  const page = getActivePage();
  const stats = ensureStats(page);
  stats.requests += 1;
  stats.lastRequestAt = new Date().toISOString();

  const requestKey = `${event.method.toUpperCase()} ${event.route}`;
  const seen = (requestKeyCounter.get(requestKey) || 0) + 1;
  requestKeyCounter.set(requestKey, seen);
  if (seen > 1) {
    stats.duplicateRequests += 1;
  }

  if (__DEV__) {
    console.info("[page-only] request", {
      page,
      method: event.method,
      route: event.route,
      status: event.status,
      durationMs: event.durationMs,
      kind: event.kind,
      duplicate: seen > 1,
      countThisPageOpen: stats.requests,
    });
  }
}

export function getPageOnlySnapshot(): Record<string, PageStats> {
  const out: Record<string, PageStats> = {};
  for (const [page, stats] of statsByPage.entries()) {
    out[page] = { ...stats };
  }
  return out;
}
