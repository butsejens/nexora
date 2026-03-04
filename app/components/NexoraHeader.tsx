import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import { COLORS } from "@/constants/colors";

interface Props {
  title?: string;
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

  const content = (
    <View style={styles.contentRow}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>
          <Text style={styles.logoN}>N</Text>
          <Text style={styles.logoRest}>EXORA</Text>
        </Text>
        {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
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
        { paddingTop: topPad + 8, maxWidth: containerMax, alignSelf: "center", width: "100%" },
      ]}
    >
      {isIOS ? (
        <BlurView intensity={55} tint="dark" style={styles.glassWrap}>
          {content}
        </BlurView>
      ) : (
        <View style={styles.flatWrap}>{content}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "transparent",
  },
  glassWrap: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.overlayLight,
  },
  flatWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logo: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 2,
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
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
  },
  profileBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
