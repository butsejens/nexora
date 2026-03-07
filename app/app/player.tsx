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
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { SafeHaptics } from "@/lib/safeHaptics";
import { openInVlc } from "@/lib/vlc";
import { buildErrorReference } from "@/lib/error-messages";

// ─── Stream providers ──────────────────────────────────────────────────────────
const STREAM_PROVIDERS = [
  { id: "vidsrcto",     label: "Server 1"  },
  { id: "embedsu",      label: "Server 2"  },
  { id: "autoembed",    label: "Server 3"  },
  { id: "vidsrcpro",    label: "Server 4"  },
  { id: "2embed",       label: "Server 5"  },
  { id: "moviesapi",    label: "Server 6"  },
  { id: "vidsrcme",     label: "Server 7"  },
  { id: "vidsrcxyz",    label: "Server 8"  },
  { id: "vidlink",      label: "Server 9"  },
  { id: "multiembed",   label: "Server 10" },
  { id: "vidsrcicu",    label: "Server 11" },
  { id: "videasy",      label: "Server 12" },
  { id: "nontongo",     label: "Server 13" },
  { id: "111movies",    label: "Server 14" },
  { id: "smashystream", label: "Server 15" },
  { id: "embedcc",      label: "Server 16" },
  { id: "rive",         label: "Server 17" },
  { id: "primewire",    label: "Server 18" },
];

