import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Image,
  Animated,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { SafeHaptics } from "@/lib/safeHaptics";
import { isTV } from "@/lib/platform";
import { setSidebarExpanded } from "@/lib/tv-focus-engine";



const QUALITY_COLORS: Record<string, string> = {
  "4K": "#FFD700",
  "FHD": "#66B6FF",
  "HD": "#10B981",
};

interface ContentItem {
  id: string;
  title: string;
  year: number;
  imdb: number;
  quality: string;
  color?: string;
  poster?: string | null;
  backdrop?: string | null;
  synopsis?: string;
  genre?: string[];
  rating?: string;
  isNew?: boolean;
  isTrending?: boolean;
  duration?: string;
  seasons?: number;
  isIptv?: boolean;
  progress?: number; // 0-1, for continue watching
}

interface Props {
  item: ContentItem;
  onPress: () => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
  width?: number;
  showProgress?: boolean;
}

export const RealContentCard = React.memo(function RealContentCard({ item, onPress, onFavorite, isFavorite, width = 130, showProgress }: Props) {
  const [imageError, setImageError] = useState(false);
  const [focused, setFocused] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const cardWidth = isTV ? Math.max(width, 220) : width;
  const height = Math.round(cardWidth * 1.56);
  const hasProgress = showProgress && item.progress != null && item.progress > 0;

  const handleFocus = useCallback(() => {
    setFocused(true);
    if (isTV) setSidebarExpanded(false);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: isTV ? 1.08 : 1.05, useNativeDriver: true, friction: 6, tension: 140 }),
      Animated.timing(glowAnim, { toValue: 1, duration: 180, useNativeDriver: false }),
    ]).start();
  }, [scaleAnim, glowAnim]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 6, tension: 140 }),
      Animated.timing(glowAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
    ]).start();
  }, [scaleAnim, glowAnim]);

  const tvGlowBorder = isTV ? glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0)", "rgba(255,255,255,0.85)"],
  }) : undefined;

  const tvBrightness = isTV ? glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  }) : undefined;

  return (
    <Animated.View
      focusable={false}
      style={[
        { width: cardWidth, marginRight: isTV ? 20 : 14, transform: [{ scale: scaleAnim }] },
        isTV && focused && {
          shadowColor: "#fff",
          shadowOpacity: 0.5,
          shadowRadius: 18,
          elevation: 20,
        },
      ]}>
      <Pressable
        onPress={() => {
          SafeHaptics.impactLight();
          onPress();
        }}
        focusable={true}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={({ pressed }) => ({ opacity: pressed && !isTV ? 0.78 : 1 })}
      >
        <Animated.View style={[
          styles.poster,
          { width: cardWidth, height },
          focused && styles.posterFocused,
          isTV && focused && {
            borderColor: tvGlowBorder,
            borderWidth: 3,
            borderRadius: 14,
          },
        ]}>
          {item.poster && !imageError ? (
            <Image
              source={{ uri: item.poster }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <>
              <LinearGradient
                colors={[item.color || COLORS.card, `${item.color || COLORS.cardElevated}BB`, COLORS.background]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
              />
              <View style={styles.posterInitials}>
                <Text style={styles.posterInitialsText} numberOfLines={2}>
                  {String(item.title || "?").slice(0, 12).toUpperCase()}
                </Text>
              </View>
            </>
          )}

          {/* Bottom gradient overlay */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.62)", "rgba(0,0,0,0.92)"]}
            style={[StyleSheet.absoluteFill, { justifyContent: "flex-end" }]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 0, y: 1 }}
          >
            <View style={styles.posterBottom}>
              <View style={styles.badges}>
                <View style={[styles.qualityBadge, { borderColor: QUALITY_COLORS[item.quality] || COLORS.accent }]}>
                  <Text style={[styles.qualityText, { color: QUALITY_COLORS[item.quality] || COLORS.accent }]}>
                    {item.quality}
                  </Text>
                </View>
                {item.isNew && (
                  <View style={styles.newBadge}>
                    <Text style={styles.newText}>NEW</Text>
                  </View>
                )}
              </View>
            </View>
          </LinearGradient>

          {/* Progress bar for continue watching */}
          {hasProgress && (
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round((item.progress || 0) * 100)}%` as any }]} />
              </View>
            </View>
          )}

          {item.isTrending && (
            <View style={styles.trendingBadge}>
              <Ionicons name="flame" size={10} color="#FF6B35" />
            </View>
          )}

          {onFavorite && (
            <TouchableOpacity style={styles.favoriteBtn} onPress={onFavorite} activeOpacity={0.7}>
              <Ionicons
                name={isFavorite ? "heart" : "heart-outline"}
                size={14}
                color={isFavorite ? COLORS.live : COLORS.textSecondary}
              />
            </TouchableOpacity>
          )}

          {item.isIptv !== undefined && (
            <View style={[styles.sourceBadge, item.isIptv ? styles.sourceBadgeIptv : styles.sourceBadgeTmdb]}>
              <Text style={[styles.sourceBadgeText, item.isIptv ? styles.sourceBadgeTextIptv : styles.sourceBadgeTextTmdb]}>
                {item.isIptv ? "IPTV" : "TMDB"}
              </Text>
            </View>
          )}
        </Animated.View>
        <Text style={[styles.title, isTV && styles.titleTV]} numberOfLines={1}>{item.title}</Text>
        <View style={styles.meta}>
          {item.year ? <Text style={[styles.metaText, isTV && styles.metaTextTV]}>{item.year}</Text> : null}
          {item.year && item.imdb ? <Text style={[styles.dot, isTV && styles.metaTextTV]}>·</Text> : null}
          {item.imdb ? (
            <>
              <Text style={[styles.metaText, isTV && styles.metaTextTV]}>{item.imdb}</Text>
              <Ionicons name="star" size={isTV ? 12 : 9} color={COLORS.gold} />
            </>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
});

export const RealHeroBanner = React.memo(function RealHeroBanner({ item, onPlay, onInfo, trailerKey }: { item: ContentItem; onPlay: () => void; onInfo?: () => void; trailerKey?: string | null }) {
  const [imageError, setImageError] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const trailerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-start trailer preview after 2 seconds (Netflix-style)
  useEffect(() => {
    if (trailerKey) {
      trailerTimer.current = setTimeout(() => setShowTrailer(true), 2000);
    }
    return () => {
      if (trailerTimer.current) clearTimeout(trailerTimer.current);
      setShowTrailer(false);
    };
  }, [trailerKey, item.id]);

  const backdropUri = item.backdrop || item.poster;

  return (
    <View style={styles.heroBannerWrapper}>
      <TouchableOpacity
        onPress={onPlay}
        activeOpacity={0.88}
      >
        <View style={styles.heroBanner}>
          {backdropUri && !imageError ? (
            <Image
              source={{ uri: backdropUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <LinearGradient
              colors={[item.color || COLORS.card, `${item.color || COLORS.cardElevated}CC`, COLORS.background]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.7, y: 1 }}
            />
          )}

          {/* Auto-play trailer preview (muted, Netflix-style) */}
          {showTrailer && trailerKey && (
            <View style={[StyleSheet.absoluteFill, { zIndex: 1 }]}>
              <Image
                source={{ uri: `https://img.youtube.com/vi/${trailerKey}/hqdefault.jpg` }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.8)" />
              </View>
            </View>
          )}

          {/* Top vignette gradient */}
          <LinearGradient
            colors={["rgba(0,0,0,0.45)", "transparent"]}
            style={styles.heroTopGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.68)", COLORS.background]}
            style={styles.heroBottomGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />

          <View style={styles.heroContent}>
            <View style={styles.topBadges}>
              <View style={[styles.qualityBadge, { borderColor: QUALITY_COLORS[item.quality] }]}>
                <Text style={[styles.qualityText, { color: QUALITY_COLORS[item.quality] }]}>
                  {item.quality}
                </Text>
              </View>
              {item.genre?.slice(0, 2).map((g) => (
                <View key={g} style={styles.genrePill}>
                  <Text style={styles.genrePillText}>{g}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.heroTitle} numberOfLines={2}>{item.title}</Text>
            {item.synopsis ? (
              <Text style={styles.heroSynopsis} numberOfLines={2}>{item.synopsis}</Text>
            ) : null}

            <View style={styles.metaRow}>
              {item.year ? <Text style={styles.heroMeta}>{item.year}</Text> : null}
              {item.imdb ? (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={12} color={COLORS.gold} />
                  <Text style={styles.heroMeta}>{item.imdb}</Text>
                </View>
              ) : null}
              {item.duration ? <Text style={styles.heroMeta}>{item.duration}</Text> : null}
              {item.seasons ? <Text style={styles.heroMeta}>{item.seasons}S</Text> : null}
            </View>

            <View style={styles.heroActions}>
              <TouchableOpacity style={styles.playButton} onPress={onPlay} activeOpacity={0.85}>
                <Ionicons name="play" size={20} color="#FFFFFF" />
                <Text style={styles.playText}>Play</Text>
              </TouchableOpacity>
              {onInfo && (
                <TouchableOpacity style={styles.infoButton} onPress={onInfo} activeOpacity={0.85}>
                  <Ionicons name="information-circle-outline" size={18} color={COLORS.text} />
                  <Text style={styles.infoText}>Info</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  poster: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  posterFocused: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 20,
  },
  posterBottom: { padding: 9 },
  badges: { flexDirection: "row", gap: 4 },
  qualityBadge: {
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderColor: COLORS.borderLight,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  qualityText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 0.5,
  },
  newBadge: {
    backgroundColor: COLORS.live,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  newText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  trendingBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(229,9,20,0.25)",
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  sourceBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
  },
  sourceBadgeIptv: {
    backgroundColor: "rgba(0,120,255,0.25)",
    borderColor: "rgba(80,160,255,0.7)",
  },
  sourceBadgeTmdb: {
    backgroundColor: "rgba(255,180,0,0.20)",
    borderColor: "rgba(255,180,0,0.60)",
  },
  sourceBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 7,
    letterSpacing: 0.5,
  },
  sourceBadgeTextIptv: { color: "#80C4FF" },
  sourceBadgeTextTmdb: { color: "#FFD060" },
  posterInitials: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  posterInitialsText: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 14,
    color: "rgba(255,255,255,0.22)",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.text,
    marginTop: 8,
  },
  titleTV: {
    fontSize: 16,
    marginTop: 10,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  metaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textMuted,
  },
  metaTextTV: {
    fontSize: 13,
  },
  dot: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textMuted,
  },
  // Progress bar for continue watching
  progressContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingBottom: 5,
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 1.5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.accent,
    borderRadius: 1.5,
  },
  // Hero Banner
  heroBannerWrapper: { marginHorizontal: 16, marginBottom: 22 },
  heroBanner: {
    height: 460,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    justifyContent: "flex-end",
  },
  heroTopGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  heroBottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 280,
  },
  heroContent: { padding: 20, gap: 8 },
  topBadges: { flexDirection: "row", gap: 6, alignItems: "center" },
  genrePill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  genrePillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  heroTitle: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 32,
    color: COLORS.text,
    lineHeight: 36,
  },
  heroSynopsis: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    lineHeight: 18,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroMeta: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  playText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" },
  infoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  infoText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
});
