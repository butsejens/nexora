import React from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";

import { useT } from "@/i18n";
import { SeoHead } from "@/components/SeoHead";
import { Footer } from "@/components/layout/Footer";
import { FloatingBackButton } from "@/components/navigation/MobileHeader";
import { Screen } from "@/components/ui/Screen";
import { FONTS, SPACING } from "@/constants/theme";
import { makeStyles } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";

const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "About CineLog",
    body: "CineLog is a discovery and tracking app for movies and series. It helps you find titles, build a watchlist, rate what you've seen and keep track of where you are in a show. CineLog does not host, stream or distribute any video content.",
  },
  {
    heading: "Content and attribution",
    body: "Titles, artwork, cast information, ratings and trailers come from The Movie Database (TMDB). CineLog uses the TMDB API but is not endorsed or certified by TMDB. All artwork and metadata remain the property of their respective rights holders.",
  },
  {
    heading: "Trailers",
    body: "Trailers are played through YouTube's official embedded player. Playback is subject to YouTube's terms of service and privacy policy.",
  },
  {
    heading: "Your data",
    body: "Your watchlist, favourites, ratings, viewing history and episode progress are stored on your device. When you sign in, they can also be synced to your account so they follow you between devices. You can clear your history or delete all of your data at any time from Settings.",
  },
  {
    heading: "Contact",
    body: "Questions about your data or this notice can be raised through the support channel listed in the app store entry for CineLog.",
  },
];

export default function LegalScreen() {
  const t = useT();
  const styles = useStyles();
  const { gutter } = useResponsive();

  return (
    <>
      <SeoHead
        title={t("Legal & Privacy")}
        description="How CineLog handles your data, and the sources behind its movie and series information."
      />
      <Screen reserveBottomNav>
        <FloatingBackButton onPress={() => router.back()} gutter={gutter} />

        <View style={[styles.body, { paddingHorizontal: gutter }]}>
          <Text style={styles.title} accessibilityRole="header">
            {t("Legal & Privacy")}
          </Text>
          {SECTIONS.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.heading} accessibilityRole="header">
                {section.heading}
              </Text>
              <Text style={styles.paragraph}>{t(section.body)}</Text>
            </View>
          ))}
        </View>

        <Footer />
      </Screen>
    </>
  );
}

const useStyles = makeStyles((c, t) => ({
  body: {
    gap: SPACING.xl,
    paddingTop: SPACING.xxxl,
    maxWidth: 720,
  },
  title: {
    fontFamily: FONTS.extrabold,
    fontSize: 30,
    letterSpacing: -0.8,
    color: c.textPrimary,
  },
  section: {
    gap: SPACING.sm,
  },
  heading: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: c.textPrimary,
  },
  paragraph: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 22,
    color: c.textSecondary,
  },
}));
