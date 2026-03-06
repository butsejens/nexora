import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Platform,
  ScrollView,
  ActivityIndicator,
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
import { buildErrorReference, normalizeApiError } from "@/lib/error-messages";



// Stream providers ordered by reliability (updated 2025)
const STREAM_PROVIDERS = [
  { id: "vidsrcto",    label: "Server 1" },
  { id: "embedsu",     label: "Server 2" },
  { id: "autoembed",   label: "Server 3" },
  { id: "vidsrcpro",   label: "Server 4" },
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
    default:
      return isMovie
        ? `https://vidsrc.to/embed/movie/${tmdbId}`
        : `https://vidsrc.to/embed/tv/${tmdbId}/${s}/${e}`;
  }
}

// Ad-blocking domains – requests to these are blocked in the WebView
const AD_DOMAINS = [
  "googlesyndication.com", "doubleclick.net", "googleadservices.com",
  "adnxs.com", "pubmatic.com", "openx.net", "rubiconproject.com",
  "casalemedia.com", "advertising.com", "adform.net", "criteo.com",
  "exoclick.com", "juicyads.com", "popads.net", "popcash.net",
  "trafficjunky.net", "adsterra.com", "hilltopads.net", "ero-advertising.com",
  "adspyglass.com", "royalads.net", "vpnmentor.com", "nordvpn.com",
  "expressvpn.com", "purevpn.com", "surfshark.com", "cyberghost.com",
  "adcash.com", "propellerads.com", "clickadu.com", "plugrush.com",
  "ptrk.io", "trc.taboola.com", "cdn.taboola.com", "outbrain.com",
  "media.net", "revcontent.com", "mgid.com", "bidvertiser.com",
];

// JavaScript injected into every WebView to block ads, popups and redirects
const AD_BLOCK_JS = `
(function(){
  // Block window.open (popup ads)
  window.open = function(){ return null; };

  // Block top-level redirects from iframes
  try {
    Object.defineProperty(window, 'top', { get: function(){ return window; } });
  } catch(e){}

  // Remove overlays and popup ads via MutationObserver
  function removeAds(){
    var selectors = [
      '[id*="ad"]','[class*="ad-"]','[class*="-ad"]','[class*="ads"]',
      '[id*="popup"]','[class*="popup"]','[class*="overlay"]',
      '[id*="overlay"]','[class*="banner"]','[id*="banner"]',
      '.adsbygoogle','[data-ad-slot]','iframe[src*="ad"]',
      'div[style*="z-index: 9999"]','div[style*="z-index:9999"]',
      '[class*="vpn"]','[id*="vpn"]',
    ];
    selectors.forEach(function(sel){
      try{
        document.querySelectorAll(sel).forEach(function(el){
          // Only remove if it's blocking content, not a video container
          var tag = el.tagName.toLowerCase();
          if(tag==='video'||tag==='source') return;
          var rect = el.getBoundingClientRect();
          if(rect.width>200&&rect.height>100&&el.style.position==='fixed'){
            el.remove();
          }
        });
      }catch(e){}
    });
    // Close alert dialogs
    try{ document.querySelectorAll('dialog[open]').forEach(function(d){ d.close(); }); }catch(e){}
  }

  // Run now and on DOM changes
  removeAds();
  var obs = new MutationObserver(function(){ removeAds(); });
  obs.observe(document.body||document.documentElement, {childList:true, subtree:true});

  // Block window.alert and window.confirm popups
  window.alert = function(){};
  window.confirm = function(){ return false; };
  window.prompt = function(){ return ''; };
})();
`;

