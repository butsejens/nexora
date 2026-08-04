import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { TOP_NAV_H } from "@/constants/layout";
import { GenreButtonRow, PosterRail } from "@/components/streaming/PremiumRails";
import {
  useProviderMovies,
  useProviderSeries,
  useWatchProviders,
} from "@/lib/use-tmdb";
import type { StreamingProvider } from "@/lib/tmdb";
import type { RailItem } from "@/components/streaming/PremiumRails";
import type { Movie, Series } from "@/types/streaming";

const LANGUAGE_ROWS = [
  { title: "Vlaams", id: 1, code: "nl-BE" },
  { title: "Nederlands", id: 2, code: "nl" },
  { title: "Frans", id: 3, code: "fr" },
  { title: "Engels", id: 4, code: "en" },
  { title: "Spaans", id: 5, code: "es" },
  { title: "Duits", id: 6, code: "de" },
] as const;
const LANGUAGE_CODE_BY_ID: Record<number, string> = Object.fromEntries(
  LANGUAGE_ROWS.map((language) => [language.id, language.code]),
) as Record<number, string>;
const REGION_TOP_PROVIDER_HINTS: Record<string, string[]> = {
  BE: ["streamz", "vtmgo", "vtm", "vrtmax", "vrt", "goplay", "play", "netflix", "disney", "prime"],
  NL: ["videoland", "npo", "kijk", "netflix", "disney", "prime", "hbo", "apple"],
  FR: ["canal", "mycanal", "arte", "netflix", "disney", "prime", "apple", "ocs"],
  US: ["netflix", "hulu", "max", "disney", "prime", "apple", "paramount", "peacock"],
  ES: ["movistar", "filmin", "atresplayer", "netflix", "disney", "prime", "apple", "max"],
  DE: ["joyn", "rtl", "wow", "netflix", "disney", "prime", "apple", "ard"],
};

type ServiceChip = {
  id: number;
  title: string;
  providerId: number | null;
};

function toRail(items: (Movie | Series)[], limit = 16): RailItem[] {
  return items.slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title,
    poster: item.poster,
    backdrop: item.backdrop,
    rating: item.rating,
  }));
}

function openDetail(item: RailItem) {
  const type = String(item.id).startsWith("tmdb_s_") ? "series" : "movie";
  router.push({ pathname: "/media/detail", params: { id: item.id, type } });
}

function toRegion(languageCode: string): string {
  const value = String(languageCode || "").toLowerCase();
  if (value === "nl-be") return "BE";
  if (value.startsWith("nl")) return "NL";
  if (value.startsWith("fr")) return "FR";
  if (value.startsWith("en")) return "US";
  if (value.startsWith("es")) return "ES";
  if (value.startsWith("de")) return "DE";
  if (value.startsWith("ko")) return "KR";
  if (value.startsWith("ja")) return "JP";
  return "NL";
}

