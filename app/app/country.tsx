import React, { useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Image,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/constants/colors";
import { resolveCompetitionBrand } from "@/lib/logo-manager";
import { flagFromIso2 } from "@/lib/utils";
import { t as tFn } from "@/lib/i18n";
import {
  COUNTRY_COMPETITIONS,
  CompetitionTier,
  tierLabel,
  tierIcon,
} from "@/lib/country-data";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

const P = {
  bg: "#09090D",
  card: "#12121A",
  elevated: "#1C1C28",
  accent: "#E50914",
  text: "#FFFFFF",
  muted: "#9D9DAA",
  border: "rgba(255,255,255,0.08)",
};

function asParam(v: string | string[] | undefined, fallback = ""): string {
  if (Array.isArray(v)) return String(v[0] || fallback);
  return String(v || fallback);
}

export default function CountryScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = asParam(params.code, "BE");

  const country = useMemo(
    () => COUNTRY_COMPETITIONS.find((c) => c.countryCode === code) || COUNTRY_COMPETITIONS[0],
    [code],
  );

  const sections = useMemo(() => {
    const byTier: Partial<Record<CompetitionTier, typeof country.competitions>> = {};
    for (const comp of country.competitions) {
      if (!byTier[comp.tier]) byTier[comp.tier] = [];
      byTier[comp.tier]!.push(comp);
    }
    const order: CompetitionTier[] = ["division1", "division2", "cup", "national"];
    return order
      .map((tier) => ({ tier, items: byTier[tier] || [] }))
      .filter((s) => s.items.length > 0);
  }, [country]);

  const nationalTeamName = useMemo(() => {
    return country.competitions.find((competition) => competition.tier === "national")?.nationalTeamName || "";
  }, [country.competitions]);

  const { data: worldRank } = useQuery({
    queryKey: ["country", "world-rank", code, nationalTeamName],
    enabled: Boolean(nationalTeamName),
    queryFn: async () => {
      const teamId = `name:${encodeURIComponent(nationalTeamName)}`;
      const route = `/api/sports/team/${encodeURIComponent(teamId)}?sport=soccer&league=fifa.world&teamName=${encodeURIComponent(nationalTeamName)}`;
      const res = await apiRequest("GET", route);
      const json = await res.json();
      const rank = Number(json?.worldRank ?? json?.fifaRank ?? json?.leagueRank ?? json?.ranking);
      return Number.isFinite(rank) && rank > 0 ? rank : null;
    },
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <LinearGradient
        colors={["#1C1C28", "#12121A", "#09090D"]}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerHero}>
          <Text style={styles.flag}>{flagFromIso2(code)}</Text>
          <Text style={styles.countryName}>{tFn(country.countryName)}</Text>
          <View style={styles.metaPill}>
            <Ionicons name="trophy-outline" size={11} color={P.muted} />
            <Text style={styles.countryMeta}>
              {country.competitions.length} {tFn("sportsHome.competitions")}
            </Text>
          </View>
          {worldRank ? (
            <View style={styles.metaPill}>
              <Ionicons name="flag-outline" size={11} color={P.muted} />
              <Text style={styles.countryMeta}>FIFA #{worldRank}</Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>

      {/* ── Competitions ── */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section) => (
          <View key={section.tier} style={styles.sectionCard}>
            {/* Section header */}
            <View style={styles.sectionHead}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name={tierIcon(section.tier) as any} size={14} color={P.accent} />
              </View>
              <Text style={styles.sectionTitle}>{tierLabel(section.tier)}</Text>
              <View style={styles.sectionCount}>
                <Text style={styles.sectionCountText}>{section.items.length}</Text>
              </View>
            </View>

            {/* Competition rows */}
            {section.items.map((comp, idx) => {
              const competitionBrand = resolveCompetitionBrand({
                name: comp.league,
                espnLeague: comp.espn,
                countryCode: country.countryCode,
                tier: comp.tier,
              });
              const logo = competitionBrand.logo;
              const isLast = idx === section.items.length - 1;
              return (
                <TouchableOpacity
                  key={comp.id}
                  style={[styles.compRow, isLast && styles.compRowLast]}
                  activeOpacity={0.75}
                  onPress={() => {
                    if (comp.tier === "national" && comp.nationalTeamName) {
                      router.push({
                        pathname: "/team-detail",
                        params: {
                          teamId: `name:${encodeURIComponent(comp.nationalTeamName)}`,
                          teamName: comp.nationalTeamName,
                          sport: "soccer",
                          league: comp.espn,
                          espnLeague: comp.espn,
                        },
                      });
                    } else {
                      router.push({
                        pathname: "/competition",
                        params: {
                          league: comp.league,
                          sport: "soccer",
                          espnLeague: comp.espn,
                        },
                      });
                    }
                  }}
                >
                  <View style={[styles.compAccent, { backgroundColor: comp.color }]} />
                  <View style={[styles.compIconWrap, { backgroundColor: `${comp.color}18` }]}>
                    {logo ? (
                      <Image
                        source={typeof logo === "number" ? logo : { uri: logo as string }}
                        style={styles.compLogo}
                        resizeMode="contain"
                      />
                    ) : (
                      <Ionicons
                        name={tierIcon(comp.tier) as any}
                        size={18}
                        color={comp.color}
                      />
                    )}
                  </View>
                  <View style={styles.compInfo}>
                    <Text style={styles.compName} numberOfLines={1}>
                      {comp.league}
                    </Text>
                    <Text style={[styles.compTier, { color: comp.color }]}>
                      {tierLabel(comp.tier)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={P.muted} />
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: P.bg },

  /* ── Header ── */
  header: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  headerHero: {
    alignItems: "center",
    gap: 6,
  },
  flag: {
    fontSize: 56,
    lineHeight: 64,
  },
  countryName: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 28,
    color: P.text,
    letterSpacing: -0.5,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginTop: 2,
  },
  countryMeta: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: P.muted,
  },

  /* ── Content ── */
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 48,
  },

  /* ── Section card ── */
  sectionCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.elevated,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  sectionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(229,9,20,0.15)",
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    color: P.text,
    fontSize: 13,
    flex: 1,
    letterSpacing: 0.3,
  },
  sectionCount: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sectionCountText: {
    fontFamily: "Inter_700Bold",
    color: P.muted,
    fontSize: 11,
  },

  /* ── Competition rows ── */
  compRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 10,
    paddingRight: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  compRowLast: {
    borderBottomWidth: 0,
  },
  compAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
  },
  compIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  compLogo: {
    width: 26,
    height: 26,
  },
  compInfo: {
    flex: 1,
    gap: 3,
  },
  compName: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: P.text,
    lineHeight: 20,
  },
  compTier: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    opacity: 0.95,
  },
});
