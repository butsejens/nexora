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
  BackHandler,
  Pressable,
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
import { isTV } from "@/lib/platform";
import {
  startSession, sendHeartbeat, stopSession,
  signStream,
} from "@/lib/playback-engine";
import {
  fetchSubtitles, getBestTrack,
} from "@/lib/subtitle-manager";
import type { SubtitleTrack } from "@/lib/subtitle-manager";
import {
  StreamManager,
  getEmbedUrl,
  withAutoplayParams,
  STREAM_PROVIDERS,
  ALLOWED_VIDEO_HOSTS,
} from "@/lib/stream-manager";
import type { StreamSource } from "@/lib/stream-manager";


// ─── Stream Manager handles discovery, validation, ranking, and fallback ──────

// getEmbedUrl and withAutoplayParams imported from stream-manager.ts

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
  // Additional popup/redirect domains
  "pushance.com", "pushails.com", "pushnest.com", "dolohen.com",
  "streamdefence.com", "streamdefense.com", "streamguard.cc",
  "adserverplus.com", "tsyndicate.com", "effectivegatetocontent.com",
  "geniusdexchange.com", "whoads.net", "a-ads.com", "coinzilla.com",
  "cointraffic.io", "bitmedia.io", "ad.plus", "monetag.com",
  "lootlinks.co", "linkbucks.com", "linkbux.com",
  "disqus.com/embed/ads", "nativery.com", "teads.tv",
  "marphezis.com", "wpadmngr.com", "raptive.com",
  "notify-monad.com", "pusherism.com", "pushclub.net",
  "go.adbloat.com", "cdn77.org/ad", "ablfrnd.com",
  "fastclick.net", "specificclick.net", "valueclick.com",
  "undertone.com", "adblade.com", "adcolony.com",
  "twinrdsrv.com", "tsartech.com", "runative.com",
  "ntv.io", "glimr.io", "liveintent.com", "kochava.com",
  "d2cmedia.com", "nextmillennium.io", "a2z-media.com",
  // Popup / redirect networks
  "adbull.com", "adtival.network", "clickaine.com", "evadav.com",
  "galaksion.com", "mondiad.com", "roller-ads.com", "richads.com",
  "zeydoo.com", "clickdealer.com", "cpmstar.com", "adsco.re",
  "realsrv.com", "trk.smarter.com", "acint.net", "ad6media.fr",
  "bidswitch.net", "adsrvr.org", "demdex.net", "krxd.net",
  "bluekai.com", "addthis.com", "sharethis.com",
  // CAPTCHA / verification services
  "google.com/recaptcha", "www.google.com/recaptcha",
  "recaptcha.net", "www.recaptcha.net",
  "hcaptcha.com", "www.hcaptcha.com",
  "challenges.cloudflare.com",
  "captcha.website", "captcha-delivery.com",
  "arkoselabs.com", "funcaptcha.com",
  // YouTube / social redirect popups
  "youtube.com", "youtu.be", "youtube-nocookie.com",
  "facebook.com", "twitter.com", "x.com", "instagram.com", "tiktok.com",
  "t.me", "telegram.org",
];

