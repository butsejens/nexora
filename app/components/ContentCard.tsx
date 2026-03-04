import React, { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import type { Movie, Series } from "@/data/mockData";
import { SafeHaptics } from "@/lib/safeHaptics";

interface MovieCardProps {
  item: Movie | Series;
  onPress: () => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
  width?: number;
}

const QUALITY_COLORS: Record<string, string> = {
  "4K": "#FFD700",
  "FHD": "#E50914",
  "HD": "#10B981",
};

export function ContentCard({ item, onPress, onFavorite, isFavorite, width = 130 }: MovieCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const height = Math.round(width * 1.56);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  const isNew = (item as any).isNew;
  const isTrending = (item as any).isTrending;

  return (
    <Animated.View style={[styles.wrapper, { width }, { transform: [{ scale: scaleAnim }] }]}>
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
          <LinearGradient
            colors={[item.color, `${item.color}88`, "#161F2E"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.72)", COLORS.background]}
            style={[StyleSheet.absoluteFill, { justifyContent: "flex-end" }]}
            start={{ x: 0, y: 0.4 }}
            end={{ x: 0, y: 1 }}
          >
            <View style={styles.posterBottom}>
              <View style={styles.badges}>
                <View style={[styles.qualityBadge, { borderColor: QUALITY_COLORS[item.quality] || COLORS.accent }]}>
                  <Text style={[styles.qualityText, { color: QUALITY_COLORS[item.quality] || COLORS.accent }]}>
                    {item.quality}
                  </Text>
                </View>
                {isNew && (
                  <View style={styles.newBadge}>
                    <Text style={styles.newText}>NEW</Text>
                  </View>
                )}
              </View>
            </View>
          </LinearGradient>

          {isTrending && (
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

          <View style={styles.playOverlay}>
            <View style={styles.playBtn}>
              <Ionicons name="play" size={14} color={COLORS.text} />
            </View>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>{item.year}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.metaText}>{item.imdb}</Text>
          <Ionicons name="star" size={9} color={COLORS.gold} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function ContentCardWide({ item, onPress }: { item: Movie | Series; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.wideCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.widePoster]}>
        <LinearGradient
          colors={[item.color, `${item.color}66`, "#161F2E"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </View>
      <View style={styles.wideInfo}>
        <Text style={styles.wideTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.wideGenres}>
          {item.genre.slice(0, 2).map((g) => (
            <View key={g} style={styles.genrePill}>
              <Text style={styles.genrePillText}>{g}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.wideSynopsis} numberOfLines={2}>{item.synopsis}</Text>
        <View style={styles.wideMeta}>
          <Text style={styles.wideMetaText}>{item.year}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.wideMetaText}>{(item as Movie).duration || `${(item as Series).seasons}S`}</Text>
          <Text style={styles.dot}>·</Text>
          <View style={styles.ratingRow}>
            <Text style={styles.wideMetaText}>{item.imdb}</Text>
            <Ionicons name="star" size={10} color={COLORS.gold} />
          </View>
        </View>
      </View>
      <View style={styles.playCircle}>
        <Ionicons name="play" size={20} color={COLORS.text} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginRight: 12,
  },
  poster: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  posterBottom: {
    padding: 8,
  },
  badges: {
    flexDirection: "row",
    gap: 4,
  },
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
    borderRadius: 4,
    paddingHorizontal: 5,
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
    backgroundColor: "rgba(255,107,53,0.2)",
    borderWidth: 1,
    borderColor: "#FF6B35",
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
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  playOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    opacity: 0,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
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
  wideCard: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 100,
    alignItems: "center",
  },
  widePoster: {
    width: 70,
    height: 100,
    backgroundColor: COLORS.cardElevated,
  },
  wideInfo: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  wideTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
  },
  wideGenres: {
    flexDirection: "row",
    gap: 4,
  },
  genrePill: {
    backgroundColor: COLORS.accentGlow,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  genrePillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    color: COLORS.accent,
  },
  wideSynopsis: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 15,
  },
  wideMeta: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  wideMetaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  playCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
});
