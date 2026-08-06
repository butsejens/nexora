/**
 * StartupUpdateBar
 *
 * Auto-runs on every app launch and checks Expo OTA only.
 * If a JS/UI update is available it downloads and reloads automatically —
 * no APK install required. Optional native APK bumps are never forced here;
 * required native updates stay available from Settings → Update.
 */
import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  checkOtaUpdateAvailable,
  prepareOtaUpdate,
  reloadToLatestUpdate,
} from "@/services/update-service";
import { getUpdateDiagnostics } from "@/services/update-diagnostics";
import { logStartupEvent } from "@/services/startup-orchestrator";

type BarState =
  | "hidden"
  | "checking"
  | "downloading"
  | "restarting"
  | "no-update";

const AUTO_HIDE_MS = 2800;

const STATE_META: Record<
  Exclude<BarState, "hidden">,
  { label: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  checking: { label: "Controleren op updates...", color: "#3B82F6", icon: "magnify" },
  downloading: { label: "Snelle update wordt gedownload...", color: "#F59E0B", icon: "download" },
  restarting: {
    label: "Update klaar — app wordt herstart...",
    color: "#F59E0B",
    icon: "restart",
  },
  "no-update": { label: "App is up-to-date", color: "#10B981", icon: "check-circle-outline" },
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
    if (unsupported) {
      logStartupEvent("boot", "info", "startup-ota-skipped", {
        reason: diagnostics.isDevelopment
          ? "development"
          : Platform.OS === "web"
            ? "web"
            : "updates-disabled",
      });
      return;
    }

    const scheduleHide = (next: Exclude<BarState, "hidden">) => {
      if (!aliveRef.current) return;
      setState(next);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        if (aliveRef.current) setState("hidden");
      }, AUTO_HIDE_MS);
    };

    const run = async () => {
      // Let the first frame paint before the update check.
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (!aliveRef.current) return;
      if (AppState.currentState !== "active") return;

      setState("checking");
      try {
        const ota = await checkOtaUpdateAvailable();
        if (!aliveRef.current) return;

        logStartupEvent("boot", "info", "startup-ota-check", {
          enabled: ota.enabled,
          available: ota.available,
          errorMessage: ota.errorMessage,
        });

        if (!ota.enabled) {
          scheduleHide("no-update");
          return;
        }

        if (ota.errorMessage) {
          setState("hidden");
          return;
        }

        if (!ota.available) {
          scheduleHide("no-update");
          return;
        }

        setState("downloading");
        await prepareOtaUpdate();
        if (!aliveRef.current) return;

        setState("restarting");
        setTimeout(() => {
          reloadToLatestUpdate().catch((error) => {
            if (__DEV__) console.warn("[startup-update-bar] reload failed", error);
            if (aliveRef.current) setState("hidden");
          });
        }, 700);
      } catch (error) {
        logStartupEvent("boot", "warn", "startup-ota-failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
        if (__DEV__) console.warn("[startup-update-bar] check threw", error);
        setState("hidden");
      }
    };

    void run();
  }, []);

  if (state === "hidden") return null;

  const meta = STATE_META[state];
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8, backgroundColor: meta.color }]}>
      <MaterialCommunityIcons name={meta.icon} size={16} color="#04070c" />
      <Text style={styles.text} numberOfLines={1}>
        {meta.label}
      </Text>
    </View>
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
