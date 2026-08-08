import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useT } from "@/i18n";
import { SeoHead } from "@/components/SeoHead";
import { Footer } from "@/components/layout/Footer";
import { Carousel } from "@/components/media/Carousel";
import { PosterCard } from "@/components/media/PosterCard";
import { FloatingBackButton } from "@/components/navigation/MobileHeader";
import { ProfileStats } from "@/components/profile/ProfileStats";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { EmptyState } from "@/components/ui/States";
import { FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { openTitle } from "@/lib/cinelog/navigation";
import { formatRating } from "@/lib/format";
import { useAuth } from "@/store/auth-store";
import {
  useLibrary,
  useLibraryStats,
  useRecentlyWatched,
} from "@/store/library-store";
import { Pressable } from "@/components/ui/Pressable";

export default function ProfileScreen() {
  const t = useT();
  const { colors } = useTheme();
  const styles = useStyles();
  const { gutter, railPosterWidth, isMobile } = useResponsive();
  const user = useAuth((state) => state.user);
  const signOut = useAuth((state) => state.signOut);

  const stats = useLibraryStats();
  const history = useRecentlyWatched();
  const recentlyWatched = useMemo(() => history.slice(0, 20), [history]);

  const favorites = useLibrary((state) => state.favorites);
  const ratings = useLibrary((state) => state.ratings);

  const favoriteMovies = favorites.filter((entry) => entry.type === "movie");
  const favoriteSeries = favorites.filter((entry) => entry.type === "series");
  const ratedTitles = useMemo(
    () =>
      Object.values(ratings).sort(
        (a, b) => Date.parse(b.ratedAt) - Date.parse(a.ratedAt),
      ),
    [ratings],
  );

  const displayName = user?.displayName ?? t("Guest");
  const initial = displayName.trim().charAt(0).toUpperCase() || "C";

  return (
    <>
      <SeoHead
        title={t("Profile")}
        description="Your viewing stats, recently watched titles, favourites and ratings."
      />
      <Screen reserveBottomNav>
        <FloatingBackButton onPress={() => router.back()} gutter={gutter} />

        <View
          style={[
            styles.header,
            { paddingHorizontal: gutter },
            isMobile ? styles.headerMobile : null,
          ]}
        >
          {user?.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}

          <View style={styles.headerCopy}>
            <Text style={styles.name} accessibilityRole="header">
              {displayName}
            </Text>
            <Text style={styles.email}>
              {user
                ? user.email
                : "Sign in to sync your library across devices"}
            </Text>
            <View style={styles.headerActions}>
              {user ? (
                <>
                  <Button
                    label={t("Settings")}
                    icon="settings-outline"
                    variant="secondary"
                    onPress={() => router.push("/settings")}
                  />
                  <Button
                    label={t("Logout")}
                    icon="log-out-outline"
                    variant="danger"
                    onPress={() => {
                      void signOut();
                    }}
                  />
                </>
              ) : (
                <>
                  <Button
                    label={t("Sign in")}
                    icon="log-in-outline"
                    onPress={() => router.push("/auth")}
                  />
                  <Button
                    label={t("Settings")}
                    icon="settings-outline"
                    variant="secondary"
                    onPress={() => router.push("/settings")}
                  />
                </>
              )}
            </View>
          </View>
        </View>

        <View style={[styles.statsBlock, { paddingHorizontal: gutter }]}>
          <ProfileStats stats={stats} />
        </View>

        <View style={styles.sections}>
          {recentlyWatched.length > 0 ? (
            <Carousel
              title={t("Recently Watched")}
              items={recentlyWatched}
              isLoading={false}
              itemWidth={railPosterWidth}
              keyExtractor={(item) => item.id}
              renderItem={(item) => (
                <PosterCard
                  item={item}
                  width={railPosterWidth}
                  onPress={() => openTitle(item)}
                  subtitle={t(
                    item.state === "watched" ? "Watched" : "Watching",
                  )}
                />
              )}
            />
          ) : null}

          {favoriteMovies.length > 0 ? (
            <Carousel
              title={t("Favorite Movies")}
              items={favoriteMovies}
              isLoading={false}
              itemWidth={railPosterWidth}
              keyExtractor={(item) => item.id}
              renderItem={(item) => (
                <PosterCard
                  item={item}
                  width={railPosterWidth}
                  onPress={() => openTitle(item)}
                />
              )}
            />
          ) : null}

          {favoriteSeries.length > 0 ? (
            <Carousel
              title={t("Favorite Series")}
              items={favoriteSeries}
              isLoading={false}
              itemWidth={railPosterWidth}
              keyExtractor={(item) => item.id}
              renderItem={(item) => (
                <PosterCard
                  item={item}
                  width={railPosterWidth}
                  onPress={() => openTitle(item)}
                />
              )}
            />
          ) : null}

          {ratedTitles.length > 0 ? (
            <View style={styles.ratingsBlock}>
              <Text
                style={[styles.sectionTitle, { paddingHorizontal: gutter }]}
              >
                {t("Your Ratings")}
              </Text>
              <View style={[styles.ratingList, { paddingHorizontal: gutter }]}>
                {ratedTitles.map((entry) => (
                  <Pressable
                    key={entry.id}
                    onPress={() => openTitle(entry)}
                    accessibilityRole="button"
                    accessibilityLabel={`${entry.title}, you rated it ${entry.score} out of 10`}
                    style={({ hovered }) => [
                      styles.ratingRow,
                      hovered ? styles.ratingRowHovered : null,
                    ]}
                  >
                    <View style={styles.scoreBubble}>
                      <Text style={styles.scoreBubbleText}>{entry.score}</Text>
                    </View>
                    <View style={styles.ratingCopy}>
                      <Text style={styles.ratingTitle} numberOfLines={1}>
                        {entry.title}
                      </Text>
                      <Text style={styles.ratingMeta}>
                        {[
                          t(entry.type === "movie" ? "Movie" : "Series"),
                          entry.year || null,
                          formatRating(entry.rating)
                            ? `Average ${formatRating(entry.rating)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.textMuted}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {recentlyWatched.length === 0 &&
          favorites.length === 0 &&
          ratedTitles.length === 0 ? (
            <EmptyState
              icon="stats-chart-outline"
              title={t("Your CineLog story starts here")}
              message={t(
                "Rate a film, favourite a show or tick off an episode and this page fills up.",
              )}
              actionLabel={t("Explore")}
              onAction={() => router.navigate("/(tabs)/home")}
            />
          ) : null}
        </View>

        <Footer />
      </Screen>
    </>
  );
}

const useStyles = makeStyles((c, t) => ({
  header: {
    flexDirection: "row",
    gap: SPACING.xl,
    paddingTop: SPACING.xxxl,
    paddingBottom: SPACING.xl,
    alignItems: "center",
  },
  headerMobile: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: RADIUS.pill,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.accent,
  },
  avatarText: {
    fontFamily: FONTS.extrabold,
    fontSize: 32,
    color: c.textPrimary,
  },
  headerCopy: {
    flex: 1,
    gap: SPACING.sm,
  },
  name: {
    fontFamily: FONTS.extrabold,
    fontSize: 28,
    letterSpacing: -0.7,
    color: c.textPrimary,
  },
  email: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: c.textSecondary,
  },
  headerActions: {
    flexDirection: "row",
    gap: SPACING.md,
    flexWrap: "wrap",
    paddingTop: SPACING.sm,
  },
  statsBlock: {
    paddingBottom: SPACING.xl,
  },
  sections: {
    gap: SPACING.xxl,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: c.textPrimary,
  },
  ratingsBlock: {
    gap: SPACING.md,
  },
  ratingList: {
    gap: SPACING.sm,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  ratingRowHovered: {
    backgroundColor: c.surfaceHover,
    borderColor: c.borderStrong,
  },
  scoreBubble: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.accentSoft,
    borderWidth: 1,
    borderColor: c.accent,
  },
  scoreBubbleText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: c.textPrimary,
  },
  ratingCopy: {
    flex: 1,
    gap: 2,
  },
  ratingTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: c.textPrimary,
  },
  ratingMeta: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: c.textMuted,
  },
}));
