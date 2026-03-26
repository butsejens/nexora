import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import { COLORS } from "@/constants/colors";

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
  const isTablet = width >= 760;
  const containerMax = isTV ? 1320 : 960;
  const isIOS = Platform.OS === "ios";
  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const isModuleVariant = variant === "module";

  // Fallbacks: always navigate even if prop is not passed
  const handleNotification = onNotification ?? (() => router.push("/follow-center"));
  const handleFavorites = onFavorites ?? (() => router.push("/favorites"));
  const handleProfile = onProfile ?? (() => router.push("/profile"));

  const moduleTitleColor = titleColor ?? COLORS.accent;
  const iconSize = compact ? 17 : isTablet ? 20 : 18;
  const actionSize = compact ? 34 : isTablet ? 40 : 36;

  const brandWordmark = (
    <Text
      style={[
        styles.brandWordmark,
        compact ? styles.brandWordmarkCompact : null,
        isModuleVariant ? styles.brandWordmarkModule : null,
      ]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      NEXORA
    </Text>
  );

  const content = compact ? (
    <View style={styles.contentRow}>
      <View style={styles.brandAreaCompact}>
        {brandWordmark}
        {title ? (
          <Text style={[styles.sectionTitleCompact, { color: isModuleVariant ? moduleTitleColor : (titleColor ?? COLORS.textSecondary) }]} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {rightElement}
        {showSearch && (
          <TouchableOpacity style={[styles.iconBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={onSearch} activeOpacity={0.7}>
            <Ionicons name="search" size={iconSize} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showNotification && (
          <TouchableOpacity style={[styles.iconBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={handleNotification} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={iconSize} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showFavorites && (
          <TouchableOpacity style={[styles.iconBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={handleFavorites} activeOpacity={0.7}>
            <Ionicons name="heart-outline" size={iconSize} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showProfile && (
          <TouchableOpacity style={[styles.profileBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={handleProfile} activeOpacity={0.7}>
            <Ionicons name="person" size={compact ? 16 : 17} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  ) : (
    <View style={styles.contentRow}>
      <View style={styles.brandArea}>
        <View style={styles.brandTopRow}>
          {brandWordmark}
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
        {title ? (
          <Text style={[styles.sectionTitle, { color: isModuleVariant ? moduleTitleColor : (titleColor ?? COLORS.textSecondary) }]} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {rightElement}
        {showSearch && (
          <TouchableOpacity style={[styles.iconBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={onSearch} activeOpacity={0.7}>
            <Ionicons name="search" size={iconSize} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showNotification && (
          <TouchableOpacity style={[styles.iconBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={handleNotification} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={iconSize} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showFavorites && (
          <TouchableOpacity style={[styles.iconBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={handleFavorites} activeOpacity={0.7}>
            <Ionicons name="heart-outline" size={iconSize} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showProfile && (
          <TouchableOpacity style={[styles.profileBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={handleProfile} activeOpacity={0.7}>
            <Ionicons name="person" size={17} color={COLORS.accent} />
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
        { paddingTop: compact ? topPad + 2 : topPad + 5, maxWidth: containerMax, alignSelf: "center", width: "100%" },
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

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingBottom: 2,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  containerModule: {
    paddingHorizontal: 16,
    paddingBottom: 4,
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
    paddingHorizontal: 0,
    paddingVertical: 6,
  },
  brandArea: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  brandAreaCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  brandTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  brandWordmark: {
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: 2.4,
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.text,
    flexShrink: 1,
  },
  brandWordmarkCompact: {
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 1.9,
  },
  brandWordmarkModule: {
    letterSpacing: 2.8,
  },
  sectionTitle: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  headerBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    maxWidth: 112,
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
    gap: 6,
    marginLeft: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  profileBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  containerCompact: {
    paddingBottom: 2,
  },
  sectionTitleCompact: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: "Inter_700Bold",
    color: COLORS.textSecondary,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    flexShrink: 1,
  },
});
