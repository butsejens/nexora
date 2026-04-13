import React from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "@/constants/colors";
import { useMovieCollection } from "@/lib/use-tmdb";
import type { Movie } from "@/types/streaming";

const { width: W } = Dimensions.get("window");

const TOP_CARD_W = W > 820 ? 188 : 154;
const TOP_CARD_H = Math.round(TOP_CARD_W * 1.42);
const TOP_NUMBER_SIZE = W > 820 ? 86 : 72;

const POSTER_W = W > 820 ? 170 : 136;
const POSTER_H = Math.round(POSTER_W * 1.48);

const COLL_ITEM_W = W > 820 ? 156 : 126;
const COLL_ITEM_H = Math.round(COLL_ITEM_W * 1.5);
const COLL_LEAD_H = COLL_ITEM_H;
const COLL_LEAD_W = Math.round(COLL_LEAD_H / 0.68);

// Featured Collection Rail — fully adaptive sizing
// Title card: landscape rectangle (= 2 film-card-widths)
// Film cards: all identical size, width computed so N cards fill the screen exactly
const FEAT_GAP = 10;
const FEAT_FILMS_PER_VIEW = W >= 768 ? 4 : 3;
const FEAT_FILM_W = Math.floor(
  (W - 32 - FEAT_GAP * (FEAT_FILMS_PER_VIEW - 1)) / FEAT_FILMS_PER_VIEW,
);
const FEAT_FILM_H = Math.round(FEAT_FILM_W * 1.5); // 2:3 portrait ratio
// Title card = landscape rectangle (2 film-widths + 1 gap between them)
const FEAT_TITLE_W = FEAT_FILM_W * 2 + FEAT_GAP;
const FEAT_TITLE_H = FEAT_FILM_H;

export type RailItem = {
  id: string;
  title: string;
  poster?: string | null;
  backdrop?: string | null;
};

