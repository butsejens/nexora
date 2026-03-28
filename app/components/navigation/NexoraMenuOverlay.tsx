import React, { useMemo, useRef, useEffect } from "react";
import { Animated, Modal, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useRootNavigationState } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useUiStore } from "@/store/uiStore";
import { ScalePress } from "@/components/ui/ScalePress";

type MenuItem = {
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const MENU_ITEMS: MenuItem[] = [
  { label: "Home", route: "/(tabs)/home", icon: "home-outline" },
  { label: "Sport", route: "/sport", icon: "football-outline" },
  { label: "Films & Series", route: "/films-series", icon: "film-outline" },
  { label: "IPTV", route: "/iptv", icon: "tv-outline" },
  { label: "Library", route: "/watchlist", icon: "library-outline" },
  { label: "Settings", route: "/settings", icon: "settings-outline" },
];

export function NexoraMenuOverlay() {
  const insets = useSafeAreaInsets();
  const navState = useRootNavigationState();
  const isOpen = useUiStore((state) => state.nexoraMenuOpen);
  const closeMenu = useUiStore((state) => state.closeNexoraMenu);

  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: isOpen ? 1 : 0,
        duration: isOpen ? 220 : 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: isOpen ? 0 : 18,
        duration: isOpen ? 240 : 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, isOpen, translateY]);

  const navSignature = useMemo(() => {
    const routes = Array.isArray(navState?.routes) ? navState.routes : [];
    const names = routes.map((route: any) => String(route?.name || "")).join("|");
    const index = typeof navState?.index === "number" ? navState.index : -1;
    return `${index}:${names}`;
  }, [navState]);

  useEffect(() => {
    // Ensure stale overlay state never survives navigation transitions.
    closeMenu();
  }, [navSignature, closeMenu]);

  const activeRoute = "";

  return (
    <Modal transparent visible={isOpen} animationType="none" onRequestClose={closeMenu}>
      <Animated.View style={[styles.overlay, { opacity: fade }]}>
        <ScalePress style={styles.backdropHit} onPress={closeMenu}>
          <View />
        </ScalePress>

        <Animated.View style={[styles.panel, { paddingTop: insets.top + 14, transform: [{ translateY }] }]}> 
          <View style={styles.headerRow}>
            <Text style={styles.brand}>NEXORA MENU</Text>
            <ScalePress onPress={closeMenu} style={styles.closeWrap}>
              <View style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={COLORS.text} />
              </View>
            </ScalePress>
          </View>

          <View style={styles.itemsWrap}>
            {MENU_ITEMS.map((item) => {
              const isActive = activeRoute === item.route || activeRoute.startsWith(`${item.route}/`);
              return (
                <ScalePress
                  key={item.route}
                  style={styles.itemPressWrap}
                  onPress={() => {
                    closeMenu();
                    router.push(item.route as any);
                  }}
                >
                  <View style={[styles.item, isActive ? styles.itemActive : null]}>
                    <Ionicons
                      name={item.icon}
                      size={20}
                      color={isActive ? COLORS.accent : COLORS.textSecondary}
                      style={styles.itemIcon}
                    />
                    <Text style={[styles.itemLabel, isActive ? styles.itemLabelActive : null]}>{item.label}</Text>
                    {isActive ? <View style={styles.activeDot} /> : null}
                  </View>
                </ScalePress>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-start",
  },
  backdropHit: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 26,
  },
  brand: {
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 2.3,
    color: COLORS.text,
    fontSize: 20,
  },
  closeWrap: {
    borderRadius: 999,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  itemsWrap: {
    gap: 10,
  },
  itemPressWrap: {
    borderRadius: 14,
  },
  item: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 16,
  },
  itemActive: {
    borderColor: COLORS.accent,
    backgroundColor: "rgba(229,9,20,0.12)",
  },
  itemIcon: {
    marginRight: 12,
  },
  itemLabel: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    letterSpacing: 0.2,
  },
  itemLabelActive: {
    color: COLORS.accent,
  },
  activeDot: {
    marginLeft: "auto",
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },
});
