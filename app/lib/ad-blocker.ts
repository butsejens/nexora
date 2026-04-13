/**
 * Shared ad-blocking infrastructure for all WebView-based video players.
 * Single source of truth — used by the main player flow in player.tsx.
 */

/** Domains to block at the URL level (navigation intercept) */
export const AD_DOMAINS: readonly string[] = [
  // Major ad networks
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "google-analytics.com",
  "adservice.google",
  "pagead2.googlesyndication",
  "ads.yahoo.com",
  "amazon-adsystem.com",
  "adsrvr.org",
  "adnxs.com",
  "adskeeper.co.uk",
  "adskeeper.com",
  "adsterra.com",
  "adtelligent.com",
  "bidswitch.net",
  "casalemedia.com",
  "criteo.com",
  "demdex.net",
  "exoclick.com",
  "hilltopads.net",
  "juicyads.com",
  "moatads.com",
  "outbrain.com",
  "popads.net",
  "popcash.net",
  "propellerads.com",
  "pubmatic.com",
  "revenuehits.com",
  "richpush.co",
  "rubiconproject.com",
  "smartadserver.com",
  "taboola.com",
  "trafficjunky.com",
  "trafficstars.com",
  "yieldmo.com",
  "mgid.com",
  "revcontent.com",
  "zedo.com",
  "lqm.io",
  "serving-sys.com",
  // Popup / redirect networks
  "popunder.net",
  "pushame.com",
  "pushwhy.com",
  "pushground",
  "clickadu",
  "clickaine.com",
  "onclkds.com",
  "ad-maven",
  "admaven",
  "adf.ly",
  "bc.vc",
  "sh.st",
  // Tracking / analytics
  "pixel.facebook.com",
  "analytics.tiktok.com",
  "mc.yandex.ru",
  "an.yandex.ru",
  "cdn.onthe.io",
  "whos.amung.us",
  // Casino / gambling / betting
  "casino",
  "betting",
  "bet365",
  "1xbet",
  "22bet",
  "melbet",
  "linebet",
  "mostbet",
  "betano",
  "pinnacle.com",
  "stake.com",
  "betway",
  "bwin",
  "unibet",
  "pokerstars",
  "888casino",
  "williamhill",
  "ladbrokes",
  "paddy",
  "sportingbet",
  "netbet",
  "vulkan",
  "slottica",
  "spinamba",
  "freshcasino",
  "drip-casino",
  "casinox",
  "jvspin",
  "fairspin",
  "bitstarz",
  "jackpot",
  "roulette",
  "slot-machine",
  "spin-wheel",
  "bonusgame",
  // Syndication / embed ad scripts
  "syndication.realsrv.com",
  "tsyndicate.com",
  "push.zeroredirect",
  "aclib",
  "acscdn.com",
  "ad.html",
  "cdn-lab.shop",
  "flashscore.com/banner",
  // Store redirects
  "apps.apple.com",
  "play.google.com",
  "itunes.apple.com",
];

/** Check if a URL matches a blocked ad domain */
export function isBlockedUrl(url: string): boolean {
  const lower = String(url || "").toLowerCase();
  return AD_DOMAINS.some((domain) => lower.includes(domain));
}

/** Check if a URL path contains ad patterns */
export function isBlockedPath(url: string): boolean {
  return /\/ads\/|\/ad\/|\/adserv|popunder|popclick|clickunder|casino|gambling|betting|slot[_-]|poker|roulette|jackpot|spin[_-]?wheel|bonus[_-]?game|free[_-]?spin/i.test(
    url,
  );
}

/** Full navigation check — used in WebView onShouldStartLoad */
export function isAllowedNavigation(url: string): boolean {
  const value = String(url || "").trim();
  if (!value) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  if (isBlockedUrl(value)) return false;
  if (isBlockedPath(value)) return false;
  return true;
}

/** Content keywords that indicate an ad takeover page */
const AD_CONTENT_KEYWORDS = [
  "casino",
  "spin the wheel",
  "jackpot",
  "free spins",
  "slot",
  "roulette",
  "bonus game",
  "get your bonus",
  "deposit now",
  "play now",
  "sign up bonus",
  "welcome bonus",
  "gambling",
  "poker",
  "blackjack",
  "sportbet",
  "betting odds",
];

/**
 * Comprehensive ad-blocker JavaScript injected into embed WebViews.
 * Blocks popups, removes ad DOM nodes, detects ad pages, and signals
 * back to React Native via postMessage.
 */
