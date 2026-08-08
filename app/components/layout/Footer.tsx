/**
 * CineLog — page footer.
 *
 * Carries the brand line, the TMDB attribution their terms require, and the
 * secondary links that don't belong in the primary navigation.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { useT } from "@/i18n";
import { CineLogLogo } from "@/components/brand/CineLogLogo";
import { FONTS, SPACING } from "@/constants/theme";
import { makeStyles } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";

const LINKS: { label: string; href: string }[] = [
  { label: "Profile", href: "/profile" },
  { label: "Settings", href: "/settings" },
  { label: "Legal", href: "/legal" },
];

export function Footer() {
  const t = useT();
  const styles = useStyles();
  const { gutter, isMobile } = useResponsive();

  return (
    <View
      style={[
        styles.footer,
        { paddingHorizontal: gutter },
        isMobile ? styles.footerMobile : null,
      ]}
    >
      <View style={styles.brandBlock}>
        <CineLogLogo size={24} showTagline />
      </View>

      <View style={styles.linkRow}>
        {LINKS.map((link) => (
          <Pressable
            key={link.href}
            onPress={() => router.push(link.href as never)}
            accessibilityRole="link"
            accessibilityLabel={t(link.label)}
          >
            <Text style={styles.link}>{t(link.label)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.attribution}>
        {t(
          "Movie and series data provided by The Movie Database (TMDB). CineLog is not endorsed or certified by TMDB.",
        )}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
  footer: {
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.xl,
    marginTop: SPACING.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    gap: SPACING.lg,
  },
  footerMobile: {
    alignItems: "flex-start",
  },
  brandBlock: {
    flexDirection: "row",
  },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xl,
  },
  link: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: c.textSecondary,
  },
  attribution: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    lineHeight: 16,
    color: c.textFaint,
    maxWidth: 520,
  },
}));