// Inline HLS player – used for direct .m3u8 or .mp4 streams
function buildHlsHtml(src: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
video{width:100%;height:100%;object-fit:contain;display:block;background:#000}
</style>
</head>
<body>
<video id="v" autoplay controls playsinline webkit-playsinline x5-playsinline muted></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.4.14/dist/hls.min.js"></script>
<script>
(function(){
  var v=document.getElementById('v');
  var src=${JSON.stringify(src)};
  function tryDirect(){v.src=src;v.muted=false;v.play().catch(function(){});}
  if(typeof Hls!=='undefined'&&Hls.isSupported()){
    var h=new Hls({enableWorker:false,lowLatencyMode:true,backBufferLength:0,maxBufferLength:30});
    h.loadSource(src);h.attachMedia(v);
    h.on(Hls.Events.MANIFEST_PARSED,function(){v.muted=false;v.play().catch(function(){});});
    h.on(Hls.Events.ERROR,function(e,d){if(d.fatal){h.destroy();tryDirect();}});
  }else if(v.canPlayType('application/vnd.apple.mpegurl')){
    v.src=src;v.play().catch(function(){});
  }else{tryDirect();}
})();
</script>
</body>
</html>`;
}

export default function PlayerScreen() {
  const {
    trailerKey, title, type, contentId, streamUrl, tmdbId, season, episode,
  } = useLocalSearchParams<{
    trailerKey?: string; title?: string; type?: string; contentId?: string;
    streamUrl?: string; tmdbId?: string; season?: string; episode?: string;
  }>();

  const insets = useSafeAreaInsets();
  const { isFavorite, toggleFavorite, addToHistory } = useNexora();

  const [provider, setProvider] = useState(STREAM_PROVIDERS[0].id);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [webviewKey, setWebviewKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [streamError, setStreamError] = useState<Error | string | null>(null);
  const [streamErrorRef, setStreamErrorRef] = useState("");

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

   
   
  const scheduleHide = React.useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(
        () => setControlsVisible(false)
      );
    }, 5000);
  }, [controlsOpacity]);

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

  // Reset loading when provider or key changes
  useEffect(() => {
    setIsLoading(true);
    setStreamError(null);
    setStreamErrorRef("");
  }, [webviewKey, provider]);

  const showControls = () => {
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    scheduleHide();
  };

  const switchProvider = (id: string) => {
    if (id === provider) {
      setWebviewKey(k => k + 1);
    } else {
      setProvider(id);
      setWebviewKey(k => k + 1);
    }
    SafeHaptics.impactLight();
  };

  const handleOpenInVlc = async () => {
    if (!streamUrl) return;
    SafeHaptics.impactLight();
    await openInVlc(String(streamUrl), String(title || "Nexora stream"));
  };

  // Build what to show
  const embedUrl: string | null = (() => {
    if (tmdbId) return getEmbedUrl(provider, tmdbId, type || "movie", season || "1", episode || "1");
    if (trailerKey) return `https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
    return null;
  })();

  const hlsHtml: string | null = streamUrl ? buildHlsHtml(streamUrl) : null;
  const hasSource = !!(hlsHtml || embedUrl);

  // Web player (iframe based)
  const renderWebPlayer = () => {
    if (hlsHtml) {
      return (
        <iframe
          key={webviewKey}
          srcDoc={hlsHtml as any}
          title={`Nexora player ${String(title || "stream")}`}
          style={styles.webFrame as any}
          allow="autoplay; fullscreen; accelerometer; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }
    if (embedUrl) {
      return (
        <iframe
          key={webviewKey}
          src={embedUrl}
          title={`Nexora embed ${String(title || "stream")}`}
          style={styles.webFrame as any}
          allow="autoplay; fullscreen; accelerometer; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }
    return null;
  };

  // Native WebView player
  const renderNativePlayer = () => {
    if (hlsHtml) {
      return (
        <WebView
          key={webviewKey}
          source={{ html: hlsHtml }}
          style={styles.webview}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mixedContentMode="always"
          originWhitelist={["http://*", "https://*"]}
          userAgent="Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          onLoad={() => {
            setIsLoading(false);
            setStreamError(null);
            setStreamErrorRef("");
          }}
          onError={(event) => {
            setIsLoading(false);
            const msg = event?.nativeEvent?.description || "Stream kon niet laden";
            setStreamError(msg);
            setStreamErrorRef((prev) => prev || buildErrorReference("NX-PLY"));
          }}
        />
      );
    }
    if (embedUrl) {
      return (
        <WebView
          key={webviewKey}
          source={{ uri: embedUrl }}
          style={styles.webview}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mixedContentMode="always"
          originWhitelist={["http://*", "https://*"]}
          userAgent="Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          injectedJavaScriptBeforeContentLoaded={AD_BLOCK_JS}
          onLoad={() => {
            setIsLoading(false);
            setStreamError(null);
            setStreamErrorRef("");
          }}
          onError={(event) => {
            setIsLoading(false);
            const msg = event?.nativeEvent?.description || "Stream kon niet laden";
            setStreamError(msg);
            setStreamErrorRef((prev) => prev || buildErrorReference("NX-PLY"));
          }}
          onShouldStartLoadWithRequest={(req) => {
            const url = req.url || "";
            // Only block known ad/tracker domains – allow all CDN and video host navigations
            if (AD_DOMAINS.some(d => url.includes(d))) return false;
            return true;
          }}
          scalesPageToFit={false}
        />
      );
    }
    return null;
  };

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

        {/* Loading spinner – only on native */}
        {isLoading && hasSource && Platform.OS !== "web" && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>Laden...</Text>
          </View>
        )}

        {!isLoading && streamError && Platform.OS !== "web" && (
          <View style={styles.streamErrorOverlay}>
            <Ionicons name="warning-outline" size={18} color={COLORS.live} />
            <Text style={styles.streamErrorText}>{normalizeApiError(streamError).userMessage}</Text>
            <Text style={styles.streamErrorRef}>Foutcode: {streamErrorRef || "NX-PLY"}</Text>
            <TouchableOpacity
              style={styles.streamRetryBtn}
              onPress={() => {
                setStreamError(null);
                setStreamErrorRef("");
                setIsLoading(true);
                setWebviewKey((k) => k + 1);
              }}
            >
              <Text style={styles.streamRetryText}>Probeer opnieuw</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tap area to toggle controls */}
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={showControls} activeOpacity={1} />

      {/* Controls overlay */}
      <Animated.View
        style={[styles.overlay, { opacity: controlsOpacity, pointerEvents: controlsVisible ? "box-none" : "none" }]}
      >
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
          </View>
        </LinearGradient>

        {/* Bottom bar – provider switcher */}
        {(tmdbId || trailerKey) && !streamUrl && (
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} style={styles.bottomGrad}>
            <View style={[styles.bottomBar, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
              <View style={styles.serverRow}>
                <Text style={styles.serverLabel}>Bron:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverChips}>
                  {STREAM_PROVIDERS.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.serverChip, provider === p.id && styles.serverChipActive]}
                      onPress={() => switchProvider(p.id)}
                    >
                      <Text style={[styles.serverChipText, provider === p.id && styles.serverChipTextActive]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={styles.reloadBtn}
                  onPress={() => { setWebviewKey(k => k + 1); SafeHaptics.impactLight(); }}
                >
                  <Ionicons name="refresh" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text style={styles.serverHint}>Als de stream niet start, probeer een andere server</Text>
            </View>
          </LinearGradient>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  videoArea: { flex: 1, backgroundColor: "#000" },
  webFrame: { width: "100%", height: "100%", borderWidth: 0, backgroundColor: "#000" },
  webview: { flex: 1, backgroundColor: "#000" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)", gap: 12,
  },
  loadingText: { fontFamily: "Inter_500Medium", fontSize: 14, color: "rgba(255,255,255,0.7)" },
  streamErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 24,
  },
  streamErrorText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textSecondary, textAlign: "center" },
  streamErrorRef: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  streamRetryBtn: { borderRadius: 10, borderWidth: 1, borderColor: COLORS.accent, backgroundColor: COLORS.accentGlow, paddingHorizontal: 14, paddingVertical: 8, marginTop: 2 },
  streamRetryText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.accent },
  noContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 },
  noTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" },
  noText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
  backBtn2: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 14, backgroundColor: COLORS.accent },
  backBtn2Text: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.background },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topGrad: { paddingBottom: 60 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 10 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  titleWrap: { flex: 1 },
  playerTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  playerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 1 },
  bottomGrad: { paddingTop: 60 },
  bottomBar: { paddingHorizontal: 14 },
  serverRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  serverLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.6)" },
  serverChips: { flexDirection: "row", gap: 6, paddingRight: 4 },
  serverChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  serverChipActive: { backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent },
  serverChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  serverChipTextActive: { color: COLORS.accent, fontFamily: "Inter_700Bold" },
  reloadBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  serverHint: { fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4, paddingBottom: 2 },
});
