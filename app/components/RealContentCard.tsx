import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { SafeHaptics } from "@/lib/safeHaptics";



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
}

interface Props {
  item: ContentItem;
  onPress: () => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
  width?: number;
}

export const RealContentCard = React.memo(function RealContentCard({ item, onPress, onFavorite, isFavorite, width = 130 }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [imageError, setImageError] = useState(false);
  const height = Math.round(width * 1.56);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  return (
    <Animated.View
      style={[{ width, marginRight: 14 }, { transform: [{ scale: scaleAnim }] }]}
    >
      <TouchableOpacity
        onPress={() => {
          SafeHaptics.impactLight();
          onPress();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <View style={[styles.poster, { width, height }]}>
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
        </View>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>{item.year}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.metaText}>{item.imdb}</Text>
          <Ionicons name="star" size={9} color={COLORS.gold} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

export const RealHeroBanner = React.memo(function RealHeroBanner({ item, onPlay, onInfo }: { item: ContentItem; onPlay: () => void; onInfo?: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [imageError, setImageError] = useState(false);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true, speed: 20 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 15 }).start();
  };

  const backdropUri = item.backdrop || item.poster;

  return (
    <Animated.View style={[styles.heroBannerWrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPlay}
        activeOpacity={1}
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

            <Text style={styles.heroTitle}>{item.title}</Text>
            {item.synopsis ? (
              <Text style={styles.heroSynopsis} numberOfLines={2}>{item.synopsis}</Text>
            ) : null}

            <View style={styles.metaRow}>
              <Text style={styles.heroMeta}>{item.year}</Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={12} color={COLORS.gold} />
                <Text style={styles.heroMeta}>{item.imdb}</Text>
              </View>
              {item.duration ? <Text style={styles.heroMeta}>{item.duration}</Text> : null}
              {item.seasons ? <Text style={styles.heroMeta}>{item.seasons}S</Text> : null}
            </View>

            <View style={styles.heroActions}>
              <TouchableOpacity style={styles.playButton} onPress={onPlay} activeOpacity={0.85}>
                <Ionicons name="play" size={18} color={COLORS.background} />
                <Text style={styles.playText}>Play</Text>
              </TouchableOpacity>
              {onInfo && (
                <TouchableOpacity style={styles.infoButton} onPress={onInfo} activeOpacity={0.85}>
                  <Ionicons name="information-circle-outline" size={18} color={COLORS.text} />
                  <Text style={styles.infoText}>More Info</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  poster: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  posterBottom: { padding: 9 },
  badges: { flexDirection: "row", gap: 4 },
  qualityBadge: {
    borderWidth: 1,
    borderRadius: 6,
    backgroundColor: COLORS.overlayLight,
    borderColor: COLORS.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  qualityText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.3,
  },
  newBadge: {
    backgroundColor: COLORS.live,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: COLORS.text,
    letterSpacing: 0.3,
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
    backgroundColor: COLORS.overlayLight,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    borderRadius: 5,
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
    fontSize: 8,
    letterSpacing: 0.4,
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
    fontSize: 13,
    color: COLORS.text,
    marginTop: 10,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
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
  // Hero Banner
  heroBannerWrapper: { marginHorizontal: 16, marginBottom: 22 },
  heroBanner: {
    height: 430,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    justifyContent: "flex-end",
  },
  heroBottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 250,
  },
  heroContent: { padding: 18, gap: 8 },
  topBadges: { flexDirection: "row", gap: 6, alignItems: "center" },
  genrePill: {
    backgroundColor: COLORS.overlayLight,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 5,
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
    fontSize: 38,
    color: COLORS.text,
    lineHeight: 42,
    textTransform: "uppercase",
  },
  heroSynopsis: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroMeta: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(29,43,71,0.9)",
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(176,206,247,0.35)",
  },
  playText: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  infoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.overlayLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  infoText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
});
