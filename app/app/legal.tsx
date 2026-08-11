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
    body: "CineLog is a discovery and tracking app for movies and series. It helps you find titles, build a watchlist, rate what you've seen and keep track of where you are in a show. CineLog does not host, stream or distribute video files itself and does not claim ownership of third-party media.",
  },
  {
    heading: "How playback works",
    body: "When you press play, CineLog may open embedded third-party playback providers. Availability, stream quality, subtitle tracks and playback controls can vary by provider, region and device. If a provider is unavailable, CineLog can try fallback providers.",
  },
  {
    heading: "Third-party services",
    body: "CineLog uses third-party services for metadata, trailers, authentication, notifications, analytics and playback embeds. These services may process technical data such as IP address, device model, app version, locale and request timestamps to deliver their functionality.",
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
    body: "Your watchlist, favourites, ratings, viewing history and episode progress are stored on your device. When you sign in, they may also be synced to your account so they can follow you between devices. You can clear history and delete profile-level data from Settings.",
  },
  {
    heading: "Data categories we process",
    body: "Depending on features you use, CineLog may process account identifiers, profile preferences, watch activity, search queries, notification tokens, crash diagnostics and anti-abuse telemetry. Sensitive payment card data is not processed directly by CineLog in this app flow.",
  },
  {
    heading: "Why we process data",
    body: "Data is processed to provide core app features, restore your library and progress, secure accounts, troubleshoot reliability issues, reduce abuse and improve product quality. Processing is limited to what is needed for these purposes.",
  },
  {
    heading: "Retention and deletion",
    body: "Library and progress records are retained while your account remains active or until you delete them. Operational logs are retained for a limited period for security and reliability. You can request account deletion where supported by your platform account and applicable law.",
  },
  {
    heading: "Your choices and controls",
    body: "You can edit watch status, ratings and saved lists at any time. You can remove entries from Continue Watching, clear history and manage notification preferences in Settings. On compatible devices, playback target options like AirPlay or Cast depend on browser, OS and provider support.",
  },
  {
    heading: "Regional and legal compliance",
    body: "Depending on your location, you may have rights to access, correct, export or delete personal data. CineLog aims to support applicable privacy requirements including transparency, minimization and user control principles.",
  },
  {
    heading: "Acceptable use",
    body: "You agree not to misuse CineLog, interfere with service integrity, attempt unauthorized access, bypass security controls or violate rights of content owners and service providers. Features may be restricted or suspended in case of abuse.",
  },
  {
    heading: "No warranty of availability",
    body: "CineLog is provided as-is. Third-party APIs, metadata and playback providers may change, degrade or become unavailable without notice. We cannot guarantee uninterrupted playback, permanent provider availability or universal device compatibility.",
  },
  {
    heading: "Policy updates",
    body: "This notice can be updated when features, providers or legal requirements change. Material updates may be reflected in app release notes or legal screen revisions.",
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
