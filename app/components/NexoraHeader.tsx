import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import { COLORS } from "@/constants/colors";
import { PulseBrandMark } from "@/components/brand/PulseBrandMark";

interface Props {
  title?: string;
  titleColor?: string;
  badgeLabel?: string;
  badgeTone?: "live" | "accent" | "neutral";
  variant?: "default" | "module";
  compact?: boolean;
  showSearch?: boolean;
  showNotification?: boolean;
  showFavorites?: boolean;
  showProfile?: boolean;
  onSearch?: () => void;
  onNotification?: () => void;
  onFavorites?: () => void;
  onProfile?: () => void;
  rightElement?: React.ReactNode;
}

export function NexoraHeader({
  title,
  titleColor,
  badgeLabel,
  badgeTone = "neutral",
  variant = "default",
  compact = false,
  showSearch = true,
  showNotification = false,
  showFavorites = false,
  showProfile = false,
  onSearch,
  onNotification,
  onFavorites,
  onProfile,
  rightElement,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTV = width >= 1200;
  const containerMax = isTV ? 1400 : 980;
  const isIOS = Platform.OS === "ios";
  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const isModuleVariant = variant === "module";

  // Fallbacks: always navigate even if prop is not passed
  const handleNotification = onNotification ?? (() => router.push("/follow-center"));
  const handleFavorites = onFavorites ?? (() => router.push("/favorites"));
  const handleProfile = onProfile ?? (() => router.push("/profile"));

  const moduleTitleColor = titleColor ?? COLORS.accent;

  const brandWordmark = (
    <Text style={[styles.moduleWordmark, compact ? styles.moduleWordmarkCompact : null]}>
      <Text style={styles.moduleWordmarkAccent}>N</Text>
      EXORA
    </Text>
  );

  const content = compact ? (
    <View style={styles.contentRow}>
      <View style={isModuleVariant ? styles.moduleBrandCompact : styles.logoCompact}>
        {isModuleVariant ? (
          <View style={styles.moduleWordmarkWrap}>
            {brandWordmark}
            {title ? <Text style={[styles.moduleSectionTitleCompact, { color: moduleTitleColor }]}>{title}</Text> : null}
          </View>
        ) : (
          <>
            <PulseBrandMark size={28} showWordmark={false} />
            {title ? <Text style={[styles.sectionTitleCompact, titleColor ? { color: titleColor } : null]}>{title}</Text> : null}
            {badgeLabel ? (
              <View
                style={[
                  styles.headerBadge,
                  badgeTone === "live" ? styles.headerBadgeLive : null,
                  badgeTone === "accent" ? styles.headerBadgeAccent : null,
                ]}
              >
                <Text style={[styles.headerBadgeText, badgeTone === "live" ? styles.headerBadgeTextLive : null]} numberOfLines={1}>
                  {badgeLabel}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </View>

      <View style={[styles.actions, isModuleVariant ? styles.moduleActionsCompact : null]}>
        {rightElement}
        {showSearch && (
          <TouchableOpacity style={isModuleVariant ? styles.iconBtnModuleCompact : styles.iconBtnCompact} onPress={onSearch} activeOpacity={0.7}>
            <Ionicons name="search" size={isModuleVariant ? 20 : 18} color={isModuleVariant ? stylesModule.icon : COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showNotification && (
          <TouchableOpacity style={isModuleVariant ? styles.iconBtnModuleCompact : styles.iconBtnCompact} onPress={handleNotification} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={isModuleVariant ? 20 : 18} color={isModuleVariant ? stylesModule.icon : COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showFavorites && (
          <TouchableOpacity style={isModuleVariant ? styles.iconBtnModuleCompact : styles.iconBtnCompact} onPress={handleFavorites} activeOpacity={0.7}>
            <Ionicons name="heart-outline" size={isModuleVariant ? 20 : 18} color={isModuleVariant ? stylesModule.icon : COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showProfile && (
          <TouchableOpacity style={isModuleVariant ? styles.profileBtnModuleCompact : styles.profileBtnCompact} onPress={handleProfile} activeOpacity={0.7}>
            <Ionicons name="person" size={isModuleVariant ? 18 : 15} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  ) : (
    <View style={styles.contentRow}>
      <View style={isModuleVariant ? styles.moduleBrand : styles.logo}>
        {isModuleVariant ? (
          <>
            {brandWordmark}
            {title ? <Text style={[styles.moduleSectionTitle, { color: moduleTitleColor }]}>{title}</Text> : null}
          </>
        ) : (
          <>
            <View style={styles.logoTopRow}>
              <View style={styles.brandLockup}>
                <PulseBrandMark size={34} showWordmark={false} />
                <View>
                  <Text style={styles.logoText}>NEXORA</Text>
                  <Text style={styles.logoSubText}>Premium Streaming Hub</Text>
                </View>
              </View>
              {badgeLabel ? (
                <View
                  style={[
                    styles.headerBadge,
                    badgeTone === "live" ? styles.headerBadgeLive : null,
                    badgeTone === "accent" ? styles.headerBadgeAccent : null,
                  ]}
                >
                  <Text style={[styles.headerBadgeText, badgeTone === "live" ? styles.headerBadgeTextLive : null]} numberOfLines={1}>
                    {badgeLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            {title ? <Text style={[styles.sectionTitle, titleColor ? { color: titleColor } : null]}>{title}</Text> : null}
          </>
        )}
      </View>

      <View style={[styles.actions, isModuleVariant ? styles.moduleActions : null]}>
        {rightElement}
        {showSearch && (
          <TouchableOpacity style={isModuleVariant ? styles.iconBtnModule : styles.iconBtn} onPress={onSearch} activeOpacity={0.7}>
            <Ionicons name="search" size={isModuleVariant ? 27 : 22} color={isModuleVariant ? stylesModule.icon : COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showNotification && (
          <TouchableOpacity style={isModuleVariant ? styles.iconBtnModule : styles.iconBtn} onPress={handleNotification} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={isModuleVariant ? 27 : 22} color={isModuleVariant ? stylesModule.icon : COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showFavorites && (
          <TouchableOpacity style={isModuleVariant ? styles.iconBtnModule : styles.iconBtn} onPress={handleFavorites} activeOpacity={0.7}>
            <Ionicons name="heart-outline" size={isModuleVariant ? 27 : 22} color={isModuleVariant ? stylesModule.icon : COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showProfile && (
          <TouchableOpacity style={isModuleVariant ? styles.profileBtnModule : styles.profileBtn} onPress={handleProfile} activeOpacity={0.7}>
            <Ionicons name="person" size={isModuleVariant ? 22 : 16} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        isModuleVariant && styles.containerModule,
        compact && styles.containerCompact,
        { paddingTop: compact ? topPad + 4 : topPad + 8, maxWidth: containerMax, alignSelf: "center", width: "100%" },
      ]}
    >
      {isIOS && !isModuleVariant ? (
        <>
          <BlurView intensity={50} tint="dark" style={styles.bgBlur} />
          {content}
        </>
      ) : (
        <View style={styles.flatWrap}>{content}</View>
      )}
    </View>
  );
}

const stylesModule = {
  icon: "rgba(255,255,255,0.68)",
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  containerModule: {
    paddingHorizontal: 28,
    paddingBottom: 14,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  flatWrap: {
    backgroundColor: "transparent",
  },
  bgBlur: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8,8,12,0.38)",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  logo: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 2,
  },
  moduleBrand: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 10,
  },
  moduleBrandCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  moduleWordmarkWrap: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 5,
  },
  logoTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandLockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoText: {
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: 0.9,
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.text,
  },
  logoSubText: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.3,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  moduleWordmark: {
    fontSize: 44,
    lineHeight: 44,
    letterSpacing: 9,
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.text,
  },
  moduleWordmarkCompact: {
    fontSize: 24,
    lineHeight: 26,
    letterSpacing: 5,
  },
  moduleWordmarkAccent: {
    color: COLORS.accent,
  },
  moduleSectionTitle: {
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: 5.5,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
  },
  moduleSectionTitleCompact: {
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 2.8,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  headerBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    maxWidth: 130,
  },
  headerBadgeLive: {
    borderColor: `${COLORS.live}55`,
    backgroundColor: `${COLORS.live}22`,
  },
  headerBadgeAccent: {
    borderColor: `${COLORS.accent}55`,
    backgroundColor: `${COLORS.accent}22`,
  },
  headerBadgeText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  headerBadgeTextLive: {
    color: COLORS.live,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  moduleActions: {
    gap: 14,
  },
  moduleActionsCompact: {
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  iconBtnModule: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#181818",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(229,9,20,0.10)",
    borderWidth: 1,
    borderColor: `${COLORS.accent}66`,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  profileBtnModule: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 2,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  containerCompact: {
    paddingBottom: 4,
  },
  logoCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitleCompact: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: COLORS.textSecondary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  iconBtnCompact: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnModuleCompact: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#181818",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileBtnCompact: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(229,9,20,0.11)",
    borderWidth: 1,
    borderColor: `${COLORS.accent}66`,
    alignItems: "center",
    justifyContent: "center",
  },
  profileBtnModuleCompact: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
