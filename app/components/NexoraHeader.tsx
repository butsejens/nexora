/**
 * NexoraHeader — premium app header (ESPN / Netflix / DAZN quality)
 *
 * Layout:
 *   [← back?]  [menu?]       NEXORA         [search] [notif] [fav]
 *                              HOME
 *
 * - Glass/blur effect (Apple-style)
 * - Centered NEXORA wordmark with red "N"
 * - Menu + back buttons on left, action buttons on right
 */
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { BlurView } from "expo-blur";
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
  showHome?: boolean;
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
  showMenu = true,
  showHome = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const isTablet = width >= 760;
  const isModule = variant === "module";
  const openMenu = useUiStore((state) => state.openNexoraMenu);

  const handleBack = onBack ?? (() => router.back());
  const handleNotification =
    onNotification ?? (() => router.push("/follow-center"));
  const handleFavorites = onFavorites ?? (() => router.push("/favorites"));
  const handleProfile = onProfile ?? (() => router.push("/profile"));
  const handleSearch = onSearch ?? (() => router.navigate("/(tabs)/search"));
  const handleMenu = () => openMenu();
  const handleHome = () => router.replace("/(tabs)/home");

  const labelColor = titleColor ?? COLORS.accent;
  const hasTitle = Boolean(title?.trim());
  const btnSize = isTablet ? 40 : 36;
  const iconSize = isTablet ? 20 : 18;

  const badgeStyle =
    badgeTone === "live"
      ? styles.badgeLive
      : badgeTone === "accent"
        ? styles.badgeAccent
        : null;

  const glassContent = (
    <View style={[styles.innerWrap, { paddingTop: topPad + 10 }]}>
      <View style={styles.row}>
        {/* Left actions: back + menu */}
        <View style={styles.leftActions}>
          {showBack ? (
            <ScalePress
              style={[
                styles.btn,
                styles.backBtn,
                { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
              ]}
              onPress={handleBack}
            >
              <Ionicons
                name="chevron-back"
                size={iconSize}
                color={COLORS.textSecondary}
              />
            </ScalePress>
          ) : null}
          {showMenu ? (
            <ActionBtn size={btnSize} onPress={handleMenu}>
              <Ionicons
                name="menu"
                size={iconSize}
                color={COLORS.textSecondary}
              />
            </ActionBtn>
          ) : null}
          {showHome ? (
            <ActionBtn size={btnSize} onPress={handleHome}>
              <Ionicons
                name="home-outline"
                size={iconSize}
                color={COLORS.textSecondary}
              />
            </ActionBtn>
          ) : null}
        </View>

        {/* Center: Brand block */}
        <View style={styles.brand}>
          <View style={styles.brandTopRow}>
            <Text style={styles.wordmark} numberOfLines={1}>
              <Text style={styles.wordmarkN}>N</Text>EXORA
            </Text>
          </View>
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
            <Text style={[styles.badge, badgeStyle]} numberOfLines={1}>
              {badgeLabel}
            </Text>
          ) : null}
        </View>

        {/* Right actions */}
        <View style={styles.actions}>
          {rightElement ?? null}

          {showSearch ? (
            <ActionBtn size={btnSize} onPress={handleSearch}>
              <Ionicons
                name="search"
                size={iconSize}
                color={COLORS.textSecondary}
              />
            </ActionBtn>
          ) : null}

          {showNotification ? (
            <ActionBtn size={btnSize} onPress={handleNotification}>
              <Ionicons
                name="notifications-outline"
                size={iconSize}
                color={COLORS.textSecondary}
              />
            </ActionBtn>
          ) : null}

          {showFavorites ? (
            <ActionBtn size={btnSize} onPress={handleFavorites}>
              <Ionicons
                name="heart-outline"
                size={iconSize}
                color={COLORS.textSecondary}
              />
            </ActionBtn>
          ) : null}

          {showProfile ? (
            <ScalePress
              style={[
                styles.btn,
                styles.profileBtn,
                { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
              ]}
              onPress={handleProfile}
            >
              <Ionicons
                name="person"
                size={iconSize - 1}
                color={COLORS.accent}
              />
            </ScalePress>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, isModule && styles.containerModule]}>
      {Platform.OS === "ios" ? (
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      ) : Platform.OS === "web" ? (
        <View style={[StyleSheet.absoluteFill, styles.webGlass]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.androidGlass]} />
      )}
      {glassContent}
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
      style={[
        styles.btn,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      onPress={onPress}
    >
      {children}
    </ScalePress>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.glassBorder,
  },
  containerModule: {
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  androidGlass: {
    backgroundColor: "rgba(5, 5, 5, 0.82)",
  },
  webGlass: {
    backgroundColor: "rgba(5, 5, 5, 0.75)",
    // @ts-ignore — web-only CSS property
    backdropFilter: "blur(20px)",
    // @ts-ignore
    WebkitBackdropFilter: "blur(20px)",
  },
  innerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    minHeight: 52,
  },
  leftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 1,
    flexShrink: 0,
    zIndex: 2,
  },
  brand: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
    zIndex: 1,
    pointerEvents: "none",
  },
  brandTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
  },
  wordmark: {
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 2.2,
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.text,
    flexShrink: 1,
  },
  wordmarkN: {
    color: COLORS.accent,
  },
  moduleLabel: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
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
    marginTop: 1,
    flexShrink: 0,
    zIndex: 2,
  },
  btn: {
    backgroundColor: COLORS.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  backBtn: {
    marginRight: 0,
  },
  profileBtn: {
    backgroundColor: "rgba(229,9,20,0.10)",
    borderColor: `${COLORS.accent}55`,
  },
});