export const AD_BLOCK_JS = `
(function() {
  'use strict';

  /* ── 0. Kill ad libraries BEFORE they load ──────────────── */
  window.aclib = { runPop: function(){}, runBanner: function(){}, runNative: function(){} };
  window.popns = { init: function(){} };
  try { Object.defineProperty(window, 'aclib', { value: window.aclib, writable: false }); } catch(e) {}
  window.open = function() { return null; };
  window.alert = function() {};
  window.confirm = function() { return false; };
  window.prompt = function() { return null; };

  /* ── 1. Detect full-page ad takeover (casino etc) ────────── */
  var adContentKeywords = ${JSON.stringify(AD_CONTENT_KEYWORDS)};
  function isAdPage() {
    var title = (document.title || '').toLowerCase();
    var body = (document.body && document.body.innerText || '').toLowerCase().slice(0, 3000);
    var url = (window.location.href || '').toLowerCase();
    var hits = 0;
    for (var i = 0; i < adContentKeywords.length; i++) {
      if (title.indexOf(adContentKeywords[i]) !== -1 || body.indexOf(adContentKeywords[i]) !== -1 || url.indexOf(adContentKeywords[i]) !== -1) hits++;
    }
    if (/casino|gambling|betting|slot|poker|roulette|jackpot|1xbet|bet365|betano|melbet|mostbet|22bet/i.test(url)) return true;
    return hits >= 2;
  }

  function handleAdPage() {
    if (isAdPage()) {
      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ad-detected' })); } catch(e) {}
      try { history.back(); } catch(e) {}
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#666;font-family:sans-serif;text-align:center;padding:20px"><p>Reclame geblokkeerd.<br>Kies een andere server.</p></div>';
      return true;
    }
    return false;
  }

  /* ── 1b. Detect "content not found" errors ───────────────── */
  var notFoundPhrases = [
    'object can not be found', 'object cannot be found', 'not found here',
    'no sources found', 'no links found', 'no video found',
    'content not available', 'content is not available',
    'this content is unavailable', 'media not found', 'video not found',
    'movie not found', 'episode not found', 'source not found',
    'could not find', 'we can\\'t find', 'something went wrong',
    'failed to load', 'unavailable for this', 'not available in your',
    'no playable sources', 'no streams found', 'no server available'
  ];
  var notFoundSignaled = false;
  function checkContentNotFound() {
    if (notFoundSignaled) return false;
    var body = (document.body && document.body.innerText || '').toLowerCase().trim();
    if (body.length > 5000) return false;
    for (var i = 0; i < notFoundPhrases.length; i++) {
      if (body.indexOf(notFoundPhrases[i]) !== -1) {
        notFoundSignaled = true;
        try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'content-not-found' })); } catch(e) {}
        return true;
      }
    }
    return false;
  }

  /* ── 2. CSS ad-hiding with player protection ─────────────── */
  var style = document.createElement('style');
  style.textContent = [
    '[class*="ad-"],[class*="ad_"],[class*="ads-"],[class*="ads_"],',
    '[class*="advert"],[class*="banner"],[id*="ad-"],[id*="ad_"],',
    '[id*="ads-"],[id*="ads_"],[id*="advert"],[id*="banner"],',
    '[class*="popup"],[class*="Popup"],[id*="popup"],[id*="Popup"],',
    '[class*="overlay"]:not(video):not([class*="player"]):not([class*="vjs"]):not([class*="caption"]):not([class*="subtitle"]):not([class*="track"]),',
    '[class*="modal"]:not([class*="player"]):not([class*="vjs"]):not([class*="caption"]):not([class*="subtitle"]):not([class*="track"]),',
    '[class*="coin-hive"],[class*="coinhive"],',
    'iframe[src*="ads"],iframe[src*="banner"],iframe[src*="pop"],',
    'iframe[src*="ad.html"],iframe[src*="casino"],iframe[src*="bet"],',
    'iframe#close,',
    'a[href*="1xbet"],a[href*="bet365"],a[href*="betano"],',
    'a[href*="22bet"],a[href*="melbet"],a[href*="mostbet"],',
    'a[href*="casino"],a[href*="gambling"],a[href*="betting"],',
    'a[target="_blank"][rel*="noopener"][class*="ad"],',
    'div[class*="sticky-ad"],div[class*="floating"],',
    'div[style*="z-index: 2147483647"],div[style*="z-index:2147483647"],',
    'div[style*="z-index: 99999"],div[style*="z-index:99999"],',
    '.ad-container,.ad-overlay,.ad-wrap,.ad_wrap,',
    '#player-ads,.player-ads,.vast-blocker',
    '{ display:none!important; visibility:hidden!important;',
    '  width:0!important; height:0!important;',
    '  pointer-events:none!important; }',
    '',
    'video,iframe[src*="embed"],iframe[allowfullscreen],#player,',
    '[class*="player"],[class*="vjs"],[id*="player"]',
    '{ display:block!important; visibility:visible!important; }',
    '',
    '[class*="caption"],[class*="Caption"],[class*="subtitle"],[class*="Subtitle"],',
    '[class*="text-track"],[class*="TextTrack"],.jw-captions,.jw-text-track-display,',
    '.vjs-text-track-display,.plyr__captions,[data-testid*="caption"],[data-testid*="subtitle"]',
    '{ z-index:2147483646!important; position:absolute!important; pointer-events:none!important; }',
    '',
    '.jw-captions,.jw-text-track-display,.vjs-text-track-display,.plyr__captions',
    '{ inset:auto 0 8% 0!important; }',
    '',
    'video::cue { background: rgba(0,0,0,0.72)!important; color:#fff!important; text-shadow: 0 1px 2px rgba(0,0,0,0.9)!important; }'
  ].join('\\n');
  (document.head || document.documentElement).appendChild(style);

  /* ── 3. Smart DOM cleaner ────────────────────────────────── */
  var adPatterns = /ad[_-]|ads[_-]|advert|banner|popup|overlay|sticky|floating|coin-?hive|casino|gambl|betting/i;
  var protectedPatterns = /player|video|stream|embed|controls|vjs|plyr|jw-|caption|subtitle|text-track|cue/i;

  function isAdNode(el) {
    if (!el || !el.className) return false;
    var cl = (typeof el.className === 'string') ? el.className : '';
    var id = el.id || '';
    if (protectedPatterns.test(cl) || protectedPatterns.test(id)) return false;
    if (el.querySelector && el.querySelector('video')) return false;
    return adPatterns.test(cl) || adPatterns.test(id);
  }

  /* ── 4. MutationObserver: intercept new ad nodes ─────────── */
  function startObserver() {
    var target = document.body || document.documentElement;
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeType !== 1) continue;
          if (isAdNode(node)) { node.remove(); continue; }
          var iframes = node.querySelectorAll ? node.querySelectorAll('iframe') : [];
          for (var k = 0; k < iframes.length; k++) {
            var src = (iframes[k].src || '').toLowerCase();
            if (/ads|banner|pop|click|casino|bet|gambl/i.test(src) && !/embed|stream|player/i.test(src)) {
              iframes[k].remove();
            }
          }
          if (node.getBoundingClientRect) {
            var rect = node.getBoundingClientRect();
            if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8) {
              if (!protectedPatterns.test(node.className || '') && !protectedPatterns.test(node.id || '') && !node.querySelector('video')) {
                node.remove();
              }
            }
          }
        }
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  /* ── 5. Purge existing ad elements ───────────────────────── */
  function purgeAds() {
    if (handleAdPage()) return;
    document.querySelectorAll(
      '[class*="ad-"],[class*="ad_"],[class*="ads-"],[class*="ads_"],'+
      '[class*="advert"],[id*="advert"],[class*="popup"],'+
      'a[href*="1xbet"],a[href*="bet365"],a[href*="22bet"],a[href*="betano"],'+
      'a[href*="melbet"],a[href*="mostbet"],a[href*="casino"],a[href*="gambling"]'
    ).forEach(function(el) {
      if (!protectedPatterns.test(el.className || '') && !protectedPatterns.test(el.id || '')) {
        el.remove();
      }
    });
    document.querySelectorAll('div,section,aside,main').forEach(function(el) {
      var z = parseInt(window.getComputedStyle(el).zIndex || '0');
      if (z > 900 && !protectedPatterns.test(el.className || '') && !protectedPatterns.test(el.id || '') && !el.querySelector('video')) {
        el.remove();
      }
    });
  }

  /* ── 6. Block click-jacking and ad redirects ─────────────── */
  document.addEventListener('click', function(e) {
    var t = e.target;
    while (t && t !== document.body) {
      if (t.tagName === 'A') {
        var href = (t.href || '').toLowerCase();
        if (/1xbet|bet365|betano|22bet|melbet|linebet|mostbet|popads|clickadu|adsterra|casino|gambling|betting|slot|poker/i.test(href)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        // Block App Store / Play Store redirects
        if (/apps\\.apple\\.com|play\\.google\\.com|itunes\\.apple\\.com/i.test(href)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
      t = t.parentElement;
    }
  }, true);

  /* ── 7. Block external intents (Android) ─────────────────── */
  if (window.location) {
    var origAssign = window.location.assign;
    window.location.assign = function(url) {
      if (/^(intent|market|itms|fb|tiktok):/i.test(url)) return;
      origAssign.call(window.location, url);
    };
  }

  /* ── 8. Initialize + periodic re-check ───────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { purgeAds(); startObserver(); });
  } else {
    purgeAds();
    startObserver();
  }
  setTimeout(purgeAds, 1500);
  setTimeout(purgeAds, 4000);
  setTimeout(purgeAds, 8000);
  setTimeout(checkContentNotFound, 2000);
  setTimeout(checkContentNotFound, 5000);
  setTimeout(checkContentNotFound, 10000);

  true;
})();
`;
