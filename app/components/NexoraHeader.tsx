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

  // Fallbacks: always navigate even if prop is not passed
  const handleFavorites = onFavorites ?? (() => router.push("/favorites"));
  const handleProfile = onProfile ?? (() => router.push("/profile"));

  const content = compact ? (
    <View style={styles.contentRow}>
      <View style={styles.logoCompact}>
        <Text style={styles.logoTextCompact}>
          <Text style={styles.logoN}>N</Text>
        </Text>
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
      </View>

      <View style={styles.actions}>
        {rightElement}
        {showSearch && (
          <TouchableOpacity style={styles.iconBtnCompact} onPress={onSearch} activeOpacity={0.7}>
            <Ionicons name="search" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showProfile && (
          <TouchableOpacity style={styles.iconBtnCompact} onPress={handleProfile} activeOpacity={0.7}>
            <Ionicons name="person" size={14} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  ) : (
    <View style={styles.contentRow}>
      <View style={styles.logo}>
        <View style={styles.logoTopRow}>
          <Text style={styles.logoText}>
            <Text style={styles.logoN}>N</Text>
            <Text style={styles.logoRest}>EXORA</Text>
          </Text>
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
      </View>

      <View style={styles.actions}>
        {rightElement}
        {showSearch && (
          <TouchableOpacity style={styles.iconBtn} onPress={onSearch} activeOpacity={0.7}>
            <Ionicons name="search" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showNotification && (
          <TouchableOpacity style={styles.iconBtn} onPress={onNotification} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showFavorites && (
          <TouchableOpacity style={styles.iconBtn} onPress={handleFavorites} activeOpacity={0.7}>
            <Ionicons name="heart-outline" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        {showProfile && (
          <TouchableOpacity style={styles.profileBtn} onPress={handleProfile} activeOpacity={0.7}>
            <Ionicons name="person" size={16} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        compact && styles.containerCompact,
        { paddingTop: compact ? topPad + 4 : topPad + 8, maxWidth: containerMax, alignSelf: "center", width: "100%" },
      ]}
    >
      {isIOS ? (
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
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
  logoTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoText: {
    fontSize: 24,
    letterSpacing: 4,
    fontFamily: "Inter_800ExtraBold",
  },
  logoN: { color: COLORS.accent },
  logoRest: { color: COLORS.text },
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
    gap: 10,
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
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(229,9,20,0.12)",
    borderWidth: 1,
    borderColor: `${COLORS.accent}88`,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  containerCompact: {
    paddingBottom: 4,
  },
  logoCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logoTextCompact: {
    fontSize: 18,
    letterSpacing: 2,
    fontFamily: "Inter_800ExtraBold",
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
});
