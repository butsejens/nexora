/**
 * StartupUpdateBar
 *
 * Auto-runs on every app launch (no user action needed) and shows a slim
 * status bar reporting the OTA check result, then auto-hides. If a JS-only
 * (OTA) update is found it downloads and applies it automatically — no new
 * APK required. Native-only updates are surfaced as a tap-to-open banner
 * since installing an APK always needs explicit user consent on Android.
 */
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Constants from "expo-constants";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  checkForAppUpdates,
  prepareOtaUpdate,
  reloadToLatestUpdate,
} from "@/services/update-service";
import { getUpdateDiagnostics } from "@/services/update-diagnostics";

type BarState =
  | "hidden"
  | "checking"
  | "downloading"
  | "restarting"
  | "no-update"
  | "apk-available"
  | "error";

const AUTO_HIDE_MS = 3200;

const STATE_META: Record<
  Exclude<BarState, "hidden">,
  { label: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  checking: { label: "Controleren op updates...", color: "#3B82F6", icon: "magnify" },
  downloading: { label: "Update wordt gedownload...", color: "#F59E0B", icon: "download" },
  restarting: { label: "Update gevonden — app wordt herstart...", color: "#F59E0B", icon: "restart" },
  "no-update": { label: "App is up-to-date", color: "#10B981", icon: "check-circle-outline" },
  "apk-available": {
    label: "Nieuwe versie beschikbaar — tik om te downloaden",
    color: "#E50914",
    icon: "arrow-down-circle-outline",
  },
  error: { label: "Kon niet controleren op updates", color: "#EF4444", icon: "alert-circle-outline" },
};

export function StartupUpdateBar() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<BarState>("hidden");
  const ranRef = useRef(false);
  const aliveRef = useRef(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const diagnostics = getUpdateDiagnostics();
    const unsupported =
      diagnostics.isDevelopment || Platform.OS === "web" || !diagnostics.isEnabled;
    if (unsupported) return;

    const scheduleHide = (next: Exclude<BarState, "hidden">) => {
      if (!aliveRef.current) return;
      setState(next);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        if (aliveRef.current) setState("hidden");
      }, AUTO_HIDE_MS);
    };

    const run = async () => {
      setState("checking");
      try {
        const result = await checkForAppUpdates({
          currentVersion: String(Constants.expoConfig?.version || ""),
        });
        if (!aliveRef.current) return;

        if (result.kind === "ota") {
          setState("downloading");
          await prepareOtaUpdate();
          if (!aliveRef.current) return;
          setState("restarting");
          setTimeout(() => {
            reloadToLatestUpdate().catch(() => scheduleHide("error"));
          }, 900);
          return;
        }

        if (result.kind === "apk") {
          scheduleHide("apk-available");
          return;
        }

        if (result.kind === "error" || result.kind === "apk-unavailable") {
          scheduleHide("error");
          return;
        }

        scheduleHide("no-update");
      } catch {
        scheduleHide("error");
      }
    };

    void run();
  }, []);

  if (state === "hidden") return null;

  const meta = STATE_META[state];
  const isTappable = state === "apk-available";

  const bar = (
    <View style={[styles.bar, { paddingTop: insets.top + 8, backgroundColor: meta.color }]}>
      <MaterialCommunityIcons name={meta.icon} size={16} color="#04070c" />
      <Text style={styles.text} numberOfLines={1}>
        {meta.label}
      </Text>
    </View>
  );

  if (!isTappable) return bar;

  return (
    <Pressable
      onPress={() => {
        setState("hidden");
        router.push("/more?openUpdate=1");
      }}
    >
      {bar}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  text: {
    color: "#04070c",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    flex: 1,
  },
});