// ─── JS injected in embed WebView ─────────────────────────────────────────────
// Strategy: block ALL clicks except on video/player elements from the start.
// Blocks fetch/XHR to ad networks, strips popups/overlays, nukes ad iframes.
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
      '[class*="sponsor"],[id*="sponsor"],' +
      '[class*="captcha"],[id*="captcha"],[class*="recaptcha"],[id*="recaptcha"],' +
      '[class*="hcaptcha"],[id*="hcaptcha"],[class*="turnstile"],[id*="turnstile"],' +
      '[class*="cf-challenge"],[id*="cf-challenge"],[class*="challenge"],' +
      '[class*="robot"],[id*="robot"],[class*="human"],[id*="human"],' +
      '[class*="verify"],[id*="verify"],[class*="verification"],[id*="verification"],' +
      '[class*="check-overlay"],[class*="cf-wrapper"],[id*="cf-wrapper"],' +
      '.g-recaptcha,div[data-sitekey],iframe[src*="recaptcha"],iframe[src*="hcaptcha"],' +
      'iframe[src*="turnstile"],iframe[src*="challenges.cloudflare"],' +
      'iframe[src*="youtube.com"],iframe[src*="youtu.be"],iframe[src*="youtube-nocookie"],' +
      'iframe[src*="facebook.com"],iframe[src*="twitter.com"],iframe[src*="instagram.com"],' +
      '[class*="are-you-human"],[id*="are-you-human"],[class*="not-robot"],[id*="not-robot"]' +
      '{ display:none!important; visibility:hidden!important; opacity:0!important; pointer-events:none!important; }';
    (document.head||document.documentElement).appendChild(s);
  })();

  // ── 1. Block ALL popups / new windows ────────────────────────────────────
  window.open = function(){ return null; };
  window.alert = function(){};
  window.confirm = function(){ return true; };
  window.prompt = function(){ return ''; };
  try{ Object.defineProperty(window, 'open', { value: function(){ return null; }, writable: false, configurable: false }); }catch(e){}
  // Block showModalDialog if it exists
  try{ window.showModalDialog = function(){}; }catch(e){}
  // Block Notification API popups
  try{ if(window.Notification){ window.Notification.requestPermission = function(cb){ if(cb) cb('denied'); return Promise.resolve('denied'); }; } }catch(e){}
  // Block window.focus/blur tricks used by popup ads
  try{ var _origFocus = window.focus; window.focus = function(){ try{ _origFocus.call(window); }catch(e){} }; }catch(e){}
  // Block document.write after initial load (used to inject full-page ad takeovers)
  setTimeout(function(){ try{ document.write = function(){}; document.writeln = function(){}; }catch(e){} }, 2000);
  // Block Service Worker registration (used by push notification ads)
  try{ if(navigator.serviceWorker){ navigator.serviceWorker.register = function(){ return Promise.reject('blocked'); }; } }catch(e){}
  // Block window.open in all child frames too
  try{ var _blockFrameOpen = function(w){ try{ w.open = function(){ return null; }; }catch(e){} };
    if(window.frames){ for(var fi=0; fi<window.frames.length; fi++){ try{ _blockFrameOpen(window.frames[fi]); }catch(e){} } }
  }catch(e){}

  // ── 1b. Block fetch/XHR to ad domains ──────────────────────────────────
  var _adNetworks = /doubleclick|googlesyndication|googleadservices|adnxs|exoclick|juicyads|popads|popcash|trafficjunky|adsterra|hilltopads|propellerads|clickadu|plugrush|adcash|admaven|popunder|revenuehits|onclkds|taboola|outbrain|mgid|moatads|monetag|pushance|pushails|dolohen|tsyndicate|coinzilla|bitmedia|marphezis|wpadmngr|pusherism|twinrdsrv|runative|bet365|1xbet|stake\.com|casino|gambling|poker/i;
  try{
    var _origFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = typeof url === 'string' ? url : (url && url.url ? url.url : '');
      if(_adNetworks.test(u)) return Promise.resolve(new Response('', {status: 204}));
      return _origFetch.call(window, url, opts);
    };
  }catch(e){}
  try{
    var _origXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url){
      if(_adNetworks.test(String(url||''))) { this._blocked = true; return; }
      return _origXhrOpen.apply(this, arguments);
    };
    var _origXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(){
      if(this._blocked) return;
      return _origXhrSend.apply(this, arguments);
    };
  }catch(e){}

  // ── Block CAPTCHA / robot verification systems ─────────────────────────
  // Intercept recaptcha, hcaptcha, turnstile script loading
  var _origCreateElement = document.createElement.bind(document);
  document.createElement = function(tag){
    var el = _origCreateElement(tag);
    if(tag.toLowerCase() === 'script'){
      var _origSetSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
      if(_origSetSrc && _origSetSrc.set){
        Object.defineProperty(el, 'src', {
          set: function(v){
            var s = String(v||'').toLowerCase();
            if(s.includes('recaptcha') || s.includes('hcaptcha') || s.includes('turnstile') ||
               s.includes('captcha') || s.includes('challenges.cloudflare')){
              return;
            }
            _origSetSrc.set.call(el, v);
          },
          get: function(){ return _origSetSrc.get.call(el); },
          configurable: true
        });
      }
    }
    return el;
  };
  // Auto-solve any grecaptcha challenge by faking the callback
  try{
    Object.defineProperty(window, 'grecaptcha', {
      get: function(){
        return {
          ready: function(cb){ if(cb) cb(); },
          execute: function(){ return Promise.resolve('fake-token'); },
          render: function(){ return 0; },
          getResponse: function(){ return 'fake-token'; },
          reset: function(){},
          enterprise: {
            ready: function(cb){ if(cb) cb(); },
            execute: function(){ return Promise.resolve('fake-token'); },
            render: function(){ return 0; },
          }
        };
      },
      set: function(){},
      configurable: true
    });
  }catch(e){}
  // Fake hcaptcha
  try{
    Object.defineProperty(window, 'hcaptcha', {
      get: function(){
        return {
          render: function(){ return 'fake'; },
          getResponse: function(){ return 'fake-token'; },
          execute: function(){ return Promise.resolve({ response: 'fake-token' }); },
          reset: function(){},
        };
      },
      set: function(){},
      configurable: true
    });
  }catch(e){}
  // Fake turnstile
  try{
    Object.defineProperty(window, 'turnstile', {
      get: function(){
        return {
          render: function(el, opts){ if(opts && opts.callback) opts.callback('fake-token'); return 'fake'; },
          getResponse: function(){ return 'fake-token'; },
          reset: function(){},
          remove: function(){},
        };
      },
      set: function(){},
      configurable: true
    });
  }catch(e){}
  // Auto-trigger any captcha callback on the page
  setTimeout(function(){
    try{
      document.querySelectorAll('[data-callback]').forEach(function(el){
        var cbName = el.getAttribute('data-callback');
        if(cbName && typeof window[cbName] === 'function'){
          window[cbName]('fake-token');
        }
      });
    }catch(e){}
  }, 1500);
  setTimeout(function(){
    try{
      document.querySelectorAll('[data-callback]').forEach(function(el){
        var cbName = el.getAttribute('data-callback');
        if(cbName && typeof window[cbName] === 'function'){
          window[cbName]('fake-token');
        }
      });
    }catch(e){}
  }, 4000);
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

  // ── Fullscreen API protection ──────────────────────────────────────────
  // Prevent sites from hijacking fullscreen requests to show CAPTCHA/robot popups.
  (function(){
    // Run removeAds instantly on any fullscreen change
    var _fsEvents = ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange'];
    _fsEvents.forEach(function(ev){
      _origAddEvent.call(document, ev, function(){
        setTimeout(removeAds, 0);
        setTimeout(removeAds, 150);
        setTimeout(removeAds, 500);
        setTimeout(removeAds, 1500);
      }, true);
    });

    // Wrap requestFullscreen on Element.prototype to clean overlays after requesting
    var _wrapFS = function(proto, method){
      var orig = proto[method];
      if(!orig) return;
      proto[method] = function(){
        var result;
        try{ result = orig.apply(this, arguments); }catch(e){}
        // Clean up any overlays/captcha that appear when fullscreen is triggered
        setTimeout(removeAds, 0);
        setTimeout(removeAds, 200);
        setTimeout(removeAds, 600);
        setTimeout(removeAds, 1500);
        if(result && result.then){
          result.then(function(){ setTimeout(removeAds, 100); }).catch(function(){});
        }
        return result;
      };
    };
    try{ _wrapFS(Element.prototype, 'requestFullscreen'); }catch(e){}
    try{ _wrapFS(Element.prototype, 'webkitRequestFullscreen'); }catch(e){}
    try{ _wrapFS(Element.prototype, 'webkitRequestFullScreen'); }catch(e){}
    try{ _wrapFS(Element.prototype, 'mozRequestFullScreen'); }catch(e){}
    try{ _wrapFS(Element.prototype, 'msRequestFullscreen'); }catch(e){}
    // Wrap HTMLVideoElement.webkitEnterFullScreen (iOS/Safari)
    try{ if(HTMLVideoElement.prototype.webkitEnterFullScreen) _wrapFS(HTMLVideoElement.prototype, 'webkitEnterFullScreen'); }catch(e){}
    try{ if(HTMLVideoElement.prototype.webkitEnterFullscreen) _wrapFS(HTMLVideoElement.prototype, 'webkitEnterFullscreen'); }catch(e){}

    // Block sites from listening to fullscreen events to inject captcha
    var _origDocAdd = _origAddEvent;
    document.addEventListener = function(type, fn, opts){
      // Block non-player fullscreenchange handlers that sites use to inject CAPTCHA
      if(typeof type === 'string' && type.toLowerCase().includes('fullscreen')){
        // Let our own handlers run but block the site's
        var fnStr = '';
        try{ fnStr = fn.toString().toLowerCase(); }catch(e){}
        if(fnStr.includes('captcha') || fnStr.includes('robot') || fnStr.includes('verify') ||
           fnStr.includes('overlay') || fnStr.includes('modal') || fnStr.includes('popup') ||
           fnStr.includes('challenge') || fnStr.includes('human')){
          return;
        }
      }
      return _origDocAdd.call(document, type, fn, opts);
    };
  })();

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
    /youtube\\.com|youtu\\.be|youtube-nocookie\\.com/i,
    /facebook\\.com|twitter\\.com|x\\.com|instagram\\.com|tiktok\\.com/i,
    /t\\.me\\/|telegram\\.org/i,
    /survey|reward|prize|winner|congratulat/i,
    /dating|singles|meet.*local/i,
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

    // Block ALL non-player clicks — no "first free click" that ads exploit
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); return false;
  }, true);

  // Also block touch events (mobile ad popups use touchstart)
  document.addEventListener('touchstart', function(e){
    if(_isPlayerElement(e.target)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  }, {capture: true, passive: false});

  // Strip target=_blank from all links (prevents popup windows)
  setInterval(function(){
    document.querySelectorAll('a[target]').forEach(function(a){
      var t = a.getAttribute('target');
      if(t === '_blank' || t === '_top' || t === '_parent') a.removeAttribute('target');
    });
  }, 2000);

  // ── 2b. Intercept dynamically added click listeners that open ads ─────
  var _origAddEvent = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, fn, opts){
    // Block body/document-level click/touch/pointer handlers (ad click hijackers)
    if((type === 'touchstart' || type === 'mousedown' || type === 'pointerdown' ||
        type === 'mouseup' || type === 'pointerup' || type === 'touchend') &&
       (this === document.body || this === document.documentElement || this === document)){
      return;
    }
    // Block 'click' on body/document after video is found (late-added ad click handlers)
    if(type === 'click' && _videoFound &&
       (this === document.body || this === document.documentElement || this === document)){
      return;
    }
    return _origAddEvent.call(this, type, fn, opts);
  };

  // ── 2c. Block form submissions (used by some ad redirects) ────────────
  try{
    HTMLFormElement.prototype.submit = function(){ return false; };
  }catch(e){}

  // ── 2d. Block popstate/hashchange ad redirects ────────────────────────
  var _popstateBlocked = false;
  _origAddEvent.call(window, 'popstate', function(e){
    if(_videoFound && !_popstateBlocked){
      _popstateBlocked = true;
      setTimeout(function(){ _popstateBlocked = false; }, 100);
      e.stopImmediatePropagation();
      try{ history.forward(); }catch(ex){}
    }
  }, true);

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

    // Check if an iframe src is an ad
    function _isAdIframe(el){
      if(!el || el.tagName !== 'IFRAME') return false;
      var src = el.getAttribute('src') || '';
      if(_isAdUrl(src)) return true;
      // Block CAPTCHA iframes and social/YouTube iframes
      var srcLower = src.toLowerCase();
      if(srcLower.includes('recaptcha') || srcLower.includes('hcaptcha') ||
         srcLower.includes('turnstile') || srcLower.includes('challenges.cloudflare') ||
         srcLower.includes('captcha') || srcLower.includes('robot') ||
         srcLower.includes('youtube.com') || srcLower.includes('youtu.be') ||
         srcLower.includes('youtube-nocookie') ||
         srcLower.includes('facebook.com') || srcLower.includes('twitter.com') ||
         srcLower.includes('instagram.com') || srcLower.includes('tiktok.com')) return true;
      // Zero-size or hidden iframes are almost always ads/trackers
      try{
        var w = parseInt(el.getAttribute('width') || el.style.width || '999');
        var h = parseInt(el.getAttribute('height') || el.style.height || '999');
        if((w <= 1 && h <= 1) || el.style.display === 'none' || el.style.visibility === 'hidden') return true;
      }catch(e){}
      // Iframes with no src or about:blank that appear AFTER video starts are suspicious
      if(_videoFound && (!src || src === 'about:blank')){ return true; }
      return false;
    }

    new MutationObserver(function(muts){
      muts.forEach(function(mut){
        mut.addedNodes.forEach(function(n){
          try{ if(n.nodeType===1 && n.tagName==='META' && (n.getAttribute('http-equiv')||'').toLowerCase()==='refresh') n.remove(); }catch(e){}
          try{ if(n.nodeType===1 && n.tagName==='IFRAME' && _isAdIframe(n)) n.remove(); }catch(e){}
          try{ if(n.nodeType===1 && n.tagName==='SCRIPT'){ var src=n.getAttribute('src')||''; if(_isAdUrl(src)) n.remove(); } }catch(e){}
          // Remove newly added anchor tags that are full-page overlay ad links
          try{
            if(n.nodeType===1 && n.tagName==='A'){
              var href = n.getAttribute('href')||'';
              if(_isAdUrl(href)){ n.remove(); return; }
              var s = window.getComputedStyle(n);
              if((s.position==='fixed'||s.position==='absolute') && parseInt(s.zIndex||'0')>10){ n.remove(); }
            }
          }catch(e){}
          // Remove dynamically added divs that cover the full page (popup overlays)
          try{
            if(n.nodeType===1 && (n.tagName==='DIV'||n.tagName==='SECTION')){
              var s = window.getComputedStyle(n);
              if(s.position==='fixed' && parseInt(s.zIndex||'0')>100){
                if(!n.querySelector('video,canvas')){ n.remove(); }
              }
            }
          }catch(e){}
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
    // CAPTCHA / robot verification overlays
    '[class*="captcha"]', '[id*="captcha"]',
    '[class*="recaptcha"]', '[id*="recaptcha"]', '.g-recaptcha',
    '[class*="hcaptcha"]', '[id*="hcaptcha"]',
    '[class*="turnstile"]', '[id*="turnstile"]',
    '[class*="cf-challenge"]', '[id*="cf-challenge"]',
    '[class*="challenge-platform"]', '[id*="challenge-platform"]',
    '[class*="robot"]', '[id*="robot"]',
    '[class*="human-check"]', '[id*="human-check"]',
    '[class*="verify"]', '[id*="verify"]',
    '[class*="verification"]', '[id*="verification"]',
    'div[data-sitekey]', 'div[data-callback]',
    'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]',
    'iframe[src*="turnstile"]', 'iframe[src*="challenges.cloudflare"]',
    'iframe[src*="google.com/recaptcha"]',
    '[class*="are-you-human"]', '[id*="are-you-human"]',
    '[class*="not-robot"]', '[id*="not-robot"]',
    '[class*="bot-check"]', '[id*="bot-check"]',
    '[class*="antibot"]', '[id*="antibot"]',
    // YouTube / social popup iframes
    'iframe[src*="youtube.com"]', 'iframe[src*="youtu.be"]', 'iframe[src*="youtube-nocookie"]',
    'iframe[src*="facebook.com"]', 'iframe[src*="twitter.com"]', 'iframe[src*="instagram.com"]',
    'iframe[src*="tiktok.com"]',
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
      /i.*m\s+(not\s+a\s+)?robot/i,
      /are\s+you\s+(a\s+)?human/i,
      /verify\s+(you\s+are|that\s+you)/i,
      /captcha/i,
      /human\s+verification/i,
      /prove\s+you.*human/i,
      /bot\s+check/i,
      /complete\s+the\s+captcha/i,
      /security\s+check/i,
      /please\s+verify/i,
      /click\s+to\s+verify/i,
      /not\s+a\s+robot/i,
      /recaptcha/i,
      /cloudflare/i,
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
    if(_cleanCount > 60) clearInterval(_cleanInterval);
  }, 1000);

  // ── 5b. Nuke all iframes that aren't the video player — run from start ──
  setInterval(function(){
    document.querySelectorAll('iframe').forEach(function(f){
      var src = (f.getAttribute('src')||'').toLowerCase();
      var id = (f.id||'').toLowerCase();
      var cn = (typeof f.className === 'string' ? f.className : '').toLowerCase();
      // Keep player-related iframes
      if(id.match(/player|video|stream/) || cn.match(/player|video|stream/)) return;
      if(src.match(/\.m3u8|\.mp4|\.ts|player|embed|stream|hls/)) return;
      // Keep same-domain iframes (likely part of the player)
      try{ var fHost = new URL(src, window.location.href).hostname;
        if(fHost === _host || fHost.endsWith('.'+_host)) return;
      }catch(e){}
      // Remove everything else (ads, trackers, captcha)
      try{ f.remove(); }catch(e){}
    });
  }, 2000);

  // ── 6. Auto-play: click play button + start video ────────────────────
  function tryAutoPlay(){
    var videos = document.querySelectorAll('video');
    for(var i=0; i<videos.length; i++){
      var v = videos[i];
      if(v.paused){
        v.autoplay = true;
        v.playsInline = true;
        var p = v.play();
        if(p && p.catch) p.catch(function(){
          v.muted = true; v.play().catch(function(){});
          setTimeout(function(){ try { v.muted = false; } catch(e){} }, 800);
        });
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
})();
`;

const FORCE_PLAY_JS = `
(function(){
  function tryPlayVideos(){
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      // Don't mute — try unmuted first for proper audio
      try {
        v.autoplay = true;
        v.playsInline = true;
        if (v.paused) {
          var p = v.play();
          if (p && p.catch) p.catch(function(){
            // Only mute as last resort if autoplay policy blocks unmuted
            v.muted = true;
            v.play().catch(function(){});
            // Try to unmute after a short delay
            setTimeout(function(){ try { v.muted = false; } catch(e){} }, 800);
          });
        }
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
    var patterns = /vpn|consent|cookie|gdpr|promo|interstitial|popup|subscribe|paywall|ad|banner|captcha|recaptcha|hcaptcha|turnstile|robot|verify|verification|challenge|human-check|bot-check|antibot/i;
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
  setTimeout(function(){ removeBlockingLayers(); clickLikelyPlayButtons(); tryPlayVideos(); }, 500);
  setTimeout(function(){ removeBlockingLayers(); clickLikelyPlayButtons(); tryPlayVideos(); }, 1200);
  setTimeout(function(){ clickLikelyPlayButtons(); tryPlayVideos(); }, 2500);
  setTimeout(function(){ tryPlayVideos(); }, 4000);
})();
`;

// ─── Mid-stream buffer stall detection ────────────────────────────────────────
// Injected after embed loads. Monitors video elements for stalling/errors.
// Posts message to React Native when playback dies mid-stream.
const BUFFER_MONITOR_JS = `
(function(){
  if (window.__nexoraBufferMonitor) return;
  window.__nexoraBufferMonitor = true;
  var stallCount = 0;
  var lastTime = -1;
  var checkInterval = setInterval(function(){
    var videos = document.querySelectorAll('video');
    if (!videos.length) return;
    var v = videos[0];
    if (v.paused || v.ended || v.readyState === 0) return;
    // Check if video time is progressing
    if (v.currentTime === lastTime && v.currentTime > 0) {
      stallCount++;
      if (stallCount >= 6) {
        // 6 checks x 3s = 18s stalled — stream is dead
        clearInterval(checkInterval);
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'midstream_stall', currentTime: v.currentTime
        }));
      }
    } else {
      stallCount = 0;
    }
    lastTime = v.currentTime;
    // Also catch error state
    if (v.error) {
      clearInterval(checkInterval);
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'midstream_error', code: v.error.code
      }));
    }
  }, 3000);
  // Clean up after 2 hours
  setTimeout(function(){ clearInterval(checkInterval); }, 7200000);
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
    trailerKey, title, type, contentId, streamUrl, tmdbId, season, episode, poster,
  } = useLocalSearchParams<{
    trailerKey?: string; title?: string; type?: string; contentId?: string;
    streamUrl?: string; tmdbId?: string; season?: string; episode?: string; poster?: string;
  }>();

  const insets = useSafeAreaInsets();
  const { isFavorite, toggleFavorite, addToHistory, updateProgress, hasPremium } = useNexora();

  // ── Premium gate — block playback if user lacks entitlement ─────────────
  const contentCategory = type === "movie" ? "movies" : type === "series" ? "series" : null;
  const premiumBlocked = contentCategory && !hasPremium(contentCategory as any);

  // Embed provider state — Stream Manager (unified discovery + validation + ranking)
  const streamManagerRef = useRef<StreamManager | null>(null);
  const [rankedSources, setRankedSources] = useState<StreamSource[]>([]);
  const [engineReady, setEngineReady]         = useState(false);
  const [providerIndex, setProviderIndex]     = useState(0);
  const [useFallbackEmbed, setUseFallbackEmbed] = useState(false);
  const [webviewKey, setWebviewKey]           = useState(0);
  const [isLoading, setIsLoading]             = useState(true);
  const [streamError, setStreamError]         = useState<Error | string | null>(null);
  const [streamErrorRef, setStreamErrorRef]   = useState("");
  const providerLoadStartRef = useRef<number>(0);
  const adPopupCountRef = useRef<number>(0);

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

  const provider         = rankedSources[providerIndex]?.providerId || STREAM_PROVIDERS[0].id;
  const allProvidersFailed = providerIndex >= rankedSources.length && rankedSources.length > 0;

  // ── Stream Manager: init, discover, validate, rank on mount ────────────
  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;
    const mgr = new StreamManager(
      tmdbId,
      type || "movie",
      season || "1",
      episode || "1",
      {
        onSourceChanged: (source, index, total) => {
          if (cancelled) return;
          setProviderIndex(index);
          setWebviewKey(k => k + 1);
          setIsLoading(true);
          setStreamError(null);
          setStreamErrorRef("");
        },
        onAllFailed: () => {
          if (cancelled) return;
          setStreamError("Alle servers zijn geprobeerd");
          setStreamErrorRef(buildErrorReference("NX-PLY-ALL"));
          setIsLoading(false);
        },
        onEngineReady: (sources) => {
          if (cancelled) return;
          setRankedSources(sources);
          setEngineReady(true);
        },
        onMidStreamRecovery: (_fromProvider, _toProvider) => {
          if (cancelled) return;
          // Provider switch is handled by onSourceChanged
        },
      },
    );
    streamManagerRef.current = mgr;
    mgr.init();
    return () => { cancelled = true; };
  }, [tmdbId, type, season, episode]);

  // Track load start time whenever provider changes
  useEffect(() => {
    providerLoadStartRef.current = Date.now();
    adPopupCountRef.current = 0;
  }, [providerIndex, webviewKey]);

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
    // More aggressive retry schedule to unfreeze stuck players
    autoplayTimersRef.current.push(
      setTimeout(run, 400),
      setTimeout(run, 1000),
      setTimeout(run, 2000),
      setTimeout(run, 3500),
      setTimeout(run, 6000),
    );
  }, []);

  // ── Controls visibility ───────────────────────────────────────────────────
  const subtitlePickerRef = useRef(false);
  useEffect(() => { subtitlePickerRef.current = showSubtitlePicker; }, [showSubtitlePicker]);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (subtitlePickerRef.current) return; // Don't hide while subtitle picker is open
      Animated.timing(controlsOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(
        () => setControlsVisible(false)
      );
    }, isTV ? 4000 : 5000);
  }, [controlsOpacity]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    scheduleHide();
  }, [controlsOpacity, scheduleHide]);

  // Start auto-hide timer on mount and when subtitle picker closes
  useEffect(() => {
    scheduleHide();
  }, [scheduleHide]);
  useEffect(() => {
    if (!showSubtitlePicker) scheduleHide();
  }, [showSubtitlePicker, scheduleHide]);

  // ── TV Remote event handler (Section 5 & 6) ────────────────────────────
  // On TV: Back button shows controls first, second press exits
  useEffect(() => {
    if (!isTV) return;
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (controlsVisible) {
        router.back();
        return true;
      }
      showControls();
      return true;
    });
    return () => backHandler.remove();
  }, [controlsVisible, showControls]);

  // TV remote key handler — triggers on d-pad and select via Pressable wrapper
  const handleTVKeyDown = useCallback((e: any) => {
    if (!isTV || disposedRef.current) return;
    const key = e?.nativeEvent?.key;
    if (!key) {
      // Any key press on TV should at minimum show controls
      showControls();
      return;
    }
    switch (key) {
      case "Enter":
      case "MediaPlayPause":
      case "select":
        if (controlsVisible) {
          hlsTogglePlay();
        } else {
          showControls();
        }
        break;
      case "ArrowLeft":
        if (controlsVisible) {
          hlsSeekRelative(-15);
        } else {
          showControls();
        }
        break;
      case "ArrowRight":
        if (controlsVisible) {
          hlsSeekRelative(15);
        } else {
          showControls();
        }
        break;
      case "ArrowUp":
      case "ArrowDown":
        showControls();
        break;
      default:
        showControls();
        break;
    }
  }, [controlsVisible, showControls, hlsTogglePlay, hlsSeekRelative]);

  useEffect(() => {
    disposedRef.current = false;
    addToHistory({
      id: contentId || `${type}_${Date.now()}`,
      type: (type as any) || "movie",
      title: String(title || ""),
      poster: poster || null,
      tmdbId: tmdbId ? Number(tmdbId) : undefined,
      lastWatched: new Date().toISOString(),
    });
    scheduleHide();
    return () => {
      // Save final progress before unmount
      const { currentTime: ct, duration: dur } = lastProgressRef.current;
      if (ct > 0 && dur > 0) {
        const id = contentId || `${type}_${Date.now()}`;
        updateProgress(id, ct, dur);
      }
      if (progressSaveTimerRef.current) clearTimeout(progressSaveTimerRef.current);
      // Record playtime for current stream source
      streamManagerRef.current?.recordPlaytimeOnStop();
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
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addToHistory, contentId, scheduleHide, title, type]);

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
        // Track progress for Continue Watching
        lastProgressRef.current = { currentTime: data.currentTime || 0, duration: data.duration || 0 };
        if (!progressSaveTimerRef.current && data.duration > 0) {
          progressSaveTimerRef.current = setTimeout(() => {
            progressSaveTimerRef.current = null;
            const { currentTime: ct, duration: dur } = lastProgressRef.current;
            if (ct > 0 && dur > 0) {
              const id = contentId || `${type}_${Date.now()}`;
              updateProgress(id, ct, dur);
            }
          }, 10000);
        }
      }
    } catch {}
  }, [contentId, type, updateProgress]);

  // ── Provider switching (via Stream Manager) ────────────────────────────
  const tryNextProvider = useCallback(() => {
    const mgr = streamManagerRef.current;
    if (!mgr) return;
    mgr.advanceToNext(adPopupCountRef.current);
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

  // Auto-advance on error (embed only) — wait 6s before advancing so user sees what happened
  useEffect(() => {
    if (!streamError) return;
    if (effectiveStreamUrl && !useFallbackEmbed) return;
    if (!tmdbId || allProvidersFailed) return;
    const t = setTimeout(() => tryNextProvider(), 6000);
    return () => clearTimeout(t);
  }, [streamError, effectiveStreamUrl, useFallbackEmbed, tmdbId, allProvidersFailed, tryNextProvider]);

  // Auto-advance on slow load (embed only) — give provider 20s to load
  useEffect(() => {
    if (!isLoading) return;
    if (effectiveStreamUrl && !useFallbackEmbed) return;
    if (!tmdbId || allProvidersFailed) return;
    const t = setTimeout(() => tryNextProvider(), 20000);
    return () => clearTimeout(t);
  }, [isLoading, webviewKey, effectiveStreamUrl, useFallbackEmbed, tmdbId, allProvidersFailed, tryNextProvider]);

  // ── What to render ────────────────────────────────────────────────────────
  const embedUrl: string | null = (() => {
    if (allProvidersFailed) return null;
    if (tmdbId) {
      const mgr = streamManagerRef.current;
      if (mgr) return mgr.getCurrentRawEmbedUrl();
      return getEmbedUrl(provider, tmdbId, type || "movie", season || "1", episode || "1");
    }
    if (trailerKey) return `https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
    return null;
  })();

  const hlsHtml: string | null = (effectiveStreamUrl && !useFallbackEmbed) ? buildHlsHtml(effectiveStreamUrl) : null;
  const embedUrlWithAutoplay: string | null = (!hlsHtml && embedUrl) ? withAutoplayParams(embedUrl) : null;
  const hasSource = !!(hlsHtml || embedUrlWithAutoplay);
  // While waiting for StreamManager to resolve, treat as loading (not "no content")
  const stillDiscovering = !!tmdbId && !hasSource && !allProvidersFailed;

  // ── onShouldStartLoadWithRequest ─────────────────────────────────────────
  // Block: ad domains, AND any top-frame navigation away from the embed domain.
  // Allow: sub-frame requests, streaming files, same-domain navigations.
  const makeNavGuard = useCallback((currentEmbedUrl: string) => {
    return (req: any) => {
      const url: string = req.url || "";
      if (!url || url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) return true;

      const BLOCK_PATTERNS = [
        /play\.google\.com\/store/i,
        /apps\.apple\.com/i,
        /install\s*and\s*continue/i,
        /vpn\s*recommended/i,
        /casino|gambling|bet365|1xbet|stake\.com|betway|poker|slots/i,
        /vpn|norton|mcafee|avast|cleanmaster|antivirus/i,
        /download.*app|install.*app/i,
        /subscribe.*premium|premium.*offer/i,
        /survey|reward|prize|winner|congratulat/i,
        /dating|singles|meet.*local/i,
        /captcha|recaptcha|hcaptcha|turnstile/i,
        /challenges\.cloudflare/i,
        /i.m.not.a.robot|are.you.human|verify.*human/i,
        /youtube\.com|youtu\.be|youtube-nocookie\.com/i,
        /facebook\.com|twitter\.com\/|x\.com\/|instagram\.com|tiktok\.com/i,
        /t\.me\/|telegram\.org/i,
      ];
      if (BLOCK_PATTERNS.some((pattern) => pattern.test(url))) { adPopupCountRef.current++; return false; }

      // Block known ad/tracker domains
      if (AD_DOMAINS.some(d => url.includes(d))) { adPopupCountRef.current++; return false; }

      // Block any URL with obvious ad query params
      try {
        const parsed = new URL(url);
        const suspiciousParams = ["clickid", "aff_id", "aff_sub", "campaign_id", "ad_id", "utm_medium"];
        if (suspiciousParams.some(p => parsed.searchParams.has(p))) return false;
      } catch {}

      try {
        const embedHost = new URL(currentEmbedUrl).hostname;
        const reqHost   = new URL(url).hostname;
        const isSameDomain = reqHost === embedHost || reqHost.endsWith("." + embedHost);
        const isKnownVideoHost = ALLOWED_VIDEO_HOSTS.some((snippet) => reqHost.includes(snippet));
        if (!isSameDomain) {
          if (/\.(m3u8|mp4|ts|webm|mpd|mkv)(\?|$)/i.test(url)) return true;
          if (isKnownVideoHost) return true;
          adPopupCountRef.current++;
          return false;
        }
      } catch {}
      return true;
    };
  }, []);

  // ── onNavigationStateChange — backup popup blocker ─────────────────────────
  // Fires AFTER navigation starts; stops loading if the URL left the embed domain.
  // Catches anything that slips past onShouldStartLoadWithRequest.
  const makeNavStateGuard = useCallback((currentEmbedUrl: string) => {
    return (navState: any) => {
      if (disposedRef.current) return;
      const url: string = navState.url || "";
      if (!url || url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) return;
      if (/play\.google\.com\/store|apps\.apple\.com|install\s*and\s*continue|vpn\s*recommended|casino|gambling|bet365|1xbet|stake\.com|betway|poker|slots|norton|mcafee|avast|cleanmaster|survey|reward|prize|winner|dating|singles|youtube\.com|youtu\.be|youtube-nocookie|facebook\.com|twitter\.com|x\.com\/|instagram\.com|tiktok\.com|t\.me\/|telegram\.org/i.test(url)) {
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
        const isKnownVideoHost = ALLOWED_VIDEO_HOSTS.some((snippet) => reqHost.includes(snippet));
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
          source={{ uri: embedUrlWithAutoplay }}
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
          injectedJavaScriptBeforeContentLoaded={AD_BLOCK_JS}
          onLoadProgress={({ nativeEvent }) => {
            // Start autoplay attempts early, as soon as page is ~60% loaded
            if (nativeEvent.progress > 0.6 && !disposedRef.current) {
              embedWebviewRef.current?.injectJavaScript(`${FORCE_PLAY_JS};true;`);
            }
          }}
          onLoad={() => {
            if (!disposedRef.current) {
              setIsLoading(false); setStreamError(null); setStreamErrorRef(""); injectEmbedAutoplay();
              // Inject buffer monitor for mid-stream recovery
              embedWebviewRef.current?.injectJavaScript(`${BUFFER_MONITOR_JS};true;`);
              const loadTime = Date.now() - providerLoadStartRef.current;
              // Record success via Stream Manager
              const mgr = streamManagerRef.current;
              if (mgr) {
                mgr.recordPlaybackSuccess(loadTime, adPopupCountRef.current).then(() => {
                  mgr.rerank();
                  setRankedSources([...mgr.getState().sources]);
                });
              }
            }
          }}
          onError={(event) => {
            if (disposedRef.current) return;
            const msg = String(event?.nativeEvent?.description || "");
            if (/removechild|notfounderror|not a child|hierarchyrequesterror/i.test(msg)) {
              setIsLoading(false);
              return;
            }
            // Record failure via Stream Manager
            const mgr = streamManagerRef.current;
            if (mgr) {
              mgr.recordPlaybackFailure(adPopupCountRef.current).then(() => {
                mgr.rerank();
                setRankedSources([...mgr.getState().sources]);
              });
            }
            setIsLoading(false);
            setStreamError(msg || "Stream could not be loaded");
            setStreamErrorRef(prev => prev || buildErrorReference("NX-PLY"));
          }}
          onShouldStartLoadWithRequest={makeNavGuard(embedUrl)}
          onNavigationStateChange={makeNavStateGuard(embedUrl)}
          onMessage={(event) => {
            if (disposedRef.current) return;
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === "midstream_stall" || data.type === "midstream_error") {
                const mgr = streamManagerRef.current;
                if (mgr) mgr.handleMidStreamFailure();
              }
            } catch {}
          }}
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
    <Pressable
      style={styles.container}
      onKeyDown={isTV ? handleTVKeyDown : undefined}
      onPress={isTV ? showControls : undefined}
    >
      <StatusBar hidden />

      {/* Video area */}
      <View style={styles.videoArea}>
        <SilentResetBoundary>
        {hasSource ? (
          Platform.OS === "web" ? renderWebPlayer() : renderNativePlayer()
        ) : stillDiscovering ? (
          <View style={styles.noContent}>
            <LinearGradient colors={[COLORS.card, "#000"]} style={StyleSheet.absoluteFill} />
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.noTitle}>Beste server zoeken...</Text>
          </View>
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

        {/* Spinner */}
        {isLoading && hasSource && Platform.OS !== "web" && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>
              {(tmdbId && !effectiveStreamUrl) || (useFallbackEmbed && tmdbId)
                ? !engineReady
                  ? "AI Stream Engine analyseren..."
                  : `Beste server selecteren... (${providerIndex + 1}/${rankedSources.length})`
                : "Laden..."}
            </Text>
          </View>
        )}

        {/* All-providers-failed error */}
        {(allProvidersFailed || (!isLoading && streamError && !tmdbId)) && Platform.OS !== "web" && (
          <View style={styles.streamErrorOverlay}>
            <Ionicons name="warning-outline" size={18} color={COLORS.live} />
            <Text style={styles.streamErrorText}>Stream momenteel niet beschikbaar.</Text>
            <Text style={styles.streamErrorRef}>Foutcode: {streamErrorRef || "NX-PLY"}</Text>
            <TouchableOpacity
              style={styles.streamRetryBtn}
              onPress={() => {
                setStreamError(null); setStreamErrorRef("");
                setIsLoading(true); setProviderIndex(0); setWebviewKey(k => k + 1);
                // Restart Stream Manager for fresh probe + re-rank
                const mgr = streamManagerRef.current;
                if (mgr) mgr.restart();
              }}
            >
              <Text style={styles.streamRetryText}>Opnieuw proberen</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ─── Full-screen interceptor — show controls on tap (HLS only, embed needs WebView touches) ─── */}
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
          {/* Background tap area — dismisses overlay on empty-space tap */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => { setShowSubtitlePicker(false); setControlsVisible(false); }}
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
              {!isTV && !!streamUrl && (
                <TouchableOpacity style={styles.iconBtn} onPress={handleOpenInVlc}>
                  <Ionicons name="open-outline" size={20} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
              )}
              {!isTV && (!!streamUrl || !!embedUrl) && (
                <TouchableOpacity style={styles.iconBtn} onPress={handleShare}>
                  <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
              )}
              {subtitleTracks.length > 0 && (
                <TouchableOpacity style={styles.iconBtn} onPress={() => { setShowSubtitlePicker(s => !s); scheduleHide(); }}>
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
              <TouchableOpacity style={[styles.hlsSkipBtn, isTV && styles.hlsSkipBtnTV]} onPress={() => { hlsSeekRelative(-15); scheduleHide(); }} activeOpacity={0.7}>
                <View style={[styles.hlsSkipBtnInner, isTV && styles.hlsSkipBtnInnerTV]}>
                  <Ionicons name="play-back" size={isTV ? 28 : 22} color="#fff" />
                </View>
                <Text style={[styles.hlsSkipLabel, isTV && { fontSize: 13 }]}>15s</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.hlsPlayBtn, isTV && styles.hlsPlayBtnTV]} onPress={() => { hlsTogglePlay(); scheduleHide(); }} activeOpacity={0.8}>
                <Ionicons name={hlsPaused ? "play" : "pause"} size={isTV ? 52 : 40} color="#fff" style={hlsPaused ? { marginLeft: isTV ? 6 : 4 } : undefined} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.hlsSkipBtn, isTV && styles.hlsSkipBtnTV]} onPress={() => { hlsSeekRelative(15); scheduleHide(); }} activeOpacity={0.7}>
                <View style={[styles.hlsSkipBtnInner, isTV && styles.hlsSkipBtnInnerTV]}>
                  <Ionicons name="play-forward" size={isTV ? 28 : 22} color="#fff" />
                </View>
                <Text style={[styles.hlsSkipLabel, isTV && { fontSize: 13 }]}>15s</Text>
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
        /* ─── Embed mode: clean overlay — back + safe refresh + subtitle + server switch ─── */
        <Animated.View style={[styles.embedMinimalOverlay, { opacity: controlsOpacity }]} pointerEvents={controlsVisible ? "box-none" : "none"}>
          {/* Background tap to dismiss */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => { setShowSubtitlePicker(false); setControlsVisible(false); }}
            activeOpacity={1}
          />
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
            {/* Subtitle button (embed mode) */}
            {subtitleTracks.length > 0 && (
              <TouchableOpacity style={styles.embedServerBtn} onPress={() => { setShowSubtitlePicker(s => !s); scheduleHide(); }}>
                <Ionicons name="text" size={16} color={activeSubtitle ? COLORS.accent : "#fff"} />
              </TouchableOpacity>
            )}
            {/* Safe refresh: retry current stream in-app, then advance to next */}
            {!allProvidersFailed && (
              <TouchableOpacity
                style={styles.embedServerBtn}
                onPress={() => {
                  SafeHaptics.impactLight();
                  // Safe refresh: reload current WebView without external navigation
                  setWebviewKey(k => k + 1);
                  setIsLoading(true);
                  setStreamError(null);
                  setStreamErrorRef("");
                  scheduleHide();
                }}
              >
                <Ionicons name="refresh" size={16} color="#fff" />
              </TouchableOpacity>
            )}
            {/* Switch to next server */}
            {!allProvidersFailed && (
              <TouchableOpacity
                style={styles.embedServerBtn}
                onPress={() => { tryNextProvider(); SafeHaptics.impactLight(); scheduleHide(); }}
              >
                <Ionicons name="swap-horizontal" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </LinearGradient>

          {/* Subtitle picker dropdown (embed mode) */}
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
        </Animated.View>
      ) : null}
    </Pressable>
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
  playerTitle: { fontFamily: "Inter_700Bold", fontSize: isTV ? 22 : 15, color: "#fff", letterSpacing: 0.2 },
  playerSub:   { fontFamily: "Inter_500Medium", fontSize: isTV ? 15 : 11, color: "rgba(255,255,255,0.55)", marginTop: 2 },
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
  hlsPlayBtnTV: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.35)",
  },
  hlsSkipBtn:  { alignItems: "center", gap: 4 },
  hlsSkipBtnTV: { gap: 6 },
  hlsSkipBtnInner: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  hlsSkipBtnInnerTV: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  hlsSkipLabel: { fontFamily: "Inter_500Medium", fontSize: 10, color: "rgba(255,255,255,0.6)" },

  hlsBottomBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, gap: 12,
  },
  hlsTime: { fontFamily: "Inter_600SemiBold", fontSize: isTV ? 16 : 12, color: "rgba(255,255,255,0.9)", minWidth: isTV ? 56 : 42, textAlign: "left" },
  hlsTimeDuration: { fontFamily: "Inter_500Medium", fontSize: isTV ? 16 : 12, color: "rgba(255,255,255,0.5)", minWidth: isTV ? 56 : 42, textAlign: "right" },
  hlsSeekOuter: {
    flex: 1, height: 32, justifyContent: "center",
    position: "relative",
  },
  hlsSeekTrack: {
    height: isTV ? 6 : 3.5, backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3, overflow: "hidden",
    flexDirection: "row",
  },
  hlsSeekFill: { height: "100%", backgroundColor: COLORS.accent, borderRadius: 3 },
  hlsSeekThumb: {
    position: "absolute", top: "50%", marginTop: isTV ? -9 : -7,
    marginLeft: isTV ? -9 : -7,
    width: isTV ? 18 : 14, height: isTV ? 18 : 14,
    borderRadius: isTV ? 9 : 7, backgroundColor: COLORS.accent,
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
