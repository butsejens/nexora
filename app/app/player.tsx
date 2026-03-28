import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Platform,
  ActivityIndicator,
  Share,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import WebView from "react-native-webview";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { SafeHaptics } from "@/lib/safeHaptics";
import { openInVlc } from "@/lib/vlc";
import { buildErrorReference } from "@/lib/error-messages";
import { SilentResetBoundary } from "@/components/SilentResetBoundary";
import {
  startSession, sendHeartbeat, stopSession,
  signStream,
} from "@/lib/playback-engine";
import {
  fetchSubtitles, getBestTrack,
} from "@/lib/subtitle-manager";
import type { SubtitleTrack } from "@/lib/subtitle-manager";

// ─── Stream providers ──────────────────────────────────────────────────────────
const STREAM_PROVIDERS = [
  { id: "videasy",      label: "Server 1"  },
  { id: "autoembed",    label: "Server 2"  },
  { id: "vidsrcto",     label: "Server 3"  },
  { id: "vidsrcnl",     label: "Server 4"  },
  { id: "vidsrccc",     label: "Server 5"  },
  { id: "superembed",   label: "Server 6"  },
  { id: "vidsrcme",     label: "Server 7"  },
  { id: "2embed",       label: "Server 8"  },
  { id: "moviesapi",    label: "Server 9"  },
  { id: "vidsrcxyz",    label: "Server 10" },
  { id: "vidsrcdev",    label: "Server 11" },
  { id: "vidsrcicu",    label: "Server 12" },
  { id: "smashystream", label: "Server 13" },
  { id: "flicky",       label: "Server 14" },
  { id: "vidsrcvip",    label: "Server 15" },
  { id: "2embedskin",   label: "Server 16" },
  { id: "novafork",     label: "Server 17" },
  { id: "embedrise",    label: "Server 18" },
  { id: "embedflix",    label: "Server 19" },
  { id: "vidsrcnet",    label: "Server 20" },
  { id: "111movies",    label: "Server 21" },
  { id: "primewire",    label: "Server 22" },
  { id: "susflix",      label: "Server 23" },
  { id: "fsapi",        label: "Server 24" },
];

function withEmbedAutoplayParams(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const params = [
      ["autoplay", "1"],
      ["autoPlay", "1"],
      ["autostart", "true"],
      ["muted", "0"],
      ["mute", "0"],
      ["playsinline", "1"],
    ];
    for (const [key, value] of params) {
      if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function getEmbedUrl(provider: string, tmdbId: string, type: string, season: string, episode: string): string {
  const s = season || "1";
  const e = episode || "1";
  const isMovie = type !== "series";
  switch (provider) {
    case "vidsrcto":
      return isMovie
        ? `https://vidsrc.to/embed/movie/${tmdbId}`
        : `https://vidsrc.to/embed/tv/${tmdbId}/${s}/${e}`;
    case "autoembed":
      return isMovie
        ? `https://autoembed.co/movie/tmdb/${tmdbId}`
        : `https://autoembed.co/tv/tmdb/${tmdbId}-${s}-${e}`;
    case "2embed":
      return isMovie
        ? `https://www.2embed.cc/embed/${tmdbId}`
        : `https://www.2embed.cc/embedtv/${tmdbId}&s=${s}&e=${e}`;
    case "moviesapi":
      return isMovie
        ? `https://moviesapi.club/movie/${tmdbId}`
        : `https://moviesapi.club/tv/${tmdbId}-${s}-${e}`;
    case "vidsrcme":
      return isMovie
        ? `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`
        : `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${s}&episode=${e}`;
    case "vidsrcxyz":
      return isMovie
        ? `https://vidsrc.xyz/embed/movie?tmdb=${tmdbId}`
        : `https://vidsrc.xyz/embed/tv?tmdb=${tmdbId}&season=${s}&episode=${e}`;

    case "vidsrcicu":
      return isMovie
        ? `https://vidsrc.icu/embed/movie/${tmdbId}`
        : `https://vidsrc.icu/embed/tv/${tmdbId}/${s}/${e}`;
    case "videasy":
      return isMovie
        ? `https://player.videasy.net/movie/${tmdbId}`
        : `https://player.videasy.net/tv/${tmdbId}/${s}/${e}`;

    case "111movies":
      return isMovie
        ? `https://111movies.com/movie/${tmdbId}`
        : `https://111movies.com/tv/${tmdbId}/${s}/${e}`;
    case "smashystream":
      return isMovie
        ? `https://player.smashystream.com/movie/${tmdbId}`
        : `https://player.smashystream.com/tv/${tmdbId}/${s}/${e}`;


    case "primewire":
      return isMovie
        ? `https://www.primewire.tf/embed/movie?tmdb=${tmdbId}`
        : `https://www.primewire.tf/embed/tv?tmdb=${tmdbId}&season=${s}&episode=${e}`;
    case "superembed":
      return isMovie
        ? `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=1`
        : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${s}&e=${e}`;


    case "vidsrcnl":
      return isMovie
        ? `https://player.vidsrc.nl/embed/movie/${tmdbId}`
        : `https://player.vidsrc.nl/embed/tv/${tmdbId}/${s}/${e}`;
    case "vidsrccc":
      return isMovie
        ? `https://vidsrc.cc/v2/embed/movie/${tmdbId}`
        : `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${s}/${e}`;
    case "vidsrcdev":
      return isMovie
        ? `https://vidsrc.dev/embed/movie/${tmdbId}`
        : `https://vidsrc.dev/embed/tv/${tmdbId}/${s}/${e}`;
    case "flicky":
      return isMovie
        ? `https://flicky.host/embed/movie/?id=${tmdbId}`
        : `https://flicky.host/embed/tv/?id=${tmdbId}&s=${s}&e=${e}`;
    case "2embedskin":
      return isMovie
        ? `https://www.2embed.skin/embed/${tmdbId}`
        : `https://www.2embed.skin/embedtv/${tmdbId}&s=${s}&e=${e}`;
    case "novafork":
      return isMovie
        ? `https://nova.wafflehacker.io/embed/movie/${tmdbId}`
        : `https://nova.wafflehacker.io/embed/tv/${tmdbId}/${s}/${e}`;
    case "vidsrcvip":
      return isMovie
        ? `https://vidsrc.vip/embed/movie/${tmdbId}`
        : `https://vidsrc.vip/embed/tv/${tmdbId}/${s}/${e}`;
    case "embedrise":
      return isMovie
        ? `https://embedrise.com/embed/movie/${tmdbId}`
        : `https://embedrise.com/embed/tv/${tmdbId}/${s}/${e}`;
    case "embedflix":
      return isMovie
        ? `https://embedflix.net/embed/movie/${tmdbId}`
        : `https://embedflix.net/embed/tv/${tmdbId}/${s}/${e}`;
    case "vidsrcnet":
      return isMovie
        ? `https://vidsrc.net/embed/movie/${tmdbId}`
        : `https://vidsrc.net/embed/tv/${tmdbId}/${s}/${e}`;
    case "susflix":
      return isMovie
        ? `https://susflix.tv/embed/movie/${tmdbId}`
        : `https://susflix.tv/embed/tv/${tmdbId}/${s}/${e}`;
    case "fsapi":
      return isMovie
        ? `https://fsapi.xyz/movie-tmdb/${tmdbId}`
        : `https://fsapi.xyz/tv-tmdb/${tmdbId}-${s}-${e}`;
    default:
      return isMovie
        ? `https://vidsrc.to/embed/movie/${tmdbId}`
        : `https://vidsrc.to/embed/tv/${tmdbId}/${s}/${e}`;
  }
}

// ─── Ad domains (network-level blocking) ───────────────────────────────────────
const AD_DOMAINS = [
  "googlesyndication.com", "doubleclick.net", "googleadservices.com",
  "adnxs.com", "pubmatic.com", "openx.net", "rubiconproject.com",
  "casalemedia.com", "advertising.com", "adform.net", "criteo.com",
  "exoclick.com", "juicyads.com", "popads.net", "popcash.net",
  "trafficjunky.net", "adsterra.com", "hilltopads.net", "ero-advertising.com",
  "adspyglass.com", "royalads.net", "adcash.com", "propellerads.com",
  "clickadu.com", "plugrush.com", "trc.taboola.com", "cdn.taboola.com",
  "outbrain.com", "media.net", "revcontent.com", "mgid.com", "bidvertiser.com",
  "betrad.com", "adf.ly", "shorte.st", "linkvertise.com", "ouo.io",
  "bc.vc", "clk.sh", "shrink.pe", "adskeeper.com", "ad-maven.com",
  "admaven.com", "mavenfall.com", "hpyrdr.com", "offerimage.com",
  "s0yb.com", "whos.amung.us", "turn.com",
  "yieldmanager.com", "yieldmo.com", "zedo.com", "serving-sys.com",
  "smartadserver.com", "spotxchange.com", "spotx.tv", "smaato.com",
  "mopub.com", "moatads.com", "chartbeat.com", "scorecardresearch.com",
  "amazon-adsystem.com", "ads-twitter.com",
  "popunder.net", "popmyads.com", "richpush.co", "megapush.com",
  "onclkds.com", "revenuehits.com", "yllix.com", "loopme.com",
  "inmobi.com", "vungle.com", "chartboost.com", "ironsrc.com",
  "mixpanel.com", "segment.io", "hotjar.com", "fullstory.com",
  "mouseflow.com", "crazyegg.com", "luckyorange.com",
  "acscdn.com", "cloudfront.net/ad", "bongacams.com", "chaturbate.com",
  "livejasmin.com", "stripchat.com", "cam4.com", "camsoda.com",
  "tinyurl.com", "bit.ly", "goo.gl", "clck.ru",
  "pushground.com", "a-ads.com", "roller-ads.com", "rollerads.com",
  "notix.io", "pushwoosh.com", "pushcrew.com", "pn.vg",
  "push.house", "pushame.com", "gravitec.net", "sendpulse.com",
  "optad360.io", "setupad.com", "snigel.com", "raptive.com",
  "monetag.com", "ads-monetag.com",
];

const TRAILER_TRUSTED_HOST_SNIPPETS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "ytimg.com",
  "i.ytimg.com",
  "googlevideo.com",
  "youtubei.googleapis.com",
  "googleapis.com",
  "gstatic.com",
  "googleusercontent.com",
  "ggpht.com",
];

function isTrustedTrailerHost(hostname: string): boolean {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  return TRAILER_TRUSTED_HOST_SNIPPETS.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
}

function toYouTubeEmbedUrl(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const asEmbed = (key: string) => `https://www.youtube.com/embed/${encodeURIComponent(key)}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent("https://www.youtube.com")}`;
  if (/^[A-Za-z0-9_-]{6,}$/.test(raw)) return asEmbed(raw);
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const keyFromQuery = parsed.searchParams.get("v");
    if (keyFromQuery && /^[A-Za-z0-9_-]{6,}$/.test(keyFromQuery.trim())) return asEmbed(keyFromQuery.trim());
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const tail = String(pathParts[pathParts.length - 1] || "").trim();
    if (host.includes("youtu.be") && /^[A-Za-z0-9_-]{6,}$/.test(tail)) return asEmbed(tail);
    if (host.includes("youtube") && pathParts[0] === "embed" && /^[A-Za-z0-9_-]{6,}$/.test(tail)) return asEmbed(tail);
    if (host.includes("youtube") && pathParts[0] === "shorts" && /^[A-Za-z0-9_-]{6,}$/.test(tail)) return asEmbed(tail);
  } catch {
    const match = raw.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/i);
    if (match?.[1]) return asEmbed(String(match[1]).trim());
  }
  return null;
}