export function SectionHeader({
  title,
  onSeeAll,
}: {
  title: string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onSeeAll ? (
        <Pressable style={styles.seeAllPill} onPress={onSeeAll}>
          <Text style={styles.seeAllPillText}>Alle →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TopTenRail({
  title,
  data,
  onPress,
  onSeeAll,
}: {
  title: string;
  data: RailItem[];
  onPress: (item: RailItem) => void;
  onSeeAll?: () => void;
}) {
  if (data.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={title} onSeeAll={onSeeAll} />
      <FlatList
        horizontal
        data={data.slice(0, 10)}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railPad}
        ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
        renderItem={({ item, index }) => (
          <Pressable style={styles.topTenItem} onPress={() => onPress(item)}>
            <View style={styles.topCard}>
              <ExpoImage
                source={item.poster ?? item.backdrop ?? undefined}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                transition={220}
              />
              <LinearGradient
                colors={["transparent", "rgba(6,5,10,0.66)"]}
                style={StyleSheet.absoluteFillObject}
              />
            </View>
            <Text style={styles.rankNumber}>{index + 1}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

export function PosterRail({
  title,
  data,
  onPress,
  onSeeAll,
  cardWidth,
}: {
  title: string;
  data: RailItem[];
  onPress: (item: RailItem) => void;
  onSeeAll?: () => void;
  cardWidth?: number;
}) {
  const CARD_W = cardWidth ?? POSTER_W;
  const CARD_H = cardWidth ? Math.round(cardWidth * 1.48) : POSTER_H;
  // Only render items that actually have an image to show
  const visible = data.filter((item) => item.poster ?? item.backdrop);
  if (visible.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <FlatList
        horizontal
        data={visible}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railPad}
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        ListFooterComponent={
          onSeeAll ? (
            <Pressable style={styles.seeAllEndPill} onPress={onSeeAll}>
              <Text style={styles.seeAllEndPillText}>Alle →</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable style={[styles.posterCard, cardWidth ? { width: CARD_W, height: CARD_H } : null]} onPress={() => onPress(item)}>
            <ExpoImage
              source={item.poster ?? item.backdrop ?? undefined}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={220}
            />
            <LinearGradient
              colors={["transparent", "rgba(6,5,10,0.72)"]}
              style={StyleSheet.absoluteFillObject}
            />
          </Pressable>
        )}
      />
    </View>
  );
}

export function CollectionRail({
  title,
  data,
  onPress,
}: {
  title: string;
  data: RailItem[];
  onPress: (item: RailItem) => void;
}) {
  if (data.length < 2) return null;

  const lead = data[0];
  const rest = data.slice(1);

  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <FlatList
        horizontal
        data={rest}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railPad}
        ListHeaderComponent={
          <Pressable
            style={styles.collectionLeadCard}
            onPress={() => onPress(lead)}
          >
            <ExpoImage
              source={lead.backdrop ?? lead.poster ?? undefined}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={220}
            />
            <LinearGradient
              colors={["rgba(6,5,10,0)", "rgba(6,5,10,0.92)"]}
              locations={[0.38, 1]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.collectionLeadFooter}>
              <Text style={styles.collectionLeadTitle} numberOfLines={2}>
                {lead.title}
              </Text>
            </View>
          </Pressable>
        }
        ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
        renderItem={({ item }) => (
          <Pressable
            style={styles.collectionPosterCard}
            onPress={() => onPress(item)}
          >
            <ExpoImage
              source={item.poster ?? item.backdrop ?? undefined}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={220}
            />
            <LinearGradient
              colors={["transparent", "rgba(6,5,10,0.65)"]}
              style={StyleSheet.absoluteFillObject}
            />
          </Pressable>
        )}
      />
    </View>
  );
}

export function CategoryChips({
  categories,
}: {
  categories: readonly { title: string; id: number }[];
}) {
  return (
    <FlatList
      horizontal
      data={categories}
      keyExtractor={(item) => String(item.id)}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsWrap}
      ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
      renderItem={({ item }) => (
        <View style={styles.chip}>
          <Text style={styles.chipText}>{item.title}</Text>
        </View>
      )}
    />
  );
}

/**
 * Premium franchise/collection showcase rail.
 * A single horizontal FlatList where:
 *   [0] Non-clickable title card with collection name + faded backdrop
 *   [1] First film — largest card (full 2:3 poster, title + rating)
 *   [2+] Remaining films — slightly smaller (same ratio)
 * Internally fetches its own data so callers only need to pass collectionId.
 */
export function FeaturedCollectionRail({
  collectionId,
  onPress,
}: {
  collectionId: number;
  onPress: (item: RailItem) => void;
}) {
  const { data } = useMovieCollection(collectionId);

  // Only films with a poster
  const movies: Movie[] = (data?.movies ?? []).filter((m) => !!m.poster);
  if (movies.length < 2) return null;

  type ListItem =
    | { kind: "title"; name: string; backdrop: string | null }
    | { kind: "film"; movie: Movie };

  const listData: ListItem[] = [
    {
      kind: "title",
      name: data?.name ?? "",
      backdrop: movies[0].backdrop ?? null,
    },
    ...movies.map((m) => ({ kind: "film" as const, movie: m })),
  ];

  return (
    <View style={featStyles.wrap}>
      <FlatList
        horizontal
        data={listData}
        keyExtractor={(_, i) => String(i)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={featStyles.list}
        ItemSeparatorComponent={() => <View style={{ width: FEAT_GAP }} />}
        renderItem={({ item }) => {
          if (item.kind === "title") {
            return (
              <View style={featStyles.titleCard}>
                {item.backdrop ? (
                  <>
                    <ExpoImage
                      source={item.backdrop}
                      style={StyleSheet.absoluteFillObject}
                      contentFit="cover"
                    />
                    <LinearGradient
                      colors={["rgba(6,5,10,0.15)", "rgba(6,5,10,0.92)"]}
                      locations={[0.2, 1]}
                      style={StyleSheet.absoluteFillObject}
                    />
                  </>
                ) : (
                  <LinearGradient
                    colors={[COLORS.cardElevated, COLORS.background]}
                    style={StyleSheet.absoluteFillObject}
                  />
                )}
                <View style={featStyles.titleInner}>
                  <Text style={featStyles.titleLabel}>Collectie</Text>
                  <Text style={featStyles.titleName} numberOfLines={4}>
                    {item.name}
                  </Text>
                </View>
              </View>
            );
          }
          // Film card
          const { movie } = item;
          return (
            <Pressable
              style={featStyles.filmCard}
              onPress={() =>
                onPress({
                  id: movie.id,
                  title: movie.title,
                  poster: movie.poster,
                  backdrop: movie.backdrop,
                })
              }
            >
              <ExpoImage
                source={movie.poster ?? undefined}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                transition={200}
              />
              <LinearGradient
                colors={["transparent", "rgba(6,5,10,0.82)"]}
                locations={[0.5, 1]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={featStyles.filmFooter}>
                <Text style={featStyles.filmTitle} numberOfLines={2}>
                  {movie.title}
                </Text>
                {(movie.rating ?? 0) > 0 && (
                  <Text style={featStyles.filmRating}>
                    ★ {movie.rating.toFixed(1)}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const GENRE_BTN_W = Math.min(Math.max(Math.round(W * 0.38), 150), 260);
const GENRE_BTN_H = 72;

export function GenreButtonRow({
  genres,
  onPress,
}: {
  genres: readonly { title: string; id: number }[];
  onPress?: (genre: { title: string; id: number }) => void;
}) {
  if (!genres.length) return null;
  return (
    <View style={genreRowStyles.section}>
      <FlatList
        horizontal
        data={genres as { title: string; id: number }[]}
        keyExtractor={(item) => String(item.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={genreRowStyles.list}
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        renderItem={({ item }) => (
          <Pressable style={genreRowStyles.btn} onPress={() => onPress?.(item)}>
            <LinearGradient
              colors={["rgba(255,255,255,0.07)", "rgba(255,255,255,0.02)"]}
              style={genreRowStyles.gradient}
            />
            <Text style={genreRowStyles.btnText}>{item.title}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const genreRowStyles = StyleSheet.create({
  section: { marginTop: 4, marginBottom: 4 },
  list: { paddingHorizontal: 16, paddingVertical: 12 },
  btn: {
    width: GENRE_BTN_W,
    height: GENRE_BTN_H,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  gradient: { ...StyleSheet.absoluteFillObject },
  btnText: {
    color: COLORS.text,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
});

const styles = StyleSheet.create({
  section: { marginTop: 20 },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  seeAllPill: {
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  seeAllPillText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  seeAllEndPill: {
    alignSelf: "center",
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginLeft: 14,
  },
  seeAllEndPillText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  railPad: { paddingHorizontal: 16 },
  topTenItem: {
    width: TOP_CARD_W + TOP_NUMBER_SIZE * 0.55,
    height: TOP_CARD_H + TOP_NUMBER_SIZE * 0.28,
    justifyContent: "flex-end",
    overflow: "visible",
    marginRight: 8,
  },
  rankNumber: {
    position: "absolute",
    left: 0,
    bottom: 6,
    color: "#ff00c8",
    fontSize: TOP_NUMBER_SIZE,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -3,
    opacity: 0.98,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 2, height: 3 },
    textShadowRadius: 6,
  },
  topCard: {
    marginLeft: TOP_NUMBER_SIZE * 0.34,
    width: TOP_CARD_W,
    height: TOP_CARD_H,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
  },
  posterCard: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
  },
  collectionLeadCard: {
    width: COLL_LEAD_W,
    height: COLL_LEAD_H,
    marginRight: 8,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
  },
  collectionLeadFooter: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
  },
  collectionLeadTitle: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  collectionPosterCard: {
    width: COLL_ITEM_W,
    height: COLL_ITEM_H,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
  },
  chipsWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.card,
  },
  chipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});

const featStyles = StyleSheet.create({
  wrap: { marginTop: 28 },
  list: {
    paddingHorizontal: 16,
  },
  // Non-clickable title/branding card = first item in the list
  titleCard: {
    width: FEAT_TITLE_W,
    height: FEAT_TITLE_H,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
    justifyContent: "flex-end",
  },
  titleInner: {
    padding: 12,
  },
  titleLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  titleName: {
    color: COLORS.text,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  // All film cards — uniform adaptive size
  filmCard: {
    width: FEAT_FILM_W,
    height: FEAT_FILM_H,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
    justifyContent: "flex-end",
  },
  filmFooter: {
    padding: 8,
  },
  filmTitle: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.1,
    lineHeight: 15,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  filmRating: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    marginTop: 3,
  },
});
