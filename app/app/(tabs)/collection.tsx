import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { TOP_NAV_H } from "@/constants/layout";
import { GenreButtonRow, PosterRail } from "@/components/streaming/PremiumRails";
import { useCountryMovies, useCountrySeries } from "@/lib/use-tmdb";
import type { RailItem } from "@/components/streaming/PremiumRails";
import type { Movie, Series } from "@/types/streaming";

const LANGUAGE_ROWS = [
  { title: "Vlaams", id: 1, code: "nl-BE" },
  { title: "Nederlands", id: 2, code: "nl" },
  { title: "Frans", id: 3, code: "fr" },
  { title: "Engels", id: 4, code: "en" },
  { title: "Spaans", id: 5, code: "es" },
  { title: "Duits", id: 6, code: "de" },
  { title: "Koreaans", id: 7, code: "ko" },
  { title: "Japans", id: 8, code: "ja" },
] as const;
const LANGUAGE_CODE_BY_ID: Record<number, string> = Object.fromEntries(
  LANGUAGE_ROWS.map((language) => [language.id, language.code]),
) as Record<number, string>;

function openDetail(item: RailItem) {
  const type = String(item.id).startsWith("tmdb_s_") ? "series" : "movie";
  router.push({ pathname: "/media/detail", params: { id: item.id, type } });
}

function toRail(items: (Movie | Series)[], limit = 20): RailItem[] {
  return items.slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title,
    poster: item.poster,
    backdrop: item.backdrop,
    rating: item.rating,
  }));
}

export default function CollectionScreen() {
  const insets = useSafeAreaInsets();
  const [selectedLanguageCode, setSelectedLanguageCode] = useState("nl-BE");
  const { data: movies = [] } = useCountryMovies(selectedLanguageCode);
  const { data: series = [] } = useCountrySeries(selectedLanguageCode);

  const movieRails = useMemo(() => {
    const deduped = movies.filter((item, index, rows) =>
      rows.findIndex((x) => x.id === item.id) === index,
    );
    return {
      popular: toRail(deduped, 14),
    };
  }, [movies]);

  const seriesRails = useMemo(() => {
    const deduped = series.filter((item, index, rows) =>
      rows.findIndex((x) => x.id === item.id) === index,
    );
    return {
      popular: toRail(deduped, 14),
    };
  }, [series]);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: COLORS.background }}
      data={[]}
      keyExtractor={() => "collection-root"}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: TOP_NAV_H + insets.top + 10,
        paddingBottom: insets.bottom + 90,
      }}
      ListHeaderComponent={
        <View style={{ marginBottom: 8 }}>
          <GenreButtonRow
            genres={LANGUAGE_ROWS}
            compact
            onPress={(language) =>
              setSelectedLanguageCode(LANGUAGE_CODE_BY_ID[language.id] || "nl")
            }
          />
          <Text style={styles.title}>Top collecties per taal</Text>
          <Text style={styles.subtitle}>
            Alleen de sterkste films en series voor de gekozen taal.
          </Text>
          {movieRails.popular.length > 0 && (
            <PosterRail
              title="Top films"
              data={movieRails.popular}
              onPress={openDetail}
              onSeeAll={() =>
                router.push({
                  pathname: "/media/country",
                  params: {
                    languageCode: selectedLanguageCode,
                    languageName:
                      LANGUAGE_ROWS.find((x) => x.code === selectedLanguageCode)?.title ||
                      "Taal",
                    type: "movie",
                  },
                })
              }
            />
          )}
          {seriesRails.popular.length > 0 && (
            <PosterRail
              title="Top series"
              data={seriesRails.popular}
              onPress={openDetail}
              onSeeAll={() =>
                router.push({
                  pathname: "/media/country",
                  params: {
                    languageCode: selectedLanguageCode,
                    languageName:
                      LANGUAGE_ROWS.find((x) => x.code === selectedLanguageCode)?.title ||
                      "Taal",
                    type: "series",
                  },
                })
              }
            />
          )}
        </View>
      }
      renderItem={null}
    />
  );
}

const styles = StyleSheet.create({
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 2,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
});