function extractYouTubeKey(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[A-Za-z0-9_-]{6,}$/.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const byQuery = String(parsed.searchParams.get("v") || "").trim();
    if (/^[A-Za-z0-9_-]{6,}$/.test(byQuery)) return byQuery;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const tail = String(parts[parts.length - 1] || "").trim();
    if (host.includes("youtu.be") && /^[A-Za-z0-9_-]{6,}$/.test(tail)) return tail;
    if (host.includes("youtube") && /^[A-Za-z0-9_-]{6,}$/.test(tail)) return tail;
  } catch {
    const match = raw.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/i);
    if (match?.[1]) return String(match[1]).trim();
  }
  return "";
}

// ─── JS injected in embed WebView ─────────────────────────────────────────────
// Strategy: allow exactly 1 user click (to start playback), then block everything.
// Once a video element is detected playing, block all non-player interactions.
const AD_BLOCK_JS = `
(function(){
  // ── Patch removeChild to never throw (prevents DOMException crashes) ───────
  try{
    var _origRc = Node.prototype.removeChild;
    Node.prototype.removeChild = function(child){
      try{ return _origRc.call(this, child); }catch(e){ return child; }
    };
  }catch(e){}

  var _host = window.location.hostname;
  var _videoFound = false;

  // ── 0. CSS injection: hide ad/overlay patterns immediately ───────────────
  (function(){
    var s = document.createElement('style');
    s.textContent =
      '[class*="vpn"],[class*="consent"],[class*="cookie"],[id*="cookie"],' +
      '[class*="gdpr"],[id*="gdpr"],[class*="subscribe"],[class*="subscription"],' +
      '[class*="paywall"],[class*="gate-"],[id*="consent"],[class*="promo"],' +
      '[id*="promo"],[class*="notification-bar"],[class*="sticky-ad"],' +
      '[class*="interstitial"],[id*="interstitial"],[class*="lightbox"]:not([class*="player"]),' +
      '[class*="fancybox"],[class*="remodal"],[class*="swal"],' +
      '[class*="ad-overlay"],[class*="ad_overlay"],[id*="ad-overlay"],[id*="ad_overlay"],' +
      '[class*="popover"]:not([class*="player"]),[class*="backdrop"]:not([class*="player"]):not([class*="video"]),' +
      'a[href*="utm_"]:not([class*="play"]):not([class*="video"]),' +
      '[class*="ad-container"],[class*="ad_container"],[id*="ad-container"],[id*="ad_container"],' +
      '[class*="adunit"],[class*="ad-unit"],[class*="ad_unit"],' +
      '[class*="sponsor"],[id*="sponsor"]' +
      '{ display:none!important; visibility:hidden!important; opacity:0!important; pointer-events:none!important; }';
    (document.head||document.documentElement).appendChild(s);
  })();

  // ── 1. Block ALL popups / new windows ────────────────────────────────────
  window.open = function(){ return null; };
  window.alert = function(){};
  window.confirm = function(){ return true; };
  window.prompt = function(){ return ''; };
  // Block notification/permission popups used by ad providers
  try{ window.Notification = { requestPermission: function(cb){ if(cb) cb('denied'); return Promise.resolve('denied'); }, permission: 'denied' }; }catch(e){}
  try{ if(navigator.serviceWorker){ navigator.serviceWorker.register = function(){ return Promise.reject('blocked'); }; } }catch(e){}
  try{ navigator.permissions.query = function(desc){ return Promise.resolve({ state: desc && desc.name === 'notifications' ? 'denied' : 'granted', onchange: null }); }; }catch(e){}
  var _swallowRemoveChildError = function(msg){
    var text = String(msg || '').toLowerCase();
    return text.includes('removechild') || text.includes('notfounderror') || text.includes('not a child') || text.includes('hierarchyrequesterror');
  };
  window.onerror = function(message, source, lineno, colno, error){
    var msg = error ? String(error.message || error.name || message || '') : String(message || '');
    if (_swallowRemoveChildError(msg)) return true;
    return false;
  };
  window.addEventListener('error', function(ev){
    try{
      var msg = ev.error ? String(ev.error.message || ev.error.name || '') : String(ev.message || '');
      if(_swallowRemoveChildError(msg)){ ev.preventDefault(); ev.stopImmediatePropagation(); }
    }catch(e){}
  }, true);
  window.addEventListener('unhandledrejection', function(event){
    try{
      var reason = event && event.reason ? (event.reason.message || event.reason) : '';
      if (_swallowRemoveChildError(reason)) {
        event.preventDefault();
      }
    }catch(e){}
  });
  window.addEventListener('beforeunload', function(e){ e.stopImmediatePropagation(); }, true);
  window.onbeforeunload = null;
  try{ Object.defineProperty(window, 'onbeforeunload', { get:function(){return null;}, set:function(){}, configurable:true }); }catch(e){}

  // ── Helper: check if element is part of the video player ───────────────
  function _isPlayerElement(el){
    if(!el) return false;
    for(var i=0; i<12; i++){
      if(!el) break;
      if(el.tagName === 'VIDEO' || el.tagName === 'CANVAS') return true;
      var id = (el.id||'').toLowerCase();
      var cn = (typeof el.className === 'string' ? el.className : '').toLowerCase();
      if(id.match(/player|video|stream|hls|plyr|jwplayer|vjs|controls/) ||
         cn.match(/player|video|stream|hls|plyr|jwplayer|vjs|controls|play-btn|play_btn/)) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ── Helper: check if video is playing ──────────────────────────────────
  function _isVideoPlaying(){
    var videos = document.querySelectorAll('video');
    for(var i=0; i<videos.length; i++){
      if(!videos[i].paused && videos[i].readyState >= 2) return true;
    }
    return false;
  }

  // ── 2. Click gate: allow playback interactions, block ad redirects ─────
  // Ad URL patterns (always blocked, even on first click)
    var _adPatterns = [
    /doubleclick\\.net/i, /googlesyndication/i, /googleadservices/i,
    /adnxs\\.com/i, /exoclick/i, /juicyads/i, /popads\\.net/i, /popcash/i,
    /trafficjunky/i, /adsterra/i, /hilltopads/i, /propellerads/i,
    /clickadu/i, /plugrush/i, /adcash/i, /admaven/i, /popunder/i,
    /revenuehits/i, /onclkds/i, /adf\\.ly/i, /shorte\\.st/i,
    /bet365|1xbet|stake\\.com|betway|casino|gambling|poker/i,
    /vpn|norton|mcafee|avast|cleanmaster/i,
    /play\.google\.com\/store/i, /apps\.apple\.com/i,
    /install\s+and\s+continue\s+watching/i,
    /monetag|ads-monetag|pushground|roller-?ads|notix\.io/i,
    /push\.house|pushame|gravitec|sendpulse/i,
    /optad360|setupad|snigel|raptive/i,
  ];
  function _isAdUrl(href){
    if(!href) return false;
    for(var i=0;i<_adPatterns.length;i++){ if(_adPatterns[i].test(href)) return true; }
    return false;
  }

  document.addEventListener('click', function(e){
    var el = e.target;

    // Always allow clicks on video/player elements (play/pause, controls, etc.)
    if(_isPlayerElement(el)) return;

    // Always block ad URLs
    var link = el; for(var i=0;i<8;i++){ if(!link)break; if(link.tagName==='A'){
      var href = link.getAttribute('href')||'';
      var target = link.getAttribute('target')||'';
      if(target==='_blank'||target==='_top'||target==='_parent'||_isAdUrl(href)){
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); return false;
      } break;
    } link=link.parentElement; }

    // If video is already playing, block ALL non-player clicks
    if(_videoFound || _isVideoPlaying()){
      _videoFound = true;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); return false;
    }

    // Before playback starts: allow interaction so player can initialize.
    // Off-domain popup redirects are still blocked by nav guards + ad URL checks.
    return;
  }, true);

  // Also block touch events after first click (mobile ad popups use touchstart)
  document.addEventListener('touchstart', function(e){
    if(_isPlayerElement(e.target)) return;
    if(_videoFound || _isVideoPlaying()){
      _videoFound = true;
      if(!_isPlayerElement(e.target)){
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      }
    }
  }, true);

  // ── 2b. Intercept dynamically added click listeners that open ads ─────
  var _origAddEvent = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, fn, opts){
    if((type === 'touchstart' || type === 'mousedown' || type === 'pointerdown') &&
       (this === document.body || this === document.documentElement || this === document)){
      return;
    }
    return _origAddEvent.call(this, type, fn, opts);
  };

  // ── 3. Block location navigation off-domain ──────────────────────────
  (function(){
    var _isSafe = function(u){
      try{ var h = new URL(String(u), window.location.href).hostname;
           return h === _host || h.endsWith('.'+_host); }catch(e){ return false; }
    };
    try{
      var _assign  = window.location.assign.bind(window.location);
      var _replace = window.location.replace.bind(window.location);
      window.location.assign  = function(u){ if(_isSafe(u)) _assign(u);  };
      window.location.replace = function(u){ if(_isSafe(u)) _replace(u); };
    }catch(e){}
    try{
      var _locDesc = Object.getOwnPropertyDescriptor(window, 'location');
      if(!_locDesc || _locDesc.configurable){
        Object.defineProperty(window, 'location', {
          get: function(){ return _locDesc ? _locDesc.get.call(window) : location; },
          set: function(v){ if(_isSafe(String(v))){ if(_locDesc && _locDesc.set) _locDesc.set.call(window, v); } },
          configurable: true
        });
      }
    }catch(e){}
    try{ if(top !== window){ top.location.assign = window.location.assign; top.location.replace = window.location.replace; }}catch(e){}
  })();

  // ── 4. Remove meta-refresh redirects + ad iframes/scripts ─────────────
  (function(){
    var removeRefresh = function(){
      document.querySelectorAll('meta[http-equiv]').forEach(function(m){
        if((m.getAttribute('http-equiv')||'').toLowerCase() === 'refresh') m.remove();
      });
    };
    if(document.readyState !== 'loading'){ removeRefresh(); }
    else{ document.addEventListener('DOMContentLoaded', removeRefresh); }
    new MutationObserver(function(muts){
      muts.forEach(function(mut){
        mut.addedNodes.forEach(function(n){
          try{ if(n.nodeType===1 && n.tagName==='META' && (n.getAttribute('http-equiv')||'').toLowerCase()==='refresh') n.remove(); }catch(e){}
          try{ if(n.nodeType===1 && n.tagName==='IFRAME'){ var src=n.getAttribute('src')||''; if(_isAdUrl(src)) n.remove(); } }catch(e){}
          try{ if(n.nodeType===1 && n.tagName==='SCRIPT'){ var src=n.getAttribute('src')||''; if(_isAdUrl(src)) n.remove(); } }catch(e){}
        });
      });
    }).observe(document.documentElement||document.body||document, {childList:true, subtree:true});
  })();

  // ── 5. Remove ad overlays / popups aggressively ──────────────────────
  var AD_SELECTORS = [
    'ins.adsbygoogle', '[id*="ad-"]', '[id*="ads-"]', '[class*="advert"]',
    '[class*="banner-ad"]', '[class*="popup"]', '[id*="popup"]',
    '[class*="overlay"]:not(video):not([class*="player"]):not([class*="video"])',
    '[class*="modal"]:not([class*="video"]):not([class*="player"])',
    '[class*="vpn"]', '[class*="consent"]', '[class*="cookie"]', '[class*="gdpr"]',
    '[class*="subscribe"]', '[class*="subscription"]', '[class*="paywall"]',
    '[class*="interstitial"]', '[id*="interstitial"]',
    '[class*="lightbox"]:not([class*="player"])',
    '[class*="promo"]', '[id*="promo"]', '[id*="consent"]', '[id*="cookie"]',
    '[class*="notification-bar"]', '[class*="sticky-ad"]', '[id*="overlay"]:not([class*="player"])',
    'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
    'iframe[src*="adnxs"]', 'iframe[src*="popads"]', 'iframe[src*="exoclick"]',
    'iframe[src*="trafficjunky"]', 'iframe[src*="adsterra"]',
    'iframe[src*="juicyads"]', 'iframe[src*="propellerads"]',
    'iframe[src*="admaven"]', 'iframe[src*="clickadu"]',
    'iframe[src*="bet365"]', 'iframe[src*="1xbet"]', 'iframe[src*="casino"]',
    '[class*="preroll"]', '[id*="preroll"]',
    '[class*="ad-container"]', '[class*="ad_container"]',
    '[id*="ad-container"]', '[id*="ad_container"]',
    '[class*="adunit"]', '[class*="ad-unit"]', '[class*="ad_unit"]',
    '[class*="sponsor"]', '[id*="sponsor"]',
    '[class*="banner"][class*="ad"]', '[id*="banner"][id*="ad"]',
    'a[href*="bet365"]', 'a[href*="1xbet"]', 'a[href*="casino"]',
    'a[href*="stake.com"]', 'a[href*="gambling"]',
  ];

  function removeAds(){
    AD_SELECTORS.forEach(function(sel){
      try{ document.querySelectorAll(sel).forEach(function(el){ el.remove(); }); }catch(e){}
    });
    document.querySelectorAll('div,section,aside,span,a,iframe').forEach(function(el){
      try{
        var s = window.getComputedStyle(el);
        if((s.position === 'fixed' || s.position === 'absolute') &&
           (parseInt(s.zIndex||'0') > 50)){
          if(el.querySelector('video,canvas') || el.tagName==='VIDEO') return;
          if((el.id||'').match(/player|video|stream|hls|plyr|jwplayer|vjs/i)) return;
          if((el.className||'').match(/player|video|stream|hls|plyr|jwplayer|vjs|controls/i)) return;
          var r = el.getBoundingClientRect();
          if(r.width > window.innerWidth * 0.3 && r.height > window.innerHeight * 0.2){ el.remove(); }
          if(s.position === 'fixed' && (parseInt(s.zIndex||'0') > 500)){ el.remove(); }
        }
      }catch(e){}
    });
    document.querySelectorAll('iframe').forEach(function(f){
      var src = f.getAttribute('src') || '';
      if(_isAdUrl(src)){ f.remove(); return; }
      try{
        var s = window.getComputedStyle(f);
        if((s.position === 'fixed' || s.position === 'absolute') && parseInt(s.zIndex||'0') > 50){
          if(!(f.id||'').match(/player|video|stream/i) && !(f.className||'').match(/player|video|stream/i)){
            f.remove();
          }
        }
      }catch(e){}
    });
    try{ document.body.style.overflow=''; document.documentElement.style.overflow=''; }catch(e){}

    // Remove fixed overlays by text content (VPN install / continue watching banners)
    var TEXT_PATTERNS = [
      /vpn\s+recommended/i,
      /secure\s+your\s+internet\s+connection/i,
      /tap\s+to\s+install\s+and\s+continue\s+watching/i,
      /install\s+and\s+continue/i,
      /continue\s+watching/i,
      /app\s*store/i,
    ];
    document.querySelectorAll('div,section,aside,a,button').forEach(function(el){
      try{
        if(el.querySelector('video,canvas,iframe')) return;
        var text = (el.textContent || '').trim();
        if(!text || text.length > 240) return;
        var matched = false;
        for(var ti=0; ti<TEXT_PATTERNS.length; ti++){ if(TEXT_PATTERNS[ti].test(text)){ matched = true; break; } }
        if(!matched) return;
        var s = window.getComputedStyle(el);
        var r = el.getBoundingClientRect();
        var fixedLike = (s.position === 'fixed' || s.position === 'absolute') && parseInt(s.zIndex || '0') >= 20;
        var bigEnough = r.width > window.innerWidth * 0.18 && r.height > 30;
        if(fixedLike && bigEnough){ el.remove(); }
      }catch(e){}
    });

    // Once video is playing, mark it so all future non-player clicks are blocked
    if(!_videoFound && _isVideoPlaying()) _videoFound = true;
  }

  if(document.readyState !== 'loading'){ removeAds(); }
  else{ document.addEventListener('DOMContentLoaded', removeAds); }
  var _obs_timer = null;
  var _adObs = new MutationObserver(function(){
    clearTimeout(_obs_timer);
    _obs_timer = setTimeout(removeAds, 300);
  });
  setTimeout(function(){
    _adObs.observe(document.documentElement||document.body||document, {childList:true, subtree:true});
  }, 100);
  var _cleanCount = 0;
  var _cleanInterval = setInterval(function(){
    removeAds();
    _cleanCount++;
    if(_cleanCount > 20 || _videoFound) clearInterval(_cleanInterval);
  }, 1000);

  // ── 6. Auto-play: click play button + start video ────────────────────
  function tryAutoPlay(){
    var videos = document.querySelectorAll('video');
    for(var i=0; i<videos.length; i++){
      var v = videos[i];
      if(v.paused && v.readyState >= 2){
        v.muted = false;
        var p = v.play();
        if(p && p.catch) p.catch(function(){ v.muted = true; v.play().catch(function(){}); });
        _videoFound = true;
        return;
      }
    }
    var playSelectors = [
      '[class*="play"]:not([disabled])',
      '[id*="play"]:not([disabled])',
      'button[aria-label*="play"]',
      'button[aria-label*="Play"]',
      '.vjs-play-control', '.plyr__control--play', '.jw-icon-playback',
      '.vjs-big-play-button', '[class*="play-btn"]', '[class*="play_btn"]',
    ];
    for(var j=0; j<playSelectors.length; j++){
      var btn = document.querySelector(playSelectors[j]);
      if(btn){ btn.click(); return; }
    }
    var cx = window.innerWidth/2, cy = window.innerHeight/2;
    var el = document.elementFromPoint(cx, cy);
    if(el && el !== document.documentElement && el !== document.body){
      ['mousedown','mouseup','click'].forEach(function(t){
        el.dispatchEvent(new MouseEvent(t, {bubbles:true, cancelable:true, view:window, clientX:cx, clientY:cy}));
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function(){ setTimeout(tryAutoPlay, 1200); });
  setTimeout(tryAutoPlay, 2000);
  setTimeout(tryAutoPlay, 3500);
  setTimeout(tryAutoPlay, 6000);

  // ── 7. Notify React Native on real user taps (toggle controls) ──────
  var _lastTapTime = 0;
  document.addEventListener('touchend', function(e){
    var now = Date.now();
    if(now - _lastTapTime < 400) return; // debounce
    _lastTapTime = now;
    try{ window.ReactNativeWebView.postMessage(JSON.stringify({type:'user_tap'})); }catch(e){}
  }, false);

  // ── 8. Auto-fullscreen when video starts playing ──────────────────────
  var _autoFSdone = false;
  function goFullscreen(v){
    if(_autoFSdone) return;
    _autoFSdone = true;
    try{
      if(v.requestFullscreen) v.requestFullscreen();
      else if(v.webkitEnterFullscreen) v.webkitEnterFullscreen();
      else if(v.webkitRequestFullScreen) v.webkitRequestFullScreen();
      else if(v.webkitRequestFullscreen) v.webkitRequestFullscreen();
    }catch(e){}
  }
  document.addEventListener('playing', function(e){
    if(e.target && e.target.tagName === 'VIDEO') goFullscreen(e.target);
  }, true);
  // Fallback: poll for playing video
  var _fsInterval = setInterval(function(){
    if(_autoFSdone){ clearInterval(_fsInterval); return; }
    var vids = document.querySelectorAll('video');
    for(var i=0; i<vids.length; i++){
      if(!vids[i].paused && vids[i].readyState >= 2){ goFullscreen(vids[i]); break; }
    }
  }, 1500);
  setTimeout(function(){ clearInterval(_fsInterval); }, 30000);
})();
`;

