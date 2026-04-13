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
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/constants/colors";
import type { VodCollectionPayload } from "@/lib/services/media-service";

interface CollectionRailProps {
  collections: VodCollectionPayload[];
  title?: string;
  limit?: number;
  onSeeAll?: () => void;
}

const HORIZONTAL_PAD = 18;
const GAP = 14;

function formatCollectionName(name: string): string {
  return String(name || "")
    .replace(/\s*[-:]?\s*(collection|collectie)\s*$/i, "")
    .trim();
}

function getCollectionType(collection: VodCollectionPayload): {
  label: "FILM" | "SERIE" | "MIX";
  detail: string;
} {
  const movieCount = (collection.items || []).filter(
    (item) => String(item?.type || "").toLowerCase() === "movie",
  ).length;
  const seriesCount = (collection.items || []).filter(
    (item) => String(item?.type || "").toLowerCase() === "series",
  ).length;

  if (movieCount > 0 && seriesCount > 0) {
    return {
      label: "MIX",
      detail: `${movieCount} films • ${seriesCount} series`,
    };
  }
  if (seriesCount > 0) {
    return {
      label: "SERIE",
      detail: `${seriesCount} series`,
    };
  }
  return {
    label: "FILM",
    detail: `${movieCount || collection.itemCount} films`,
  };
}

function CollectionCard({
  collection,
  width,
}: {
  collection: VodCollectionPayload;
  width: number;
}) {
  const queryClient = useQueryClient();
  const [backdropFailed, setBackdropFailed] = useState(false);

  const firstWithImage = collection.items?.find(
    (it) => it.backdrop || it.poster,
  );
  const backdrop =
    collection.backdrop ||
    collection.poster ||
    firstWithImage?.backdrop ||
    firstWithImage?.poster ||
    collection.items?.[0]?.backdrop ||
    collection.items?.[0]?.poster ||
    null;

  const showBackdrop = Boolean(backdrop) && !backdropFailed;
  const typeMeta = getCollectionType(collection);
  const displayName = formatCollectionName(collection.name);
  const idsForRoute =
    collection.ids && /^\d+(,\d+)*$/.test(String(collection.ids).trim())
      ? collection.ids
      : /^\d+(,\d+)*$/.test(String(collection.id).trim())
        ? String(collection.id).trim()
        : undefined;

  return (
    <TouchableOpacity
      style={[styles.card, { width }]}
      activeOpacity={0.84}
      onPress={() => {
        queryClient.setQueryData(["vod-collection", collection.id], {
          collection: {
            id: collection.id,
            name: collection.name,
            poster: collection.poster,
            backdrop: collection.backdrop,
          },
          items: collection.items,
          stats: { total: collection.itemCount },
        });
        router.push({
          pathname: "/media/collection",
          params: {
            id: collection.id,
            name: displayName,
            ids: idsForRoute,
          },
        });
      }}
    >
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
            ? ["transparent", "rgba(0,0,0,0.68)"]
            : [COLORS.cardElevated, COLORS.card]
        }
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.topLeftLabel}>
        <Text style={styles.label}>COLLECTION</Text>
      </View>
      <View style={styles.topRightBadge}>
        <Text style={styles.typeBadgeText}>{typeMeta.label}</Text>
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={2}>
          {displayName}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function CollectionRail({
  collections,
  title = "Collections",
  limit,
  onSeeAll,
}: CollectionRailProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - HORIZONTAL_PAD * 2 - GAP) / 2);

  if (!collections.length) return null;

  const visible = limit ? collections.slice(0, limit) : collections;
  const hasMore = limit ? collections.length > limit : false;

  const rows: VodCollectionPayload[][] = [];
  for (let i = 0; i < visible.length; i += 2) {
    rows.push(visible.slice(i, i + 2));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>
      {rows.map((pair, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {pair.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              width={cardWidth}
            />
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
          <Text style={styles.seeAllText}>Bekijk alle</Text>
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
  },
  meta: { position: "absolute", left: 16, right: 16, bottom: 16, gap: 5 },
  name: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 21,
    lineHeight: 25,
  },
  topLeftLabel: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  label: {
    color: "rgba(255,255,255,0.92)",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
  },
  topRightBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  typeBadgeText: {
    color: "rgba(255,255,255,0.92)",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
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
