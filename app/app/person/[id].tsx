import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { Footer } from "@/components/layout/Footer";
import { PosterGrid } from "@/components/media/PosterGrid";
import { FloatingBackButton } from "@/components/navigation/MobileHeader";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { COLORS, FONTS, RADIUS, SPACING } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { openTitle, parseIdParam } from "@/lib/cinelog/navigation";
import { usePerson } from "@/lib/cinelog/queries";
import { formatDate, metaLine } from "@/lib/format";

export default function PersonScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const personId = parseIdParam(params.id);
  const { gutter, isMobile } = useResponsive();

  const query = usePerson(personId);
  const person = query.data;

  if (!personId || query.isError) {
    return (
      <Screen scroll={false}>
        <FloatingBackButton onPress={() => router.back()} gutter={gutter} />
        <ErrorState onRetry={personId ? () => void query.refetch() : undefined} />
      </Screen>
    );
  }

  if (!person) {
    return (
      <Screen>
        <FloatingBackButton onPress={() => router.back()} gutter={gutter} />
        <View style={[styles.header, { paddingHorizontal: gutter }]}>
          <Skeleton width={isMobile ? 110 : 160} height={isMobile ? 110 : 160} radius={999} />
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
    person.birthday ? `Born ${formatDate(person.birthday)}` : null,
    person.deathday ? `Died ${formatDate(person.deathday)}` : null,
    person.placeOfBirth,
  ]);

  return (
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
            accessibilityLabel={`Photo of ${person.name}`}
          />
        ) : (
          <View
            style={[
              styles.photo,
              styles.photoFallback,
              { width: photoSize, height: photoSize },
            ]}
          >
            <Ionicons name="person" size={32} color={COLORS.textFaint} />
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
        <Text style={[styles.sectionTitle, { paddingHorizontal: gutter }]}>Known For</Text>
        {person.knownFor.length === 0 ? (
          <EmptyState
            compact
            icon="film-outline"
            title="No credits to show"
            message="We don't have any titles for this person yet."
          />
        ) : (
          <PosterGrid items={person.knownFor} onSelect={openTitle} />
        )}
      </View>

      <Footer />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: COLORS.surface,
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
    color: COLORS.textPrimary,
  },
  role: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: COLORS.accent,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  bio: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textSecondary,
  },
  section: {
    gap: SPACING.md,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: COLORS.textPrimary,
  },
});