const FORCE_PLAY_JS = `
(function(){
  function tryPlayVideos(){
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      try { v.muted = true; v.setAttribute('muted', ''); } catch(e){}
      try {
        var p = v.play();
        if (p && p.catch) p.catch(function(){
          try { v.muted = false; } catch(e){}
          v.play && v.play().catch(function(){});
        });
      } catch(e){}
    }
  }

  function clickLikelyPlayButtons(){
    var selectors = [
      'button[aria-label*="play" i]',
      '.vjs-big-play-button',
      '.vjs-play-control',
      '.plyr__control--overlaid',
      '.plyr__control--play',
      '.jw-icon-display',
      '.jw-icon-playback',
      '[class*="play-btn"]',
      '[class*="play_btn"]',
      '[class*="big-play"]',
      '[id*="play"]',
      '[class*="play"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var btn = document.querySelector(selectors[i]);
      if (!btn) continue;
      try { btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch(e){}
      try { btn.click(); } catch(e){}
      break;
    }
  }

  function removeBlockingLayers(){
    var patterns = /vpn|consent|cookie|gdpr|promo|interstitial|popup|subscribe|paywall|ad|banner/i;
    var nodes = document.querySelectorAll('div,section,aside,iframe');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var id = (el.id || '').toLowerCase();
      var cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
      if (!patterns.test(id + ' ' + cls)) continue;
      try { if (el.isConnected && !el.querySelector('video,canvas')) el.remove(); } catch(e){}
    }
  }

  removeBlockingLayers();
  clickLikelyPlayButtons();
  tryPlayVideos();
  setTimeout(function(){ removeBlockingLayers(); clickLikelyPlayButtons(); tryPlayVideos(); }, 700);
  setTimeout(function(){ removeBlockingLayers(); clickLikelyPlayButtons(); tryPlayVideos(); }, 1700);
})();
`;

