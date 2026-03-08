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
import { COLORS } from "../constants/colors";
import type { Movie, Series } from "../data/mockData";



interface Props {
  item: Movie | Series;
  onPlay: () => void;
  onInfo?: () => void;
}

export function HeroBanner({ item, onPlay, onInfo }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true, speed: 20 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 15 }).start();
  };

  const qualityColors: Record<string, string> = {
    "4K": "#FFD700",
    "FHD": COLORS.accent,
    "HD": "#10B981",
  };

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPlay}
        activeOpacity={1}
      >
        <View style={styles.banner}>
          <LinearGradient
            colors={[item.color, `${item.color}CC`, COLORS.background]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.3, y: 0 }}
            end={{ x: 0.7, y: 1 }}
          />
          <View style={styles.patternOverlay}>
            {[...Array(6)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.patternCircle,
                  {
                    width: 80 + i * 40,
                    height: 80 + i * 40,
                    borderRadius: 40 + i * 20,
                    opacity: 0.05 - i * 0.006,
                    right: -20 + i * 5,
                    top: -20 + i * 3,
                  },
                ]}
              />
            ))}
          </View>

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.62)", COLORS.background]}
            style={styles.bottomGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />

          <View style={styles.content}>
            <View style={styles.topBadges}>
              <View style={[styles.qualityBadge, { borderColor: qualityColors[item.quality] }]}>
                <Text style={[styles.qualityText, { color: qualityColors[item.quality] }]}>
                  {item.quality}
                </Text>
              </View>
              {item.genre.slice(0, 2).map((g) => (
                <View key={g} style={styles.genrePill}>
                  <Text style={styles.genrePillText}>{g}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.synopsis} numberOfLines={2}>{item.synopsis}</Text>

            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{item.year}</Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={12} color={COLORS.gold} />
                <Text style={styles.metaText}>{item.imdb}</Text>
              </View>
              {(item as Movie).duration && (
                <Text style={styles.metaText}>{(item as Movie).duration}</Text>
              )}
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingBadgeText}>{item.rating}</Text>
              </View>
            </View>

            <View style={styles.actions}>
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
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  banner: {
    height: 240,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    justifyContent: "flex-end",
  },
  patternOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "60%",
    alignItems: "center",
    justifyContent: "center",
  },
  patternCircle: {
    position: "absolute",
    borderWidth: 1,
    borderColor: COLORS.text,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 210,
  },
  content: {
    padding: 16,
    gap: 8,
  },
  topBadges: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  qualityBadge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  qualityText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.3,
  },
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
  title: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 26,
    color: COLORS.text,
    lineHeight: 30,
  },
  synopsis: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  metaText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.textMuted,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingBadge: {
    borderWidth: 1,
    borderColor: COLORS.textMuted,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  ratingBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    color: COLORS.textMuted,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.text,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  playText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: COLORS.background,
  },
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
  infoText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
  },
});
