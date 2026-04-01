/**
 * NexoraHeader — premium app header (ESPN / Netflix / DAZN quality)
 *
 * Layout:
 *   [← back?]  NEXORA          [search] [notif] [fav]
 *              HOME
 *
 * The brand block always gets flex:1 so action buttons NEVER push
 * the wordmark or label off-screen. Module label is always on its
 * own line — zero text clipping risk on any screen size.
 */
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { COLORS } from "@/constants/colors";
import { ScalePress } from "@/components/ui/ScalePress";
import { useUiStore } from "@/store/uiStore";

export interface NexoraHeaderProps {
  /** Page/module title shown below NEXORA wordmark (HOME, SPORT, MENU …) */
  title?: string;
  /** Label colour — defaults to accent red */
  titleColor?: string;
  /** Optional small badge (e.g. "LIVE") */
  badgeLabel?: string;
  badgeTone?: "live" | "accent" | "neutral";
  /** "default" = standard border; "module" = subtle tinted border */
  variant?: "default" | "module";
  /** Accepted for legacy compat — has no visual effect any more */
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

// Keep old name as alias so any `Props` reference still works
type Props = NexoraHeaderProps;

export function NexoraHeader({
  title,
  titleColor,
  badgeLabel,
  badgeTone = "neutral",
  variant = "default",
  compact: _compact = false,
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
  const isTablet = width >= 760;
  const isModule = variant === "module";
  const openMenu = useUiStore((state) => state.openNexoraMenu);

  const handleBack = onBack ?? (() => router.back());
  const handleNotification = onNotification ?? (() => router.push("/follow-center"));
  const handleFavorites = onFavorites ?? (() => router.push("/favorites"));
  const handleProfile = onProfile ?? (() => router.push("/profile"));
  const handleSearch = onSearch ?? (() => router.navigate("/(tabs)/search"));
  const handleMenu = () => openMenu();

  const labelColor = titleColor ?? COLORS.accent;
  const hasTitle = Boolean(title?.trim());
  const btnSize = isTablet ? 40 : 36;
  const iconSize = isTablet ? 20 : 18;

  const badgeStyle =
    badgeTone === "live" ? styles.badgeLive :
    badgeTone === "accent" ? styles.badgeAccent : null;

  return (
    <View
      style={[
        styles.container,
        isModule && styles.containerModule,
        { paddingTop: topPad + 10 },
      ]}
    >
      <View style={styles.row}>
        {/* Leading back button */}
        {showBack ? (
          <ScalePress
            style={[styles.btn, styles.backBtn, { width: btnSize, height: btnSize, borderRadius: btnSize / 2 }]}
            onPress={handleBack}
          >
            <Ionicons name="chevron-back" size={iconSize} color={COLORS.textSecondary} />
          </ScalePress>
        ) : null}

        {/* Brand block — always flex:1, never compressed by actions */}
        <View style={styles.brand}>
          <Text style={styles.wordmark} numberOfLines={1}>NEXORA</Text>
          {hasTitle ? (
            <Text
              style={[styles.moduleLabel, { color: labelColor }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title}
            </Text>
          ) : null}
          {badgeLabel ? (
            <Text style={[styles.badge, badgeStyle]} numberOfLines={1}>{badgeLabel}</Text>
          ) : null}
        </View>

        {/* Action buttons — fixed, never flex-grow */}
        <View style={styles.actions}>
          {rightElement ?? null}

          {showMenu ? (
            <ActionBtn size={btnSize} onPress={handleMenu}>
              <Ionicons name="menu" size={iconSize} color={COLORS.textSecondary} />
            </ActionBtn>
          ) : null}

          {showSearch ? (
            <ActionBtn size={btnSize} onPress={handleSearch}>
              <Ionicons name="search" size={iconSize} color={COLORS.textSecondary} />
            </ActionBtn>
          ) : null}

          {showNotification ? (
            <ActionBtn size={btnSize} onPress={handleNotification}>
              <Ionicons name="notifications-outline" size={iconSize} color={COLORS.textSecondary} />
            </ActionBtn>
          ) : null}

          {showFavorites ? (
            <ActionBtn size={btnSize} onPress={handleFavorites}>
              <Ionicons name="heart-outline" size={iconSize} color={COLORS.textSecondary} />
            </ActionBtn>
          ) : null}

          {showProfile ? (
            <ScalePress
              style={[styles.btn, styles.profileBtn, { width: btnSize, height: btnSize, borderRadius: btnSize / 2 }]}
              onPress={handleProfile}
            >
              <Ionicons name="person" size={iconSize - 1} color={COLORS.accent} />
            </ScalePress>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ─── Reusable action button ───────────────────────────────────────────────────

function ActionBtn({
  size,
  onPress,
  children,
}: {
  size: number;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <ScalePress
      style={[styles.btn, { width: size, height: size, borderRadius: size / 2 }]}
      onPress={onPress}
    >
      {children}
    </ScalePress>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: COLORS.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  containerModule: {
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
  },
  brand: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  wordmark: {
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: 2.2,
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.text,
  },
  moduleLabel: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginTop: 1,
  },
  badge: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: COLORS.textMuted,
  },
  badgeLive: { color: COLORS.live },
  badgeAccent: { color: COLORS.accent },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 10,
    flexShrink: 0,
  },
  btn: {
    backgroundColor: COLORS.cardElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  backBtn: {
    marginRight: 10,
  },
  profileBtn: {
    backgroundColor: "rgba(229,9,20,0.10)",
    borderColor: `${COLORS.accent}55`,
  },
});