// ─── HLS inline player HTML ───────────────────────────────────────────────────
// No native <video controls> — React Native overlay provides play/pause/seek.
// postMessage bridge reports state; listens for commands via 'message' event.
function buildHlsHtml(src: string): string {
  const isXtreamTs = /\/(live|movie|series)\/[^/]+\/[^/]+\/[^/]+\.ts(\?|$)/i.test(src);
  const primarySrc = isXtreamTs ? src.replace(/\.ts(\?|$)/, '.m3u8$1') : src;
  const fallbackSrc = isXtreamTs ? src : null;

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
video{width:100%;height:100%;object-fit:contain;display:block;background:#000}
#err{display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
  color:#aaa;font-family:sans-serif;font-size:14px;text-align:center;padding:20px;pointer-events:none}
</style>
</head>
<body>
<video id="v" autoplay playsinline webkit-playsinline x5-playsinline muted></video>
<div id="err">Stream could not be loaded.<br>Try again or choose another channel.</div>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.4.14/dist/hls.min.js"></script>
<script>
(function(){
  var v = document.getElementById('v');
  var primary = ${JSON.stringify(primarySrc)};
  var fallback = ${JSON.stringify(fallbackSrc)};
  var tried = 0;
  var isLive = false;
  var stateTimer = null;

  function rn(data){
    try{ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(data)); }catch(e){}
  }

  function sendState(){
    rn({
      type: 'state',
      paused: v.paused,
      currentTime: (isFinite(v.currentTime) && v.currentTime > 0) ? v.currentTime : 0,
      duration:    (isFinite(v.duration)    && v.duration > 0)    ? v.duration    : 0,
      isLive: isLive
    });
  }

  // Rate-limited state updates (max 1/sec)
  function scheduleSend(){
    if(!stateTimer){ stateTimer = setTimeout(function(){ stateTimer=null; sendState(); }, 800); }
  }

  // Try unmuted play first; fall back to muted play (Android autoplay policy)
  function tryPlay(){
    v.muted = false;
    var p = v.play();
    if(p && p.catch) p.catch(function(){
      v.muted = true;
      v.play().catch(function(){});
    });
  }

  v.addEventListener('play',            sendState);
  v.addEventListener('pause',           sendState);
  v.addEventListener('loadedmetadata',  sendState);
  v.addEventListener('durationchange',  sendState);
  v.addEventListener('timeupdate',      scheduleSend);
  v.addEventListener('seeked',          sendState);

  // Listen for React Native commands
  window.addEventListener('message', function(e){
    try{
      var cmd = JSON.parse(e.data || '{}');
      if(cmd.type === 'toggle'){
        if(v.paused){
          // For live streams: seek to live edge before resuming so buffer is fresh
          try{
            if(isLive && v.seekable && v.seekable.length > 0){
              v.currentTime = v.seekable.end(v.seekable.length - 1);
            }
          }catch(ex){}
          tryPlay();
        } else {
          v.pause();
        }
      }
      if(cmd.type === 'seek')   { v.currentTime = Number(cmd.time) || 0; }
      if(cmd.type === 'seekRel'){ v.currentTime = Math.max(0, (v.currentTime||0) + (Number(cmd.delta)||0)); }
    }catch(e){}
  });

  function showError(){
    document.getElementById('err').textContent = 'Stream tijdelijk niet beschikbaar.\\nProbeer een ander kanaal of probeer later opnieuw.';
    document.getElementById('err').style.display = 'block';
    rn({type:'error'});
  }

  function showLoading(){
    document.getElementById('err').textContent = 'Bufferen...';
    document.getElementById('err').style.display = 'block';
    document.getElementById('err').style.color = '#888';
  }
  function hideLoading(){ document.getElementById('err').style.display = 'none'; }

  v.addEventListener('waiting', showLoading);
  v.addEventListener('playing', hideLoading);
  v.addEventListener('canplay', hideLoading);

  function tryDirect(url){
    v.src = url;
    tryPlay();
    v.onerror = function(){ if(fallback && tried < 1){ tried++; tryDirect(fallback); } else { showError(); } };
  }

  var hlsRetryCount = 0;
  var MAX_HLS_RETRY = 3;
  function loadWithHls(url, onFail){
    var h = new Hls({enableWorker:false,lowLatencyMode:false,backBufferLength:0,maxBufferLength:30,
      manifestLoadingMaxRetry:3,levelLoadingMaxRetry:3,fragLoadingMaxRetry:3,
      manifestLoadingRetryDelay:1000,levelLoadingRetryDelay:1000,fragLoadingRetryDelay:1000});
    h.loadSource(url); h.attachMedia(v);
    h.on(Hls.Events.MANIFEST_PARSED, function(){ hideLoading(); tryPlay(); });
    h.on(Hls.Events.LEVEL_LOADED,    function(e,d){ isLive = !!(d&&d.details&&d.details.live); sendState(); });
    h.on(Hls.Events.ERROR, function(e,d){
      if(!d.fatal) return;
      if(d.type === Hls.ErrorTypes.MEDIA_ERROR){
        h.recoverMediaError();
      } else if(d.type === Hls.ErrorTypes.NETWORK_ERROR && hlsRetryCount < MAX_HLS_RETRY){
        hlsRetryCount++;
        h.destroy();
        setTimeout(function(){ loadWithHls(url, onFail); }, 2000 * hlsRetryCount);
      } else {
        h.destroy(); onFail();
      }
    });
  }

  if(typeof Hls !== 'undefined' && Hls.isSupported()){
    loadWithHls(primary, function(){ tryDirect(fallback || primary); });
  } else if(v.canPlayType('application/vnd.apple.mpegurl')){
    v.src = primary; tryPlay();
    v.addEventListener('error', function(){ if(fallback && tried < 1){ tried++; v.src = fallback; tryPlay(); } else { showError(); }});
  } else {
    tryDirect(primary);
  }
})();
</script>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(secs: number): string {
  if (!isFinite(secs) || secs <= 0) return "0:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PlayerScreen() {
  const {
    trailerKey, title, type, contentId, streamUrl, tmdbId, season, episode, poster, embedUrl: paramEmbedUrl,
  } = useLocalSearchParams<{
    trailerKey?: string; title?: string; type?: string; contentId?: string;
    streamUrl?: string; tmdbId?: string; season?: string; episode?: string; poster?: string;
    embedUrl?: string;
  }>();

  const insets = useSafeAreaInsets();
  const { isFavorite, toggleFavorite, addToHistory, updateProgress, watchHistory, hasPremium } = useNexora();

  // ── Premium gate — block playback if user lacks entitlement ─────────────
  const contentCategory = type === "movie" ? "movies" : type === "series" ? "series" : null;
  const premiumBlocked = contentCategory && !hasPremium(contentCategory as any);
  const normalizedTrailerKey = extractYouTubeKey(String(trailerKey || ""));
  const normalizedSeason = Number(season || "1") || 1;
  const normalizedEpisode = Number(episode || "1") || 1;
  const playbackHistoryId = type === "series"
    ? `${String(contentId || tmdbId || title || "series")}::s${normalizedSeason}e${normalizedEpisode}`
    : String(contentId || tmdbId || `${type || "movie"}_${Date.now()}`);

  // Embed provider state
  const [providerIndex, setProviderIndex]     = useState(0);
  const [useFallbackEmbed, setUseFallbackEmbed] = useState(false);
  const [webviewKey, setWebviewKey]           = useState(0);
  const [isLoading, setIsLoading]             = useState(true);
  const [streamError, setStreamError]         = useState<Error | string | null>(null);
  const [streamErrorRef, setStreamErrorRef]   = useState("");

  // Controls overlay
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // HLS-specific state
  const hlsWebviewRef  = useRef<WebView | null>(null);
  const embedWebviewRef = useRef<WebView | null>(null);
  const disposedRef = useRef(false);
  const autoplayTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const webviewCrashCountRef = useRef(0);
  const progressSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressRef = useRef({ currentTime: 0, duration: 0 });
  const embedProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumedRef = useRef(false);
  const [hlsPaused, setHlsPaused]       = useState(false);
  const [hlsDuration, setHlsDuration]   = useState(0);
  const [hlsCurrentTime, setHlsCurrentTime] = useState(0);
  const [hlsIsLive, setHlsIsLive]       = useState(false);
  const [seekBarWidth, setSeekBarWidth]  = useState(1);

  // ── Subtitle state ─────────────────────────────────────────────────────
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<SubtitleTrack | null>(null);
  const [showSubtitlePicker, setShowSubtitlePicker] = useState(false);

  // Load subtitles when tmdbId is available
  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;
    fetchSubtitles(Number(tmdbId), {
      type: type === "series" ? "series" : "movie",
      season: season ? Number(season) : undefined,
      episode: episode ? Number(episode) : undefined,
    }).then(tracks => {
      if (!cancelled && tracks.length > 0) {
        setSubtitleTracks(tracks);
        // Auto-select Dutch or English subtitle
        const best = getBestTrack(tracks, "nl") || getBestTrack(tracks, "en");
        if (best) setActiveSubtitle(best);
      }
    });
    return () => { cancelled = true; };
  }, [tmdbId, type, season, episode]);

  const provider         = STREAM_PROVIDERS[providerIndex]?.id || STREAM_PROVIDERS[0].id;
  const allProvidersFailed = providerIndex >= STREAM_PROVIDERS.length;

  // ── Wake lock — keep screen on during playback ──────────────────────────
  useEffect(() => {
    activateKeepAwakeAsync("player").catch(() => {});
    return () => { deactivateKeepAwake("player"); };
  }, []);

  // ── Device session tracking (via playback engine) ───────────────────────
  const [, setSharingWarning] = useState<string | null>(null);

  useEffect(() => {
    const deviceId = `${Platform.OS}_${contentId || "unknown"}_${Date.now()}`;
    const init = async () => {
      const result = await startSession(deviceId, streamUrl || undefined);
      if (result.sharingWarning) setSharingWarning(result.sharingWarning);
    };
    init();
    const heartbeat = setInterval(() => sendHeartbeat(deviceId), 60000);
    return () => {
      clearInterval(heartbeat);
      stopSession(deviceId);
    };
  }, [contentId, streamUrl]);

  // ── Stream signing for IPTV streams ─────────────────────────────────────
  const [signedStreamUrl, setSignedStreamUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!streamUrl) { setSignedStreamUrl(null); return; }
    let cancelled = false;
    signStream(streamUrl, `${Platform.OS}_${contentId || "unknown"}`).then(result => {
      if (!cancelled && result.signedUrl) setSignedStreamUrl(result.signedUrl);
    });
    return () => { cancelled = true; };
  }, [streamUrl, contentId]);

  // Use signed URL if available, otherwise original
  const effectiveStreamUrl = signedStreamUrl || streamUrl;

  const injectEmbedAutoplay = useCallback(() => {
    if (Platform.OS === "web") return;
    const run = () => {
      if (disposedRef.current) return;
      embedWebviewRef.current?.injectJavaScript(`${FORCE_PLAY_JS};true;`);
    };
    run();
    // Store timer IDs so they can be cleared on unmount
    autoplayTimersRef.current.push(
      setTimeout(run, 600),
      setTimeout(run, 1700),
      setTimeout(run, 3200),
    );
  }, []);

  // ── Controls visibility ───────────────────────────────────────────────────
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(
        () => setControlsVisible(false)
      );
    }, 3200);
  }, [controlsOpacity]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    scheduleHide();
  }, [controlsOpacity, scheduleHide]);

  const hideControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.timing(controlsOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(
      () => setControlsVisible(false)
    );
  }, [controlsOpacity]);

  const toggleControls = useCallback(() => {
    if (controlsVisible) { hideControls(); } else { showControls(); }
  }, [controlsVisible, hideControls, showControls]);

  useEffect(() => {
    disposedRef.current = false;
    // Don't save trailers or sport highlights/replays to watch history
    const isSport = type === "sport" || (contentId || "").startsWith("sport_");
    if (!trailerKey && !isSport) {
      addToHistory({
        id: playbackHistoryId,
        contentId: String(contentId || tmdbId || ""),
        type: (type as any) || "movie",
        title: String(title || ""),
        poster: poster || null,
        tmdbId: tmdbId ? Number(tmdbId) : undefined,
        season: type === "series" ? normalizedSeason : undefined,
        episode: type === "series" ? normalizedEpisode : undefined,
        lastWatched: new Date().toISOString(),
      });
    }
    scheduleHide();
    return () => {
      // Save final progress before unmount
      const { currentTime: ct, duration: dur } = lastProgressRef.current;
      if (ct > 0 && dur > 0) {
        updateProgress(playbackHistoryId, ct, dur);
      }
      if (progressSaveTimerRef.current) clearTimeout(progressSaveTimerRef.current);
      // Mark as disposed — all async callbacks will bail out
      disposedRef.current = true;
      // Clear controls hide timer
      if (hideTimer.current) clearTimeout(hideTimer.current);
      // Clear all autoplay injection timers
      for (const t of autoplayTimersRef.current) clearTimeout(t);
      autoplayTimersRef.current = [];
      // Null out WebView refs to prevent any post-unmount injections
      hlsWebviewRef.current = null;
      embedWebviewRef.current = null;
      // Clear embed progress timer
      if (embedProgressTimerRef.current) clearInterval(embedProgressTimerRef.current);
      embedProgressTimerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addToHistory, contentId, normalizedEpisode, normalizedSeason, playbackHistoryId, poster, scheduleHide, title, tmdbId, trailerKey, type]);

  // ── Embed progress tracking (for Continue Watching) ───────────────────────
  // Embed WebViews can't report currentTime, so we estimate progress with a timer.
  useEffect(() => {
    // Only track when: not loading, in embed mode (no HLS stream), not a trailer
    const isEmbedMode = !effectiveStreamUrl || useFallbackEmbed;
    if (isLoading || !isEmbedMode) return;
    if (!contentId || trailerKey) return;
    const id = playbackHistoryId;
    const estimatedDuration = (type === "series") ? 2700 : 7200; // 45min or 120min
    let elapsed = 0;
    embedProgressTimerRef.current = setInterval(() => {
      elapsed += 30;
      const ct = Math.min(elapsed, estimatedDuration - 60);
      updateProgress(id, ct, estimatedDuration);
    }, 30000); // every 30 seconds
    return () => {
      if (embedProgressTimerRef.current) clearInterval(embedProgressTimerRef.current);
      embedProgressTimerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, effectiveStreamUrl, useFallbackEmbed, playbackHistoryId, trailerKey, type, updateProgress]);

  useEffect(() => {
    // Clear lingering autoplay timers when provider/key changes
    for (const t of autoplayTimersRef.current) clearTimeout(t);
    autoplayTimersRef.current = [];
    setIsLoading(true);
    setStreamError(null);
    setStreamErrorRef("");
  }, [webviewKey, provider]);

  // ── HLS control commands ──────────────────────────────────────────────────
  const hlsInject = useCallback((js: string) => {
    if (disposedRef.current) return;
    hlsWebviewRef.current?.injectJavaScript(`${js};true;`);
  }, []);

  const hlsTogglePlay = useCallback(() => {
    hlsInject(`(function(){ var v=document.getElementById('v'); if(v){ if(v.paused) v.play().catch(function(){}); else v.pause(); } })()`);
    SafeHaptics.impactLight();
    showControls();
  }, [hlsInject, showControls]);

  const hlsSeekRelative = useCallback((delta: number) => {
    hlsInject(`(function(){ var v=document.getElementById('v'); if(v&&isFinite(v.duration)){ v.currentTime=Math.max(0,Math.min(v.duration,(v.currentTime||0)+${delta})); } })()`);
    SafeHaptics.impactLight();
    showControls();
  }, [hlsInject, showControls]);

  const hlsSeekTo = useCallback((time: number) => {
    hlsInject(`(function(){ var v=document.getElementById('v'); if(v){ v.currentTime=${time}; } })()`);
  }, [hlsInject]);

  // ── Embed control commands (JS-injected, works for same-origin iframes) ──
  const handleHlsMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "state") {
        setHlsPaused(data.paused);
        setHlsCurrentTime(data.currentTime || 0);
        setHlsDuration(data.duration || 0);
        setHlsIsLive(data.isLive || false);
        // Resume from saved position on first load
        if (!resumedRef.current && data.duration > 0 && !trailerKey) {
          resumedRef.current = true;
          const saved = watchHistory.find((h) => h.id === playbackHistoryId)
            || watchHistory.find((h) => h.contentId === String(contentId || tmdbId || ""));
          if (saved?.currentTime && saved.currentTime > 10 && saved.progress && saved.progress < 0.95) {
            const seekTime = Math.max(0, saved.currentTime - 5);
            hlsWebviewRef.current?.injectJavaScript(
              `(function(){ var v=document.getElementById('v'); if(v){ v.currentTime=${seekTime}; } })();true;`
            );
          }
        }
        // Track progress for Continue Watching
        lastProgressRef.current = { currentTime: data.currentTime || 0, duration: data.duration || 0 };
        if (!progressSaveTimerRef.current && data.duration > 0) {
          progressSaveTimerRef.current = setTimeout(() => {
            progressSaveTimerRef.current = null;
            const { currentTime: ct, duration: dur } = lastProgressRef.current;
            if (ct > 0 && dur > 0) {
              updateProgress(playbackHistoryId, ct, dur);
            }
          }, 10000);
        }
      }
    } catch {}
  }, [contentId, playbackHistoryId, tmdbId, updateProgress, watchHistory, trailerKey]);

  // ── Provider switching ────────────────────────────────────────────────────
  const tryNextProvider = useCallback(() => {
    setProviderIndex(i => i + 1);
    setWebviewKey(k => k + 1);
    setStreamError(null);
    setStreamErrorRef("");
    setIsLoading(true);
  }, []);

  // ── WebView crash recovery (Android + iOS) ─────────────────────────────
  const handleWebViewCrash = useCallback(() => {
    if (disposedRef.current) return;
    webviewCrashCountRef.current++;
    if (webviewCrashCountRef.current > 3) {
      setStreamError("WebView crashed repeatedly");
      setStreamErrorRef(buildErrorReference("NX-PLY-CRASH"));
      setIsLoading(false);
      return;
    }
    setWebviewKey(k => k + 1);
    setIsLoading(true);
  }, []);

  const handleOpenInVlc = async () => {
    if (!streamUrl) return;
    SafeHaptics.impactLight();
    await openInVlc(String(streamUrl), String(title || "Nexora stream"));
  };

  const handleShare = async () => {
    const url = String(streamUrl || embedUrl || "");
    if (!url) return;
    SafeHaptics.impactLight();
    try {
      // On Android Share needs `message`; `url` is iOS-only
      await Share.share(
        Platform.OS === "ios"
          ? { title: String(title || "Nexora"), url, message: url }
          : { message: url }
      );
    } catch {}
  };

  // Auto-advance on error (embed only)
  useEffect(() => {
    if (!streamError) return;
    if (effectiveStreamUrl && !useFallbackEmbed) return;
    if (!tmdbId || allProvidersFailed) return;
    const t = setTimeout(() => tryNextProvider(), 1200);
    return () => clearTimeout(t);
  }, [streamError, effectiveStreamUrl, useFallbackEmbed, tmdbId, allProvidersFailed, tryNextProvider]);

  // Auto-advance on slow load (embed only)
  useEffect(() => {
    if (!isLoading) return;
    if (effectiveStreamUrl && !useFallbackEmbed) return;
    if (!tmdbId || allProvidersFailed) return;
    const t = setTimeout(() => tryNextProvider(), 8000);
    return () => clearTimeout(t);
  }, [isLoading, webviewKey, effectiveStreamUrl, useFallbackEmbed, tmdbId, allProvidersFailed, tryNextProvider]);

  // ── What to render ────────────────────────────────────────────────────────
  const embedUrl: string | null = (() => {
    if (normalizedTrailerKey) {
      return toYouTubeEmbedUrl(normalizedTrailerKey);
    }
    if (String(type || "") === "trailer" && paramEmbedUrl) {
      const normalizedTrailerUrl = toYouTubeEmbedUrl(String(paramEmbedUrl));
      if (normalizedTrailerUrl) return normalizedTrailerUrl;
    }
    if (paramEmbedUrl) return paramEmbedUrl;
    if (allProvidersFailed) return null;
    if (tmdbId) return getEmbedUrl(provider, tmdbId, type || "movie", season || "1", episode || "1");
    return null;
  })();
  const trailerMode = !!normalizedTrailerKey || (String(type || "") === "trailer" && !!toYouTubeEmbedUrl(String(paramEmbedUrl || "")));

  const hlsHtml: string | null = (effectiveStreamUrl && !useFallbackEmbed) ? buildHlsHtml(effectiveStreamUrl) : null;
  const embedUrlWithAutoplay: string | null = (!hlsHtml && embedUrl) ? withEmbedAutoplayParams(embedUrl) : null;
  const hasSource = !!(hlsHtml || embedUrlWithAutoplay);

  // ── onShouldStartLoadWithRequest ─────────────────────────────────────────
  // Block: ad domains, AND any top-frame navigation away from the embed domain.
  // Allow: sub-frame requests, streaming files, same-domain navigations.
  const makeNavGuard = useCallback((currentEmbedUrl: string, isTrailerMode: boolean) => {
    return (req: any) => {
      const url: string = req.url || "";
      if (!url || url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) return true;
      const isTopFrame = req?.isTopFrame !== false;

      const BLOCK_PATTERNS = [
        /play\.google\.com\/store/i,
        /apps\.apple\.com/i,
        /install\s*and\s*continue/i,
        /vpn\s*recommended/i,
        /casino|gambling|bet365|1xbet|stake\.com/i,
        /monetag|ads-monetag|pushground|roller-?ads|notix\.io/i,
        /push\.house|pushame|gravitec|sendpulse/i,
      ];
      if (BLOCK_PATTERNS.some((pattern) => pattern.test(url))) return false;

      // Block known ad/tracker domains
      if (AD_DOMAINS.some(d => url.includes(d))) return false;

      try {
        const embedHost = new URL(currentEmbedUrl).hostname;
        const reqHost   = new URL(url).hostname;
        const isSameDomain = reqHost === embedHost || reqHost.endsWith("." + embedHost);
        if (isTrailerMode) {
          const isYouTubeRelated = isTrustedTrailerHost(reqHost);
          if (!isTopFrame) return true;
          if (/\.(m3u8|mp4|ts|webm|mpd|mkv)(\?|$)/i.test(url)) return true;
          if (isYouTubeRelated) return true;
          return false;
        }
        const ALLOWED_HOST_SNIPPETS = [
          "vidsrc", "vidlink", "videasy", "autoembed", "moviesapi", "nontongo",
          "smashystream", "frembed", "jwplayer", "cloudflare", "m3u8", "hls", "stream",
          "rabbitstream", "vidcloud", "upcloud", "streamtape", "filemoon", "mixdrop", "dood",
          "googlevideo", "akamaized", "cdn", "youtube", "ytimg", "youtube-nocookie",
        ];
        const isKnownVideoHost = ALLOWED_HOST_SNIPPETS.some((snippet) => reqHost.includes(snippet));
        if (!isSameDomain) {
          if (/\.(m3u8|mp4|ts|webm|mpd|mkv)(\?|$)/i.test(url)) return true;
          if (isKnownVideoHost) return true;
          return false;
        }
      } catch {}
      return true;
    };
  }, []);

  // ── onNavigationStateChange — backup popup blocker ─────────────────────────
  // Fires AFTER navigation starts; stops loading if the URL left the embed domain.
  // Catches anything that slips past onShouldStartLoadWithRequest.
  const makeNavStateGuard = useCallback((currentEmbedUrl: string, isTrailerMode: boolean) => {
    return (navState: any) => {
      if (disposedRef.current) return;
      const url: string = navState.url || "";
      if (!url || url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) return;
      if (/play\.google\.com\/store|apps\.apple\.com|install\s*and\s*continue|vpn\s*recommended|casino|gambling|bet365|1xbet|stake\.com|monetag|pushground|roller-?ads|notix\.io|push\.house/i.test(url)) {
        embedWebviewRef.current?.stopLoading();
        embedWebviewRef.current?.goBack();
        return;
      }
      if (AD_DOMAINS.some(d => url.includes(d))) {
        embedWebviewRef.current?.stopLoading();
        return;
      }
      try {
        const embedHost = new URL(currentEmbedUrl).hostname;
        const reqHost   = new URL(url).hostname;
        const isSameDomain = reqHost === embedHost || reqHost.endsWith("." + embedHost);
        if (isTrailerMode) {
          const isYouTubeRelated = isTrustedTrailerHost(reqHost);
          if (!isYouTubeRelated && !/\.(m3u8|mp4|ts|webm|mpd|mkv)(\?|$)/i.test(url)) {
            embedWebviewRef.current?.stopLoading();
            embedWebviewRef.current?.goBack();
          }
          return;
        }
        const isKnownVideoHost = [
          "vidsrc", "vidlink", "videasy", "autoembed", "moviesapi", "nontongo",
          "smashystream", "frembed", "jwplayer", "cloudflare", "m3u8", "hls", "stream",
          "rabbitstream", "vidcloud", "upcloud", "streamtape", "filemoon", "mixdrop", "dood",
          "googlevideo", "akamaized", "cdn",
        ].some((snippet) => reqHost.includes(snippet));
        if (!isSameDomain && !isKnownVideoHost && !/\.(m3u8|mp4|ts|webm|mpd|mkv)(\?|$)/i.test(url)) {
          embedWebviewRef.current?.stopLoading();
          embedWebviewRef.current?.goBack();
        }
      } catch {}
    };
  }, []);

  // ── Web (iframe) player ───────────────────────────────────────────────────
  const renderWebPlayer = () => {
    if (!hlsHtml && !embedUrlWithAutoplay) return null;
    return (
      <WebView
        key={webviewKey}
        source={hlsHtml ? { html: hlsHtml } : { uri: embedUrlWithAutoplay || "" }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    );
  };

  // ── Native WebView player ─────────────────────────────────────────────────
  const renderNativePlayer = () => {
    if (hlsHtml) {
      return (
        <WebView
          key={webviewKey}
          ref={hlsWebviewRef}
          source={{ html: hlsHtml }}
          style={styles.webview}
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mixedContentMode="always"
          originWhitelist={["http://*", "https://*", "blob:*"]}
          userAgent="Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          onMessage={handleHlsMessage}
          onLoad={() => { if (!disposedRef.current) { setIsLoading(false); setStreamError(null); } }}
          onError={(event) => {
            if (disposedRef.current) return;
            const msg = String(event?.nativeEvent?.description || "");
            if (/removechild|notfounderror|not a child|hierarchyrequesterror/i.test(msg)) {
              setIsLoading(false);
              return;
            }
            if (tmdbId && !useFallbackEmbed) {
              setUseFallbackEmbed(true);
              setIsLoading(true);
              setStreamError(null);
            } else {
              setIsLoading(false);
              const msg = event?.nativeEvent?.description || "Stream could not be loaded";
              setStreamError(msg);
              setStreamErrorRef(prev => prev || buildErrorReference("NX-PLY"));
            }
          }}
          onRenderProcessGone={handleWebViewCrash}
          onContentProcessDidTerminate={handleWebViewCrash}
        />
      );
    }

    if (embedUrlWithAutoplay && embedUrl) {
      return (
        <WebView
          key={webviewKey}
          ref={embedWebviewRef}
          source={trailerMode
            ? {
                uri: embedUrlWithAutoplay,
                headers: {
                  Referer: "https://www.youtube.com/",
                  Origin: "https://www.youtube.com",
                },
              }
            : { uri: embedUrlWithAutoplay }}
          style={styles.webview}
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          mixedContentMode="always"
          originWhitelist={["http://*", "https://*", "about:*", "blob:*", "*"]}
          userAgent="Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          injectedJavaScriptBeforeContentLoaded={trailerMode ? undefined : AD_BLOCK_JS}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === "user_tap") toggleControls();
            } catch {}
          }}
          onLoad={() => { if (!disposedRef.current) { setIsLoading(false); setStreamError(null); setStreamErrorRef(""); injectEmbedAutoplay(); scheduleHide(); } }}
          onError={(event) => {
            if (disposedRef.current) return;
            const msg = String(event?.nativeEvent?.description || "");
            if (/removechild|notfounderror|not a child|hierarchyrequesterror/i.test(msg)) {
              setIsLoading(false);
              return;
            }
            setIsLoading(false);
            setStreamError(msg || "Stream could not be loaded");
            setStreamErrorRef(prev => prev || buildErrorReference("NX-PLY"));
          }}
          onShouldStartLoadWithRequest={makeNavGuard(embedUrl, trailerMode)}
          onNavigationStateChange={makeNavStateGuard(embedUrl, trailerMode)}
          scalesPageToFit={false}
          onRenderProcessGone={handleWebViewCrash}
          onContentProcessDidTerminate={handleWebViewCrash}
        />
      );
    }
    return null;
  };

  // ── Seek bar progress (0–1) ───────────────────────────────────────────────
  const seekProgress = hlsDuration > 0 ? Math.min(hlsCurrentTime / hlsDuration, 1) : 0;

  // ─────────────────────────────────────────────────────────────────────────
  if (premiumBlocked) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center", gap: 16 }]}>
        <StatusBar hidden />
        <Ionicons name="lock-closed" size={48} color={COLORS.accent} />
        <Text style={{ color: COLORS.text, fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" }}>Premium vereist</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: "center", paddingHorizontal: 40 }}>
          Upgrade naar Premium om {contentCategory === "movies" ? "films" : "series"} af te spelen.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: COLORS.accent, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 }}
          onPress={() => router.replace("/premium")}
        >
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Ontgrendel Premium</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 8 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>Terug</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Video area */}
      <View style={styles.videoArea}>
        <SilentResetBoundary>
        {hasSource ? (
          Platform.OS === "web" ? renderWebPlayer() : renderNativePlayer()
        ) : (
          <View style={styles.noContent}>
            <LinearGradient colors={[COLORS.card, "#000"]} style={StyleSheet.absoluteFill} />
            <Ionicons name="videocam-off-outline" size={52} color={COLORS.textMuted} />
            <Text style={styles.noTitle}>Geen stream beschikbaar</Text>
            <Text style={styles.noText}>Probeer een andere server of ga terug.</Text>
            <TouchableOpacity style={styles.backBtn2} onPress={() => router.back()}>
              <Text style={styles.backBtn2Text}>Terug</Text>
            </TouchableOpacity>
          </View>
        )}
        </SilentResetBoundary>

        {/* Spinner (silent background loading) */}
        {isLoading && hasSource && Platform.OS !== "web" && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        )}

        {/* All-providers-failed error */}
        {(allProvidersFailed || (!isLoading && streamError && !tmdbId)) && Platform.OS !== "web" && (
          <View style={styles.streamErrorOverlay}>
            <Ionicons name="warning-outline" size={18} color={COLORS.live} />
            <Text style={styles.streamErrorText}>Geen enkele server werkt momenteel.</Text>
            <Text style={styles.streamErrorRef}>Foutcode: {streamErrorRef || "NX-PLY"}</Text>
            <TouchableOpacity
              style={styles.streamRetryBtn}
              onPress={() => {
                setStreamError(null); setStreamErrorRef("");
                setIsLoading(true); setProviderIndex(0); setWebviewKey(k => k + 1);
              }}
            >
              <Text style={styles.streamRetryText}>Opnieuw proberen</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ─── Full-screen interceptor — HLS only ─────────────────────────── */}
      {hlsHtml && Platform.OS !== "web" && !controlsVisible && (
        <TouchableOpacity
          style={styles.hlsTouchScreen}
          onPress={showControls}
          activeOpacity={1}
        />
      )}

      {/* ─── Controls overlay — HLS/IPTV: full animated controls ────────── */}
      {hlsHtml ? (
        <Animated.View
          style={[styles.overlay, { opacity: controlsOpacity }]}
          pointerEvents={controlsVisible ? "auto" : "none"}
        >
          {/* Background tap area — toggles overlay */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={hideControls}
            activeOpacity={1}
          />
          {/* Top bar */}
          <LinearGradient colors={["rgba(0,0,0,0.88)", "rgba(0,0,0,0.4)", "transparent"]} locations={[0, 0.6, 1]} style={styles.topGrad}>
            <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 8 }]}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => { SafeHaptics.impactLight(); router.back(); }}>
                <View style={styles.iconBtnBg}>
                  <Ionicons name="chevron-down" size={24} color="#fff" />
                </View>
              </TouchableOpacity>
              <View style={styles.titleWrap}>
                <Text style={styles.playerTitle} numberOfLines={1}>{title || "Nu Afspelen"}</Text>
                {type === "series" && season && (
                  <Text style={styles.playerSub}>S{season} · E{episode || "1"}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => { toggleFavorite(contentId || String(title)); SafeHaptics.impactLight(); }}
              >
                <Ionicons
                  name={isFavorite(contentId || String(title)) ? "heart" : "heart-outline"}
                  size={22}
                  color={isFavorite(contentId || String(title)) ? COLORS.live : "rgba(255,255,255,0.85)"}
                />
              </TouchableOpacity>
              {!!streamUrl && (
                <TouchableOpacity style={styles.iconBtn} onPress={handleOpenInVlc}>
                  <Ionicons name="open-outline" size={20} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
              )}
              {(!!streamUrl || !!embedUrl) && (
                <TouchableOpacity style={styles.iconBtn} onPress={handleShare}>
                  <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
              )}
              {subtitleTracks.length > 0 && (
                <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSubtitlePicker(s => !s)}>
                  <Ionicons name="text" size={20} color={activeSubtitle ? COLORS.accent : "rgba(255,255,255,0.85)"} />
                </TouchableOpacity>
              )}
            </View>
          </LinearGradient>

          {/* Subtitle picker dropdown */}
          {showSubtitlePicker && (
            <View style={styles.subtitlePicker}>
              <TouchableOpacity
                style={[styles.subtitleOption, !activeSubtitle && styles.subtitleOptionActive]}
                onPress={() => { setActiveSubtitle(null); setShowSubtitlePicker(false); }}
              >
                <Text style={[styles.subtitleOptionText, !activeSubtitle && styles.subtitleOptionTextActive]}>Off</Text>
              </TouchableOpacity>
              {subtitleTracks.slice(0, 8).map(track => (
                <TouchableOpacity
                  key={track.id}
                  style={[styles.subtitleOption, activeSubtitle?.id === track.id && styles.subtitleOptionActive]}
                  onPress={() => { setActiveSubtitle(track); setShowSubtitlePicker(false); }}
                >
                  <Text style={[styles.subtitleOptionText, activeSubtitle?.id === track.id && styles.subtitleOptionTextActive]}>
                    {track.languageLabel}{track.hearingImpaired ? " (CC)" : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* HLS center controls: skip-back | play-pause | skip-forward */}
          {Platform.OS !== "web" && (
            <View style={styles.hlsCenterRow}>
              <TouchableOpacity style={styles.hlsSkipBtn} onPress={() => hlsSeekRelative(-15)} activeOpacity={0.7}>
                <View style={styles.hlsSkipBtnInner}>
                  <Ionicons name="play-back" size={22} color="#fff" />
                </View>
                <Text style={styles.hlsSkipLabel}>15s</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.hlsPlayBtn} onPress={hlsTogglePlay} activeOpacity={0.8}>
                <Ionicons name={hlsPaused ? "play" : "pause"} size={40} color="#fff" style={hlsPaused ? { marginLeft: 4 } : undefined} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.hlsSkipBtn} onPress={() => hlsSeekRelative(15)} activeOpacity={0.7}>
                <View style={styles.hlsSkipBtnInner}>
                  <Ionicons name="play-forward" size={22} color="#fff" />
                </View>
                <Text style={styles.hlsSkipLabel}>15s</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* HLS bottom: seek bar + time */}
          {Platform.OS !== "web" && (
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.92)"]} locations={[0, 0.35, 1]} style={styles.bottomGrad}>
              <View style={[styles.hlsBottomBar, { paddingBottom: insets.bottom + 16 }]}>
                {hlsIsLive ? (
                  <View style={styles.livePill}>
                    <View style={styles.liveDot} />
                    <Text style={styles.livePillText}>LIVE</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.hlsTime}>{formatTime(hlsCurrentTime)}</Text>

                    <TouchableOpacity
                      style={styles.hlsSeekOuter}
                      onLayout={e => setSeekBarWidth(Math.max(1, e.nativeEvent.layout.width))}
                      onPress={e => {
                        const pct = e.nativeEvent.locationX / seekBarWidth;
                        hlsSeekTo(pct * hlsDuration);
                      }}
                      activeOpacity={1}
                    >
                      <View style={styles.hlsSeekTrack}>
                        <View style={[styles.hlsSeekFill, { width: `${Math.round(seekProgress * 100)}%` as any }]} />
                      </View>
                      <View style={[styles.hlsSeekThumb, { left: `${Math.round(seekProgress * 100)}%` as any }]} />
                    </TouchableOpacity>

                    <Text style={styles.hlsTimeDuration}>{formatTime(hlsDuration - hlsCurrentTime)}</Text>
                  </>
                )}
              </View>
            </LinearGradient>
          )}
        </Animated.View>
      ) : (embedUrl && Platform.OS !== "web") ? (
        /* ─── Embed mode: auto-hide overlay (back + title + refresh) ─── */
        <Animated.View style={[styles.embedMinimalOverlay, { opacity: controlsOpacity }]} pointerEvents={controlsVisible ? "box-none" : "none"}>
          <LinearGradient colors={["rgba(0,0,0,0.7)", "transparent"]} style={[styles.embedMinimalBar, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity
              style={styles.embedBackBtn}
              onPress={() => { SafeHaptics.impactLight(); router.back(); }}
            >
              <Ionicons name="chevron-down" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.embedTitleWrap}>
              <Text style={styles.embedTitle} numberOfLines={1}>{title || ""}</Text>
              {type === "series" && season && (
                <Text style={styles.embedSub}>S{season} · E{episode || "1"}</Text>
              )}
            </View>
            {!allProvidersFailed && (
              <TouchableOpacity
                style={styles.embedServerBtn}
                onPress={() => { tryNextProvider(); SafeHaptics.impactLight(); }}
              >
                <Ionicons name="refresh" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </LinearGradient>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: "#000" },
  videoArea:  { flex: 1, backgroundColor: "#000" },
  webview:    { flex: 1, backgroundColor: "#000" },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)", gap: 12,
  },
  loadingText: { fontFamily: "Inter_500Medium", fontSize: 14, color: "rgba(255,255,255,0.7)" },

  streamErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 24,
  },
  streamErrorText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textSecondary, textAlign: "center" },
  streamErrorRef:  { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  streamRetryBtn:  { borderRadius: 10, borderWidth: 1, borderColor: COLORS.accent, backgroundColor: COLORS.accentGlow, paddingHorizontal: 14, paddingVertical: 8, marginTop: 2 },
  streamRetryText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.accent },

  noContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 },
  noTitle:   { fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" },
  noText:    { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
  backBtn2:  { marginTop: 8, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 14, backgroundColor: COLORS.accent },
  backBtn2Text: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.background },

  // Touch zones
  hlsTouchScreen: { ...StyleSheet.absoluteFillObject, zIndex: 5 },

  // Embed mode minimal overlay (static, no animation)
  embedMinimalOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    justifyContent: "flex-start",
  },
  embedMinimalBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 20,
  },
  embedBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  embedServerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },

  // Controls overlay
  overlay:  { ...StyleSheet.absoluteFillObject, justifyContent: "space-between", zIndex: 10 },
  topGrad:  { paddingBottom: 40 },
  topBar:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 6 },
  iconBtn:  { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  iconBtnBg: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  titleWrap: { flex: 1, marginLeft: 4 },
  playerTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff", letterSpacing: 0.2 },
  playerSub:   { fontFamily: "Inter_500Medium", fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 },
  bottomGrad: { paddingTop: 80 },

  // HLS custom controls
  hlsCenterRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 48, position: "absolute", left: 0, right: 0,
    top: "50%", marginTop: -32,
  },
  hlsPlayBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  hlsSkipBtn:  { alignItems: "center", gap: 4 },
  hlsSkipBtnInner: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  hlsSkipLabel: { fontFamily: "Inter_500Medium", fontSize: 10, color: "rgba(255,255,255,0.6)" },

  hlsBottomBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, gap: 12,
  },
  hlsTime: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "rgba(255,255,255,0.9)", minWidth: 42, textAlign: "left" },
  hlsTimeDuration: { fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.5)", minWidth: 42, textAlign: "right" },
  hlsSeekOuter: {
    flex: 1, height: 32, justifyContent: "center",
    position: "relative",
  },
  hlsSeekTrack: {
    height: 3.5, backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2, overflow: "hidden",
    flexDirection: "row",
  },
  hlsSeekFill: { height: "100%", backgroundColor: COLORS.accent, borderRadius: 2 },
  hlsSeekThumb: {
    position: "absolute", top: "50%", marginTop: -7,
    marginLeft: -7,
    width: 14, height: 14,
    borderRadius: 7, backgroundColor: COLORS.accent,
    borderWidth: 2, borderColor: "#fff",
  },

  livePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    height: 28, borderRadius: 14,
    backgroundColor: COLORS.live,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  liveDot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: "#fff",
  },
  livePillText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#fff", letterSpacing: 0.5 },

  // Embed minimal overlay — title + back + server switch
  embedTitleWrap: { flex: 1, marginLeft: 8 },
  embedTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  embedSub:   { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 1 },

  // Subtitle picker
  subtitlePicker: {
    position: "absolute", top: 80, right: 16,
    backgroundColor: "rgba(0,0,0,0.92)", borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    paddingVertical: 4, minWidth: 160, zIndex: 20,
  },
  subtitleOption: {
    paddingHorizontal: 16, paddingVertical: 10,
  },
  subtitleOptionActive: {
    backgroundColor: "rgba(255,45,85,0.15)",
  },
  subtitleOptionText: {
    fontFamily: "Inter_500Medium", fontSize: 13, color: "rgba(255,255,255,0.7)",
  },
  subtitleOptionTextActive: {
    color: COLORS.accent, fontFamily: "Inter_600SemiBold",
  },
});