function getEmbedUrl(provider: string, tmdbId: string, type: string, season: string, episode: string): string {
  const s = season || "1";
  const e = episode || "1";
  const isMovie = type !== "series";
  switch (provider) {
    case "vidsrcto":
      return isMovie
        ? `https://vidsrc.to/embed/movie/${tmdbId}`
        : `https://vidsrc.to/embed/tv/${tmdbId}/${s}/${e}`;
    case "embedsu":
      return isMovie
        ? `https://embed.su/embed/movie/${tmdbId}`
        : `https://embed.su/embed/tv/${tmdbId}/${s}/${e}`;
    case "autoembed":
      return isMovie
        ? `https://autoembed.co/movie/tmdb/${tmdbId}`
        : `https://autoembed.co/tv/tmdb/${tmdbId}-${s}-${e}`;
    case "vidsrcpro":
      return isMovie
        ? `https://vidsrc.pro/embed/movie/${tmdbId}`
        : `https://vidsrc.pro/embed/tv/${tmdbId}?s=${s}&e=${e}`;
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
    case "vidlink":
      return isMovie
        ? `https://vidlink.pro/movie/${tmdbId}`
        : `https://vidlink.pro/tv/${tmdbId}/${s}/${e}`;
    case "multiembed":
      return isMovie
        ? `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`
        : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${s}&e=${e}`;
    case "vidsrcicu":
      return isMovie
        ? `https://vidsrc.icu/embed/movie/${tmdbId}`
        : `https://vidsrc.icu/embed/tv/${tmdbId}/${s}/${e}`;
    case "videasy":
      return isMovie
        ? `https://player.videasy.net/movie/${tmdbId}`
        : `https://player.videasy.net/tv/${tmdbId}/${s}/${e}`;
    case "nontongo":
      return isMovie
        ? `https://www.nontongo.win/embed/movie/${tmdbId}`
        : `https://www.nontongo.win/embed/tv/${tmdbId}/${s}/${e}`;
    case "111movies":
      return isMovie
        ? `https://111movies.com/movie/${tmdbId}`
        : `https://111movies.com/tv/${tmdbId}/${s}/${e}`;
    case "smashystream":
      return isMovie
        ? `https://player.smashystream.com/movie/${tmdbId}`
        : `https://player.smashystream.com/tv/${tmdbId}/${s}/${e}`;
    case "embedcc":
      return isMovie
        ? `https://www.embedcc.com/embed/movie/${tmdbId}`
        : `https://www.embedcc.com/embed/tv/${tmdbId}/${s}/${e}`;
    case "rive":
      return isMovie
        ? `https://rivestream.live/embed?type=movie&id=${tmdbId}`
        : `https://rivestream.live/embed?type=tv&id=${tmdbId}&season=${s}&episode=${e}`;
    case "primewire":
      return isMovie
        ? `https://www.primewire.tf/embed/movie?tmdb=${tmdbId}`
        : `https://www.primewire.tf/embed/tv?tmdb=${tmdbId}&season=${s}&episode=${e}`;
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
];

// ─── JS injected in embed WebView ─────────────────────────────────────────────
// Blocks: window.open, target="_blank" links, alert/confirm dialogs,
// location.assign / location.replace / location.href navigation to off-domain URLs,
// and <meta http-equiv="refresh"> redirects.
const AD_BLOCK_JS = `
(function(){
  var _host = window.location.hostname;

  // Block ALL window.open() calls
  window.open = function(){ return null; };

  // Block target="_blank" / _top / _parent link clicks
  document.addEventListener('click', function(e){
    var el = e.target;
    for(var i = 0; i < 6; i++){
      if(!el) break;
      if(el.tagName === 'A'){
        var target = el.getAttribute('target');
        if(target === '_blank' || target === '_top' || target === '_parent'){
          e.preventDefault(); e.stopPropagation(); return false;
        }
      }
      el = el.parentElement;
    }
  }, true);

  // Block alert / confirm / prompt
  window.alert   = function(){};
  window.confirm = function(){ return true; };
  window.prompt  = function(){ return ''; };

  // Block off-domain navigation via location.assign / location.replace / location.href
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
    // Override window.location setter (works in most Chromium-based WebViews)
    try{
      var _locDesc = Object.getOwnPropertyDescriptor(window, 'location');
      if(!_locDesc || _locDesc.configurable){
        Object.defineProperty(window, 'location', {
          get: function(){ return _locDesc ? _locDesc.get.call(window) : location; },
          set: function(v){
            if(_isSafe(String(v))){ if(_locDesc && _locDesc.set) _locDesc.set.call(window, v); }
          },
          configurable: true
        });
      }
    }catch(e){}
    // Guard top/parent references from within iframes
    try{ if(top !== window){
      top.location.assign  = window.location.assign;
      top.location.replace = window.location.replace;
    }}catch(e){}
  })();

  // Remove <meta http-equiv="refresh"> redirect tags (current + future)
  (function(){
    var removeRefresh = function(){
      document.querySelectorAll('meta[http-equiv]').forEach(function(m){
        if((m.getAttribute('http-equiv')||'').toLowerCase() === 'refresh') m.remove();
      });
    };
    if(document.readyState !== 'loading'){ removeRefresh(); }
    else{ document.addEventListener('DOMContentLoaded', removeRefresh); }
    var obs = new MutationObserver(function(muts){
      muts.forEach(function(mut){
        mut.addedNodes.forEach(function(n){
          if(n.nodeType===1 && n.tagName==='META' &&
             (n.getAttribute('http-equiv')||'').toLowerCase()==='refresh') n.remove();
        });
      });
    });
    obs.observe(document.documentElement||document.body||document,
                {childList:true, subtree:true});
  })();
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
<div id="err">Stream kon niet laden.<br>Probeer opnieuw of kies een ander kanaal.</div>
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
      if(cmd.type === 'toggle'){ v.paused ? v.play().catch(function(){}) : v.pause(); }
      if(cmd.type === 'seek')   { v.currentTime = Number(cmd.time) || 0; }
      if(cmd.type === 'seekRel'){ v.currentTime = Math.max(0, (v.currentTime||0) + (Number(cmd.delta)||0)); }
    }catch(e){}
  });

  function showError(){
    document.getElementById('err').style.display = 'block';
    rn({type:'error'});
  }

  function tryDirect(url){
    v.src = url; v.muted = false;
    v.play().catch(function(){});
    v.onerror = function(){ if(fallback && tried < 1){ tried++; tryDirect(fallback); } else { showError(); } };
  }

  function loadWithHls(url, onFail){
    var h = new Hls({enableWorker:false,lowLatencyMode:true,backBufferLength:0,maxBufferLength:30});
    h.loadSource(url); h.attachMedia(v);
    h.on(Hls.Events.MANIFEST_PARSED, function(){ v.muted=false; v.play().catch(function(){}); });
    h.on(Hls.Events.LEVEL_LOADED,    function(e,d){ isLive = !!(d&&d.details&&d.details.live); sendState(); });
    h.on(Hls.Events.ERROR,           function(e,d){ if(d.fatal){ h.destroy(); onFail(); } });
  }

  if(typeof Hls !== 'undefined' && Hls.isSupported()){
    loadWithHls(primary, function(){ tryDirect(fallback || primary); });
  } else if(v.canPlayType('application/vnd.apple.mpegurl')){
    v.src = primary; v.play().catch(function(){});
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

// ─── Embed player control scripts ─────────────────────────────────────────────
// Finds video in top frame or same-origin iframes (cross-origin iframes are blocked by browser)
const FIND_VIDEO_FN = `function _fv(){var v=document.querySelector("video");if(!v){var fs=document.querySelectorAll("iframe");for(var i=0;i<fs.length;i++){try{var d=fs[i].contentDocument||(fs[i].contentWindow&&fs[i].contentWindow.document);var iv=d&&d.querySelector("video");if(iv){v=iv;break;}}catch(e){}}}return v;}`;

// Strategy order: 1) direct video  2) center-click sim  3) postMessage to iframes  4) spacebar keyboard sim
const EMBED_TOGGLE_JS = `(function(){${FIND_VIDEO_FN}
  var v=_fv();
  if(v){if(v.paused)v.play().catch(function(){});else v.pause();return;}
  try{
    var cx=window.innerWidth/2,cy=window.innerHeight/2;
    var el=document.elementFromPoint(cx,cy);
    if(el&&el!==document.documentElement&&el!==document.body){
      ["mousedown","mouseup","click"].forEach(function(t){
        el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window,clientX:cx,clientY:cy}));
      });
      try{el.dispatchEvent(new TouchEvent("touchstart",{bubbles:true,cancelable:true,touches:[new Touch({identifier:1,target:el,clientX:cx,clientY:cy})]}));}catch(e){}
      try{el.dispatchEvent(new TouchEvent("touchend",{bubbles:true,cancelable:true}));}catch(e){}
      return;
    }
  }catch(e){}
  var frs=[];try{frs=Array.from(window.frames);}catch(e){}
  frs.forEach(function(f){
    try{f.postMessage({action:"pause"},"*");}catch(e){}
    try{f.postMessage({type:"pause"},"*");}catch(e){}
    try{f.postMessage({event:"command",func:"pauseVideo"},"*");}catch(e){}
    try{f.postMessage(JSON.stringify({action:"pause"}),"*");}catch(e){}
  });
  try{
    document.dispatchEvent(new KeyboardEvent("keydown",{key:" ",code:"Space",keyCode:32,which:32,bubbles:true,cancelable:true}));
    document.dispatchEvent(new KeyboardEvent("keyup",{key:" ",code:"Space",keyCode:32,which:32,bubbles:true}));
  }catch(e){}
})()`;

function buildEmbedSeekJS(delta: number): string {
  const key = delta > 0 ? "ArrowRight" : "ArrowLeft";
  const kc  = delta > 0 ? 39 : 37;
  // Most players move 5 s per arrow key press; repeat to reach target delta
  const reps = Math.max(1, Math.round(Math.abs(delta) / 5));
  return `(function(){${FIND_VIDEO_FN}
  var v=_fv();
  if(v&&isFinite(v.currentTime)){v.currentTime=Math.max(0,v.currentTime+${delta});return;}
  var frs=[];try{frs=Array.from(window.frames);}catch(e){}
  frs.forEach(function(f){
    try{f.postMessage({action:"seek",offset:${delta}},"*");}catch(e){}
    try{f.postMessage({type:"seek",seconds:${delta}},"*");}catch(e){}
  });
  for(var i=0;i<${reps};i++){
    try{document.dispatchEvent(new KeyboardEvent("keydown",{key:"${key}",code:"${key}",keyCode:${kc},which:${kc},bubbles:true,cancelable:true}));}catch(e){}
    try{document.dispatchEvent(new KeyboardEvent("keyup",{key:"${key}",code:"${key}",keyCode:${kc},which:${kc},bubbles:true}));}catch(e){}
  }
})()`;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PlayerScreen() {
  const {
    trailerKey, title, type, contentId, streamUrl, tmdbId, season, episode,
  } = useLocalSearchParams<{
    trailerKey?: string; title?: string; type?: string; contentId?: string;
    streamUrl?: string; tmdbId?: string; season?: string; episode?: string;
  }>();

  const insets = useSafeAreaInsets();
  const { isFavorite, toggleFavorite, addToHistory } = useNexora();

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
  const [hlsPaused, setHlsPaused]       = useState(false);
  const [hlsDuration, setHlsDuration]   = useState(0);
  const [hlsCurrentTime, setHlsCurrentTime] = useState(0);
  const [hlsIsLive, setHlsIsLive]       = useState(false);
  const [seekBarWidth, setSeekBarWidth]  = useState(1);

  const provider         = STREAM_PROVIDERS[providerIndex]?.id || STREAM_PROVIDERS[0].id;
  const allProvidersFailed = providerIndex >= STREAM_PROVIDERS.length;

  // ── Controls visibility ───────────────────────────────────────────────────
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(
        () => setControlsVisible(false)
      );
    }, 5000);
  }, [controlsOpacity]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    scheduleHide();
  }, [controlsOpacity, scheduleHide]);

  useEffect(() => {
    addToHistory({
      id: contentId || `${type}_${Date.now()}`,
      type: (type as any) || "movie",
      title: String(title || ""),
      lastWatched: new Date().toISOString(),
    });
    scheduleHide();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [addToHistory, contentId, scheduleHide, title, type]);

  useEffect(() => {
    setIsLoading(true);
    setStreamError(null);
    setStreamErrorRef("");
  }, [webviewKey, provider]);

  // ── HLS control commands ──────────────────────────────────────────────────
  const hlsInject = useCallback((js: string) => {
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
  const embedInject = useCallback((js: string) => {
    embedWebviewRef.current?.injectJavaScript(`${js};true;`);
  }, []);

  const embedTogglePlay = useCallback(() => {
    embedInject(EMBED_TOGGLE_JS);
    SafeHaptics.impactLight();
    showControls();
  }, [embedInject, showControls]);

  const embedSeekRelative = useCallback((delta: number) => {
    embedInject(buildEmbedSeekJS(delta));
    SafeHaptics.impactLight();
    showControls();
  }, [embedInject, showControls]);

  const handleHlsMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "state") {
        setHlsPaused(data.paused);
        setHlsCurrentTime(data.currentTime || 0);
        setHlsDuration(data.duration || 0);
        setHlsIsLive(data.isLive || false);
      }
    } catch {}
  }, []);

  // ── Provider switching ────────────────────────────────────────────────────
  const tryNextProvider = useCallback(() => {
    setProviderIndex(i => i + 1);
    setWebviewKey(k => k + 1);
    setStreamError(null);
    setStreamErrorRef("");
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
    if (streamUrl && !useFallbackEmbed) return;
    if (!tmdbId || allProvidersFailed) return;
    const t = setTimeout(() => tryNextProvider(), 1200);
    return () => clearTimeout(t);
  }, [streamError, streamUrl, useFallbackEmbed, tmdbId, allProvidersFailed, tryNextProvider]);

  // Auto-advance on slow load (embed only)
  useEffect(() => {
    if (!isLoading) return;
    if (streamUrl && !useFallbackEmbed) return;
    if (!tmdbId || allProvidersFailed) return;
    const t = setTimeout(() => tryNextProvider(), 15000);
    return () => clearTimeout(t);
  }, [isLoading, webviewKey, streamUrl, useFallbackEmbed, tmdbId, allProvidersFailed, tryNextProvider]);

  // ── What to render ────────────────────────────────────────────────────────
  const embedUrl: string | null = (() => {
    if (allProvidersFailed) return null;
    if (tmdbId) return getEmbedUrl(provider, tmdbId, type || "movie", season || "1", episode || "1");
    if (trailerKey) return `https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
    return null;
  })();

  const hlsHtml: string | null = (streamUrl && !useFallbackEmbed) ? buildHlsHtml(streamUrl) : null;
  const hasSource = !!(hlsHtml || embedUrl);

  // ── onShouldStartLoadWithRequest ─────────────────────────────────────────
  // Block: ad domains, AND any top-frame navigation away from the embed domain.
  // Allow: sub-frame requests, streaming files, same-domain navigations.
  const makeNavGuard = useCallback((currentEmbedUrl: string) => {
    return (req: any) => {
      const url: string = req.url || "";
      if (!url || url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) return true;

      // Block known ad/tracker domains
      if (AD_DOMAINS.some(d => url.includes(d))) return false;

      // Only restrict top-frame (main page) navigations
      if (req.isTopFrame) {
        try {
          const embedHost = new URL(currentEmbedUrl).hostname;
          const reqHost   = new URL(url).hostname;
          const isSameDomain = reqHost === embedHost || reqHost.endsWith("." + embedHost);
          if (!isSameDomain) {
            // Allow video/stream file extensions regardless of domain
            if (/\.(m3u8|mp4|ts|webm|mpd|mkv)(\?|$)/i.test(url)) return true;
            // Block off-domain top-frame navigation (popup ads)
            return false;
          }
        } catch {}
      }
      return true;
    };
  }, []);

  // ── onNavigationStateChange — backup popup blocker ─────────────────────────
  // Fires AFTER navigation starts; stops loading if the URL left the embed domain.
  // Catches anything that slips past onShouldStartLoadWithRequest.
  const makeNavStateGuard = useCallback((currentEmbedUrl: string) => {
    return (navState: any) => {
      const url: string = navState.url || "";
      if (!url || url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) return;
      if (AD_DOMAINS.some(d => url.includes(d))) {
        embedWebviewRef.current?.stopLoading();
        return;
      }
      try {
        const embedHost = new URL(currentEmbedUrl).hostname;
        const reqHost   = new URL(url).hostname;
        const isSameDomain = reqHost === embedHost || reqHost.endsWith("." + embedHost);
        if (!isSameDomain && !/\.(m3u8|mp4|ts|webm|mpd|mkv)(\?|$)/i.test(url)) {
          embedWebviewRef.current?.stopLoading();
          embedWebviewRef.current?.goBack();
        }
      } catch {}
    };
  }, []);

  // ── Web (iframe) player ───────────────────────────────────────────────────
  const renderWebPlayer = () => {
    const src = hlsHtml ? undefined : embedUrl;
    if (!src && !hlsHtml) return null;
    return (
      <iframe
        key={webviewKey}
        src={src || undefined}
        srcDoc={hlsHtml || undefined}
        title={`Nexora ${String(title || "stream")}`}
        style={styles.webFrame as any}
        allow="autoplay; fullscreen; accelerometer; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
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
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mixedContentMode="always"
          originWhitelist={["http://*", "https://*", "blob:*"]}
          userAgent="Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          onMessage={handleHlsMessage}
          onLoad={() => { setIsLoading(false); setStreamError(null); }}
          onError={(event) => {
            if (tmdbId && !useFallbackEmbed) {
              setUseFallbackEmbed(true);
              setIsLoading(true);
              setStreamError(null);
            } else {
              setIsLoading(false);
              const msg = event?.nativeEvent?.description || "Stream kon niet laden";
              setStreamError(msg);
              setStreamErrorRef(prev => prev || buildErrorReference("NX-PLY"));
            }
          }}
        />
      );
    }

    if (embedUrl) {
      return (
        <WebView
          key={webviewKey}
          ref={embedWebviewRef}
          source={{ uri: embedUrl }}
          style={styles.webview}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          mixedContentMode="always"
          originWhitelist={["http://*", "https://*", "about:*", "blob:*"]}
          userAgent="Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          injectedJavaScriptBeforeContentLoaded={AD_BLOCK_JS}
          onLoad={() => { setIsLoading(false); setStreamError(null); setStreamErrorRef(""); }}
          onError={(event) => {
            setIsLoading(false);
            setStreamError(event?.nativeEvent?.description || "Stream kon niet laden");
            setStreamErrorRef(prev => prev || buildErrorReference("NX-PLY"));
          }}
          onShouldStartLoadWithRequest={makeNavGuard(embedUrl)}
          onNavigationStateChange={makeNavStateGuard(embedUrl)}
          scalesPageToFit={false}
        />
      );
    }
    return null;
  };

  // ── Seek bar progress (0–1) ───────────────────────────────────────────────
  const seekProgress = hlsDuration > 0 ? Math.min(hlsCurrentTime / hlsDuration, 1) : 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Video area */}
      <View style={styles.videoArea}>
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

        {/* Spinner */}
        {isLoading && hasSource && Platform.OS !== "web" && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>
              {(tmdbId && !streamUrl) || (useFallbackEmbed && tmdbId)
                ? `Verbinding zoeken... (${providerIndex + 1}/${STREAM_PROVIDERS.length})`
                : "Laden..."}
            </Text>
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

      {/* ─── Full-screen interceptor — HLS and embed modes ──────────────────
          Intercepts all taps when controls are hidden:
          - HLS: shows overlay controls
          - Embed: shows controls AND prevents ad tap-throughs
      ─────────────────────────────────────────────────────────────────────── */}
      {(hlsHtml || embedUrl) && Platform.OS !== "web" && !controlsVisible && (
        <TouchableOpacity
          style={styles.hlsTouchScreen}
          onPress={showControls}
          activeOpacity={1}
        />
      )}

      {/* ─── Controls overlay ─────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.overlay, { opacity: controlsOpacity }]}
        pointerEvents={controlsVisible ? "auto" : "none"}
      >
        {/* Background tap area — FIRST child = lowest priority.
            Tapping empty space dismisses the overlay; buttons (rendered after)
            still receive touches normally because they're higher in paint order. */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={() => setControlsVisible(false)}
          activeOpacity={1}
        />
        {/* Top bar */}
        <LinearGradient colors={["rgba(0,0,0,0.85)", "transparent"]} style={styles.topGrad}>
          <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 8 }]}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => { SafeHaptics.impactLight(); router.back(); }}>
              <Ionicons name="chevron-down" size={28} color="#fff" />
            </TouchableOpacity>
            <View style={styles.titleWrap}>
              <Text style={styles.playerTitle} numberOfLines={1}>{title || "Nu Afspelen"}</Text>
              {type === "series" && season && (
                <Text style={styles.playerSub}>Seizoen {season} · Aflevering {episode || "1"}</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => { toggleFavorite(contentId || String(title)); SafeHaptics.impactLight(); }}
            >
              <Ionicons
                name={isFavorite(contentId || String(title)) ? "heart" : "heart-outline"}
                size={22}
                color={isFavorite(contentId || String(title)) ? COLORS.live : "#fff"}
              />
            </TouchableOpacity>
            {!!streamUrl && (
              <TouchableOpacity style={styles.iconBtn} onPress={handleOpenInVlc}>
                <Ionicons name="open-outline" size={20} color="#fff" />
              </TouchableOpacity>
            )}
            {(!!streamUrl || !!embedUrl) && (
              <TouchableOpacity style={styles.iconBtn} onPress={handleShare}>
                <Ionicons name="download-outline" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>

        {/* HLS center controls: skip-back | play-pause | skip-forward */}
        {hlsHtml && Platform.OS !== "web" && (
          <View style={styles.hlsCenterRow}>
            <TouchableOpacity style={styles.hlsSkipBtn} onPress={() => hlsSeekRelative(-15)}>
              <Ionicons name="play-back" size={26} color="#fff" />
              <Text style={styles.hlsSkipLabel}>15</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.hlsPlayBtn} onPress={hlsTogglePlay}>
              <Ionicons name={hlsPaused ? "play" : "pause"} size={46} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.hlsSkipBtn} onPress={() => hlsSeekRelative(15)}>
              <Ionicons name="play-forward" size={26} color="#fff" />
              <Text style={styles.hlsSkipLabel}>15</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Embed center controls: skip-back | play-pause | skip-forward */}
        {embedUrl && !hlsHtml && Platform.OS !== "web" && (
          <View style={styles.hlsCenterRow}>
            <TouchableOpacity style={styles.hlsSkipBtn} onPress={() => embedSeekRelative(-15)}>
              <Ionicons name="play-back" size={26} color="#fff" />
              <Text style={styles.hlsSkipLabel}>15</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.hlsPlayBtn} onPress={embedTogglePlay}>
              <Ionicons name="pause" size={46} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.hlsSkipBtn} onPress={() => embedSeekRelative(15)}>
              <Ionicons name="play-forward" size={26} color="#fff" />
              <Text style={styles.hlsSkipLabel}>15</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* HLS bottom: seek bar + time */}
        {hlsHtml && Platform.OS !== "web" && (
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={styles.bottomGrad}>
            <View style={[styles.hlsBottomBar, { paddingBottom: insets.bottom + 16 }]}>
              {hlsIsLive ? (
                <View style={styles.livePill}>
                  <Text style={styles.livePillText}>● LIVE</Text>
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

                  <Text style={styles.hlsTime}>{formatTime(hlsDuration)}</Text>
                </>
              )}
            </View>
          </LinearGradient>
        )}

        {/* Embed bottom bar: reload button */}
        {!hlsHtml && (tmdbId || trailerKey) && (!streamUrl || useFallbackEmbed) && !allProvidersFailed && (
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={styles.bottomGrad}>
            <View style={[styles.bottomBar, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
              <TouchableOpacity
                style={styles.reloadBtn}
                onPress={() => { tryNextProvider(); SafeHaptics.impactLight(); }}
              >
                <Ionicons name="refresh" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: "#000" },
  videoArea:  { flex: 1, backgroundColor: "#000" },
  webFrame:   { width: "100%", height: "100%", borderWidth: 0, backgroundColor: "#000" },
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
  embedMiniBack: {
    position: "absolute",
    top: 48,
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  tapStripTop:    { position: "absolute", top: 0,    left: 0, right: 0, height: 90, zIndex: 5 },
  tapStripBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 90, zIndex: 5 },

  // Controls overlay
  overlay:  { ...StyleSheet.absoluteFillObject, justifyContent: "space-between", zIndex: 10 },
  topGrad:  { paddingBottom: 60 },
  topBar:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 10 },
  iconBtn:  { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  titleWrap: { flex: 1 },
  playerTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  playerSub:   { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 1 },
  bottomGrad: { paddingTop: 60 },
  bottomBar:  { paddingHorizontal: 14, alignItems: "flex-end" },
  reloadBtn:  { width: 38, height: 38, alignItems: "center", justifyContent: "center" },

  // HLS custom controls
  hlsCenterRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 36, position: "absolute", left: 0, right: 0,
    top: "50%", marginTop: -36,
  },
  hlsPlayBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  hlsSkipBtn:  { alignItems: "center", gap: 2 },
  hlsSkipLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#fff" },

  hlsBottomBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, gap: 10,
  },
  hlsTime: { fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)", minWidth: 40, textAlign: "center" },
  hlsSeekOuter: {
    flex: 1, height: 28, justifyContent: "center",
    position: "relative",
  },
  hlsSeekTrack: {
    height: 3, backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2, overflow: "hidden",
    flexDirection: "row",
  },
  hlsSeekFill: { height: "100%", backgroundColor: COLORS.accent, borderRadius: 2 },
  hlsSeekThumb: {
    position: "absolute", top: "50%", marginTop: -6,
    marginLeft: -6,
    width: 12, height: 12,
    borderRadius: 6, backgroundColor: "#fff",
  },

  livePill: {
    flex: 1, height: 24, borderRadius: 12,
    backgroundColor: COLORS.live,
    alignItems: "center", justifyContent: "center",
    maxWidth: 80,
  },
  livePillText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#fff" },
});
