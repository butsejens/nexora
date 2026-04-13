/**
 * Nexora Profile Dropdown
 * Appears when user taps the avatar in the top nav.
 * Slide-in from top-right corner.
 */
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";
import { useProfileStore } from "@/store/profileStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ProfileDropdownProps {
  onClose: () => void;
}

export function ProfileDropdown({ onClose }: ProfileDropdownProps) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  const { profiles, activeProfileId, setActiveProfile } = useProfileStore();
  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 140,
      friction: 16,
    }).start();
  }, [anim]);

  function close() {
    Animated.timing(anim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(onClose);
  }

  function handleSwitchProfile(id: string) {
    setActiveProfile(id);
    close();
  }

  function navigate(path: string) {
    close();
    setTimeout(() => router.push(path as any), 180);
  }

  const cardStyle = {
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [-12, 0],
        }),
      },
      {
        scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }),
      },
    ],
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close}>
        <Animated.View
          style={[styles.card, { top: insets.top + 58 }, cardStyle]}
        >
          {/* Current profile header */}
          <View style={styles.currentProfile}>
            <View
              style={[
                styles.bigAvatar,
                {
                  backgroundColor: activeProfile?.avatarColor ?? COLORS.accent,
                },
              ]}
            >
              <Text style={styles.bigAvatarEmoji}>
                {activeProfile?.avatarEmoji ?? "👤"}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {activeProfile?.name ?? "Profiel"}
              </Text>
              {activeProfile?.isKids && (
                <Text style={styles.kidsTag}>Kids</Text>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Switch profile — other profiles */}
          {profiles.filter((p) => p.id !== activeProfileId).length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Wissel van profiel</Text>
              {profiles
                .filter((p) => p.id !== activeProfileId)
                .map((profile) => (
                  <Pressable
                    key={profile.id}
                    style={({ pressed }) => [
                      styles.menuRow,
                      pressed && styles.menuRowPressed,
                    ]}
                    onPress={() => handleSwitchProfile(profile.id)}
                  >
                    <View
                      style={[
                        styles.smallAvatar,
                        { backgroundColor: profile.avatarColor },
                      ]}
                    >
                      <Text style={styles.smallAvatarEmoji}>
                        {profile.avatarEmoji}
                      </Text>
                    </View>
                    <Text style={styles.menuLabel}>{profile.name}</Text>
                  </Pressable>
                ))}
              <View style={styles.divider} />
            </>
          )}

          {/* Menu items */}
          <MenuRow
            icon="person-outline"
            label="Profielen beheren"
            onPress={() => navigate("/manage-profiles")}
          />
          <MenuRow
            icon="settings-outline"
            label="Instellingen"
            onPress={() => navigate("/settings")}
          />
          <View style={styles.divider} />
          <MenuRow
            icon="log-out-outline"
            label="Uitloggen"
            onPress={() => navigate("/auth")}
            danger
          />
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuRow,
        pressed && styles.menuRowPressed,
      ]}
      onPress={onPress}
    >
      <Ionicons
        name={icon as any}
        size={18}
        color={danger ? COLORS.error : COLORS.textSecondary}
      />
      <Text style={[styles.menuLabel, danger && { color: COLORS.error }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  card: {
    position: "absolute",
    right: 12,
    width: 240,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 20,
  },
  currentProfile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bigAvatar: {
    width: 42,
    height: 42,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
  },
  bigAvatarEmoji: { fontSize: 22 },
  profileInfo: { gap: 3 },
  profileName: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  kidsTag: {
    color: COLORS.new,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  sectionLabel: {
    color: COLORS.textFaint,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
    textTransform: "uppercase",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 6,
    marginHorizontal: 8,
  },
  smallAvatar: {
    width: 28,
    height: 28,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
  },
  smallAvatarEmoji: { fontSize: 15 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  menuRowPressed: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  menuLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
