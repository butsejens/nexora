import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/constants/colors";
import type { VodStudioPayload } from "@/lib/services/media-service";

interface StudioGridProps {
  studios: VodStudioPayload[];
  title?: string;
  limit?: number;
  onSeeAll?: () => void;
}

const HORIZONTAL_PAD = 18;
const GAP = 14;

/* ── palette for no-backdrop cards ── */
const STUDIO_GRADIENTS: [string, string][] = [
  ["#2d1b6b", "#1a1040"],
  ["#1a3358", "#0f1a2e"],
  ["#3a1a5c", "#1a0e2e"],
  ["#1a3a44", "#0e1e24"],
  ["#4a1e30", "#201018"],
  ["#1a3a34", "#0e1e1a"],
];

function pickGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return STUDIO_GRADIENTS[Math.abs(hash) % STUDIO_GRADIENTS.length];
}

function StudioCard({
  studio,
  width,
}: {
  studio: VodStudioPayload;
  width: number;
}) {
  const [backdropFailed, setBackdropFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const backdrop =
    studio.backdrop ||
    studio.poster ||
    studio.items?.[0]?.backdrop ||
    studio.items?.[0]?.poster ||
    null;

  const showBackdrop = Boolean(backdrop) && !backdropFailed;
  const showLogo = Boolean(studio.logo) && !logoFailed;

  return (
    <TouchableOpacity
      style={[styles.card, { width }]}
      activeOpacity={0.84}
      onPress={() =>
        router.push({
          pathname: "/media/studio",
          params: { id: studio.id, name: studio.name },
        })
      }
    >
      {/* ── backdrop layer ── */}
      {showBackdrop ? (
        <ExpoImage
          source={{ uri: backdrop! }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
          onError={() => setBackdropFailed(true)}
        />
      ) : null}

      <LinearGradient
        colors={
          showBackdrop
            ? ["transparent", "transparent", "rgba(0,0,0,0.72)"]
            : pickGradient(studio.name)
        }
        locations={showBackdrop ? [0, 0.35, 1] : undefined}
        style={StyleSheet.absoluteFill}
      />

      {/* ── no backdrop: large centered logo or name ── */}
      {!showBackdrop && (
        <View style={styles.centeredBrand}>
          {showLogo ? (
            <View style={styles.heroLogoWrap}>
              <ExpoImage
                source={{ uri: studio.logo! }}
                style={styles.heroLogo}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={100}
                onError={() => setLogoFailed(true)}
              />
            </View>
          ) : (
            <Text style={styles.heroInitials}>
              {studio.name.length <= 4
                ? studio.name.toUpperCase()
                : studio.name.slice(0, 3).toUpperCase()}
            </Text>
          )}
        </View>
      )}

      {/* ── bottom meta ── */}
      <View style={styles.meta}>
        {showBackdrop && (
          <View style={styles.logoWrap}>
            {showLogo ? (
              <ExpoImage
                source={{ uri: studio.logo! }}
                style={styles.logo}
                contentFit="contain"
                cachePolicy="memory-disk"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <Text style={styles.logoFallback}>
                {studio.name.slice(0, 2).toUpperCase()}
              </Text>
            )}
          </View>
        )}
        <Text style={styles.name} numberOfLines={2}>
          {studio.name}
        </Text>
        <Text style={styles.count}>{studio.itemCount} titles</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function StudioGrid({
  studios,
  title = "Studios",
  limit,
  onSeeAll,
}: StudioGridProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - HORIZONTAL_PAD * 2 - GAP) / 2);

  if (!studios.length) return null;

  const visible = limit ? studios.slice(0, limit) : studios;
  const hasMore = limit ? studios.length > limit : false;

  const rows: VodStudioPayload[][] = [];
  for (let i = 0; i < visible.length; i += 2) {
    rows.push(visible.slice(i, i + 2));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.headerCount}>{studios.length} studios</Text>
      </View>
      {rows.map((pair, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {pair.map((studio) => (
            <StudioCard key={studio.id} studio={studio} width={cardWidth} />
          ))}
          {pair.length === 1 && <View style={{ width: cardWidth }} />}
        </View>
      ))}
      {hasMore && onSeeAll && (
        <TouchableOpacity
          style={styles.seeAllBtn}
          onPress={onSeeAll}
          activeOpacity={0.78}
        >
          <Text style={styles.seeAllText}>
            Bekijk alle {studios.length} studio's
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 28 },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: HORIZONTAL_PAD,
    marginBottom: 12,
  },
  title: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 22 },
  headerCount: {
    color: COLORS.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: HORIZONTAL_PAD,
    justifyContent: "space-between",
    marginBottom: GAP,
  },
  card: {
    height: 172,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  /* ── no-backdrop: centered branding ── */
  centeredBrand: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 44,
  },
  heroLogoWrap: {
    width: 100,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  heroLogo: { width: 80, height: 40 },
  heroInitials: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Inter_800ExtraBold",
    fontSize: 34,
    letterSpacing: 3,
  },
  /* ── bottom meta (with backdrop) ── */
  meta: { position: "absolute", left: 14, right: 14, bottom: 14, gap: 6 },
  logoWrap: {
    width: 48,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.88)",
    marginBottom: 2,
  },
  logo: { width: 44, height: 20 },
  logoFallback: {
    color: COLORS.background,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 14,
  },
  name: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    lineHeight: 18,
  },
  count: {
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  seeAllBtn: {
    alignSelf: "center",
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  seeAllText: {
    color: COLORS.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
});