export default function StudiosScreen() {
  const insets = useSafeAreaInsets();
  const [selectedLanguageCode, setSelectedLanguageCode] = useState("nl-BE");
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const region = toRegion(selectedLanguageCode);
  const { data: providers = [] } = useWatchProviders(region);

  const serviceChips = useMemo<ServiceChip[]>(() => {
    const rows = providers as StreamingProvider[];
    const hints = REGION_TOP_PROVIDER_HINTS[region] ?? [];
    const normalize = (value: string) =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const ranked = hints
      .map((hint) =>
        rows.find((provider) =>
          normalize(provider.provider_name).includes(normalize(hint)),
        ) || null,
      )
      .filter(Boolean) as StreamingProvider[];

    const seen = new Set<number>();
    const uniqueRanked = ranked.filter((provider) => {
      if (seen.has(provider.provider_id)) return false;
      seen.add(provider.provider_id);
      return true;
    });

    const topResolved = uniqueRanked.slice(0, 10).map((provider, index) => ({
      id: index + 1,
      title: provider.provider_name,
      providerId: provider.provider_id,
    }));

    if (region === "BE") {
      // Keep Flemish services visible by name, even if TMDB naming differs.
      const ensure = ["Streamz", "VTM GO", "VRT MAX", "GoPlay"];
      const existing = new Set(topResolved.map((chip) => normalize(chip.title)));
      const missing = ensure
        .filter((name) => !existing.has(normalize(name)))
        .map((name, index) => ({
          id: 200 + index,
          title: name,
          providerId: null,
        }));
      return [...topResolved, ...missing].slice(0, 10);
    }

    return topResolved.length > 0
      ? topResolved
      : rows.slice(0, 10).map((provider, index) => ({
          id: index + 1,
          title: provider.provider_name,
          providerId: provider.provider_id,
        }));
  }, [providers, region]);

  useEffect(() => {
    if (!serviceChips.length) {
      setSelectedServiceId(null);
      return;
    }
    setSelectedServiceId((current) => {
      if (current && serviceChips.some((chip) => chip.id === current)) return current;
      return serviceChips[0].id;
    });
  }, [serviceChips]);

  const selectedService = useMemo(
    () => serviceChips.find((chip) => chip.id === selectedServiceId) ?? null,
    [serviceChips, selectedServiceId],
  );

  const selectedProviderId = selectedService?.providerId ?? null;
  const { data: providerMovies = [], isFetching: loadingProviderMovies } =
    useProviderMovies(selectedProviderId, region);
  const { data: providerSeries = [], isFetching: loadingProviderSeries } =
    useProviderSeries(selectedProviderId, region);

  const hasProviderBinding = selectedProviderId !== null;
  const loadingItems =
    hasProviderBinding && (loadingProviderMovies || loadingProviderSeries);

  const activeMovies = useMemo(() => {
    const seen = new Set<string>();
    return providerMovies.filter((item) => {
      if (!item.poster && !item.backdrop) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [providerMovies]);

  const activeSeries = useMemo(() => {
    const seen = new Set<string>();
    return providerSeries.filter((item) => {
      if (!item.poster && !item.backdrop) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [providerSeries]);

  const movieRail = useMemo(() => toRail(activeMovies, 16), [activeMovies]);
  const seriesRail = useMemo(() => toRail(activeSeries, 16), [activeSeries]);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: COLORS.background }}
      data={[]}
      keyExtractor={() => "studios-root"}
      contentContainerStyle={{
        paddingTop: TOP_NAV_H + insets.top + 10,
        paddingBottom: insets.bottom + 90,
      }}
      ListHeaderComponent={
        <View style={{ marginBottom: 8 }}>
          <GenreButtonRow
            genres={LANGUAGE_ROWS}
            compact
            onPress={(language) => setSelectedLanguageCode(LANGUAGE_CODE_BY_ID[language.id] || "nl")}
          />
          <Text style={styles.title}>Top streamingdiensten ({region})</Text>
          <Text style={styles.subtitle}>
            Onder de taal zie je alleen de belangrijkste diensten.
          </Text>
          <GenreButtonRow
            genres={serviceChips.map((chip) => ({ title: chip.title, id: chip.id }))}
            compact
            onPress={(chip) => setSelectedServiceId(chip.id)}
          />
          {selectedService ? (
            <Text style={styles.selectedServiceLabel}>
              {selectedService.title}
            </Text>
          ) : null}
          {loadingItems ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={COLORS.accent} />
            </View>
          ) : null}
          {!loadingItems && !hasProviderBinding ? (
            <Text style={styles.emptyText}>
              Geen directe studio-koppeling gevonden voor deze dienst.
            </Text>
          ) : null}
          {!loadingItems && hasProviderBinding && movieRail.length === 0 && seriesRail.length === 0 ? (
            <Text style={styles.emptyText}>
              Geen titels gevonden voor deze studio in regio {region}.
            </Text>
          ) : null}
          {hasProviderBinding && movieRail.length > 0 ? (
            <PosterRail title="Films" data={movieRail} onPress={openDetail} />
          ) : null}
          {hasProviderBinding && seriesRail.length > 0 ? (
            <PosterRail title="Series" data={seriesRail} onPress={openDetail} />
          ) : null}
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
  selectedServiceLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 2,
  },
  loadingWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "flex-start",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
});
