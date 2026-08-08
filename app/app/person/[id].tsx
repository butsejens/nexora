import React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { useLocale, useT } from "@/i18n";
import { Footer } from "@/components/layout/Footer";
import { SeoHead } from "@/components/SeoHead";
import { PosterGrid } from "@/components/media/PosterGrid";
import { FloatingBackButton } from "@/components/navigation/MobileHeader";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { openTitle, parseIdParam } from "@/lib/cinelog/navigation";
import { usePerson } from "@/lib/cinelog/queries";
import { formatDate, metaLine } from "@/lib/format";

export default function PersonScreen() {
  const t = useT();
  const locale = useLocale();
  const { colors } = useTheme();
  const styles = useStyles();
  const params = useLocalSearchParams<{ id?: string }>();
  const personId = parseIdParam(params.id);
  const { gutter, isMobile } = useResponsive();

  const query = usePerson(personId);
  const person = query.data;

  if (!personId || query.isError) {
    return (
      <Screen scroll={false}>
        <FloatingBackButton onPress={() => router.back()} gutter={gutter} />
        <ErrorState
          onRetry={personId ? () => void query.refetch() : undefined}
        />
      </Screen>
    );
  }

  if (!person) {
    return (
      <Screen>
        <FloatingBackButton onPress={() => router.back()} gutter={gutter} />
        <View style={[styles.header, { paddingHorizontal: gutter }]}>
          <Skeleton
            width={isMobile ? 110 : 160}
            height={isMobile ? 110 : 160}
            radius={999}
          />
          <View style={styles.headerCopy}>
            <Skeleton width="50%" height={26} />
            <Skeleton width="30%" height={14} />
            <Skeleton width="90%" height={14} />
          </View>
        </View>
      </Screen>
    );
  }

  const photoSize = isMobile ? 110 : 168;
  const lifespan = metaLine([
    person.birthday
      ? t("Born {{date}}", { date: formatDate(person.birthday, locale) })
      : null,
    person.deathday
      ? t("Died {{date}}", { date: formatDate(person.deathday, locale) })
      : null,
    person.placeOfBirth,
  ]);

  return (
    <>
      <SeoHead
        title={person.name}
        description={
          person.biography ||
          `${person.name} on CineLog: biography and the titles they are known for.`
        }
        image={person.photo}
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
          {person.photo ? (
            <Image
              source={{ uri: person.photo }}
              style={[styles.photo, { width: photoSize, height: photoSize }]}
              contentFit="cover"
              transition={220}
              accessibilityLabel={t("Photo of {{name}}", { name: person.name })}
            />
          ) : (
            <View
              style={[
                styles.photo,
                styles.photoFallback,
                { width: photoSize, height: photoSize },
              ]}
            >
              <Ionicons name="person" size={32} color={colors.textFaint} />
            </View>
          )}

          <View style={styles.headerCopy}>
            <Text style={styles.name} accessibilityRole="header">
              {person.name}
            </Text>
            {person.knownForDepartment ? (
              <Text style={styles.role}>{person.knownForDepartment}</Text>
            ) : null}
            {lifespan ? <Text style={styles.meta}>{lifespan}</Text> : null}
            {person.biography ? (
              <Text style={styles.bio} numberOfLines={isMobile ? 8 : 10}>
                {person.biography}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { paddingHorizontal: gutter }]}>
            {t("Known For")}
          </Text>
          {person.knownFor.length === 0 ? (
            <EmptyState
              compact
              icon="film-outline"
              title={t("No credits to show")}
              message={t("We don't have any titles for this person yet.")}
            />
          ) : (
            <PosterGrid items={person.knownFor} onSelect={openTitle} />
          )}
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
  },
  headerMobile: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  photo: {
    borderRadius: RADIUS.pill,
    backgroundColor: c.surface,
  },
  photoFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    gap: SPACING.sm,
    maxWidth: 760,
  },
  name: {
    fontFamily: FONTS.extrabold,
    fontSize: 30,
    letterSpacing: -0.8,
    color: c.textPrimary,
  },
  role: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: c.accent,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: c.textSecondary,
  },
  bio: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 21,
    color: c.textSecondary,
  },
  section: {
    gap: SPACING.md,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: c.textPrimary,
  },
}));
