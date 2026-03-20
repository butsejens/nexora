import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { SafeHaptics } from "@/lib/safeHaptics";
import { isTV } from "@/lib/platform";



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
  const cardWidth = isTV ? Math.max(width, 180) : width;
  const height = Math.round(cardWidth * 1.56);
  const hasProgress = showProgress && item.progress != null && item.progress > 0;

  const handleFocus = useCallback(() => {
    setFocused(true);
    Animated.spring(scaleAnim, { toValue: 1.08, useNativeDriver: true, friction: 6, tension: 100 }).start();
  }, [scaleAnim]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 6, tension: 100 }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={{ width: cardWidth, marginRight: isTV ? 20 : 14, transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={() => {
          SafeHaptics.impactLight();
          onPress();
        }}
        activeOpacity={0.78}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        <View style={[styles.poster, { width: cardWidth, height }, focused && styles.posterFocused]}>
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
        </View>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <View style={styles.meta}>
          {item.year ? <Text style={styles.metaText}>{item.year}</Text> : null}
          {item.year && item.imdb ? <Text style={styles.dot}>·</Text> : null}
          {item.imdb ? (
            <>
              <Text style={styles.metaText}>{item.imdb}</Text>
              <Ionicons name="star" size={9} color={COLORS.gold} />
            </>
          ) : null}
        </View>
      </TouchableOpacity>
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
            <TouchableOpacity
              style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
              activeOpacity={0.85}
              onPress={() => {
                SafeHaptics.impactLight();
                router.push({
                  pathname: "/player",
                  params: { trailerKey, title: item.title },
                });
              }}
            >
              <Image
                source={{ uri: `https://img.youtube.com/vi/${trailerKey}/maxresdefault.jpg` }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                onError={(e) => {
                  // fallback handled by parent image error state
                }}
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.8)" />
              </View>
            </TouchableOpacity>
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
    borderWidth: 2.5,
    borderColor: COLORS.accent,
    transform: [{ scale: 1.06 }],
    shadowColor: COLORS.accent,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
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
  heroActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  playText: { fontFamily: "Inter_800ExtraBold", fontSize: 16, color: "#FFFFFF", letterSpacing: 0.5 },
  infoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
  },
  infoText: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.text },
});
