import React from "react";
import { View, Text, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { COLORS } from "@/constants/colors";
import { ScalePress } from "@/components/ui/ScalePress";
import { useUiStore } from "@/store/uiStore";

interface Props {
  title?: string;
  titleColor?: string;
  badgeLabel?: string;
  badgeTone?: "live" | "accent" | "neutral";
  variant?: "default" | "module";
  compact?: boolean;
  showBack?: boolean;
  showMenu?: boolean;
  showSearch?: boolean;
  showNotification?: boolean;
  showFavorites?: boolean;
  showProfile?: boolean;
  onBack?: () => void;
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
  showBack = false,
  showSearch = true,
  showNotification = false,
  showFavorites = false,
  showProfile = false,
  onBack,
  onSearch,
  onNotification,
  onFavorites,
  onProfile,
  rightElement,
  showMenu = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const isNarrow = width < 360;
  const isTablet = width >= 760;
  const isModuleVariant = variant === "module";
  const openMenu = useUiStore((state) => state.openNexoraMenu);

  // Fallbacks: always navigate even if prop is not passed
  const handleBack = onBack ?? (() => router.back());
  const handleNotification = onNotification ?? (() => router.push("/follow-center"));
  const handleFavorites = onFavorites ?? (() => router.push("/favorites"));
  const handleProfile = onProfile ?? (() => router.push("/profile"));
  const handleSearch = onSearch ?? (() => router.navigate("/(tabs)/search"));
  const handleMenu = () => openMenu();

  const moduleTitleColor = titleColor ?? COLORS.accent;
  const actionSize = isNarrow ? 32 : compact ? 34 : isTablet ? 40 : 36;
  const iconSize = isNarrow ? 17 : compact ? 18 : isTablet ? 20 : 18;
  const hasTitle = Boolean(title && String(title).trim().length > 0);
  const shouldStackLabel = hasTitle && (isNarrow || String(title).trim().length > 10);

  return (
    <View
      style={[
        styles.container,
        isModuleVariant ? styles.containerModule : null,
        { paddingTop: topPad + (compact ? 6 : 8) },
      ]}
    >
      <View style={styles.row}>
        {showBack ? (
          <ScalePress style={[styles.iconBtn, styles.leadingAction, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={handleBack}>
            <Ionicons name="chevron-back" size={iconSize} color={COLORS.textSecondary} />
          </ScalePress>
        ) : null}

        <View style={styles.brandBlock}>
          {shouldStackLabel ? (
            <View style={styles.brandStacked}>
              <Text style={[styles.wordmark, compact ? styles.wordmarkCompact : null]}>NEXORA</Text>
              <Text
                style={[
                  styles.moduleLabel,
                  styles.moduleLabelStacked,
                  compact ? styles.moduleLabelCompact : null,
                  { color: isModuleVariant ? moduleTitleColor : (titleColor ?? COLORS.textSecondary) },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {String(title)}
              </Text>
            </View>
          ) : (
            <View style={styles.brandLine}>
              <Text style={[styles.wordmark, compact ? styles.wordmarkCompact : null]}>NEXORA</Text>
              {hasTitle ? (
                <Text
                  style={[
                    styles.moduleLabel,
                    compact ? styles.moduleLabelCompact : null,
                    { color: isModuleVariant ? moduleTitleColor : (titleColor ?? COLORS.textSecondary) },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {String(title)}
                </Text>
              ) : null}
            </View>
          )}

          {badgeLabel ? (
            <Text
              style={[
                styles.badge,
                badgeTone === "live" ? styles.badgeLive : null,
                badgeTone === "accent" ? styles.badgeAccent : null,
              ]}
              numberOfLines={1}
            >
              {badgeLabel}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {rightElement}
          {showMenu ? (
            <ScalePress style={[styles.iconBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={handleMenu}>
              <Ionicons name="menu" size={iconSize} color={COLORS.textSecondary} />
            </ScalePress>
          ) : null}
          {showSearch ? (
            <ScalePress style={[styles.iconBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={handleSearch}>
              <Ionicons name="search" size={iconSize} color={COLORS.textSecondary} />
            </ScalePress>
          ) : null}
          {showNotification ? (
            <ScalePress style={[styles.iconBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={handleNotification}>
              <Ionicons name="notifications-outline" size={iconSize} color={COLORS.textSecondary} />
            </ScalePress>
          ) : null}
          {showFavorites ? (
            <ScalePress style={[styles.iconBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={handleFavorites}>
              <Ionicons name="heart-outline" size={iconSize} color={COLORS.textSecondary} />
            </ScalePress>
          ) : null}
          {showProfile ? (
            <ScalePress style={[styles.profileBtn, { width: actionSize, height: actionSize, borderRadius: actionSize / 2 }]} onPress={handleProfile}>
              <Ionicons name="person" size={isNarrow ? 15 : 17} color={COLORS.accent} />
            </ScalePress>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  containerModule: {
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
  },
  leadingAction: {
    marginRight: 8,
  },
  brandBlock: {
    flex: 1,
    minWidth: 0,
  },
  brandLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
  },
  brandStacked: {
    minWidth: 0,
    gap: 0,
  },
  wordmark: {
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: 1.9,
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.text,
    flexShrink: 0,
  },
  wordmarkCompact: {
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: 1.7,
  },
  moduleLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  moduleLabelCompact: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  moduleLabelStacked: {
    fontSize: 11,
    lineHeight: 14,
  },
  badge: {
    marginTop: 2,
    color: COLORS.textMuted,
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  badgeLive: {
    color: COLORS.live,
  },
  badgeAccent: {
    color: COLORS.accent,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: 8,
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
});
