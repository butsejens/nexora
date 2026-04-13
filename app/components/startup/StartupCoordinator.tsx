import Constants from "expo-constants";
import { useRootNavigationState, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useNexora } from "@/context/NexoraContext";
import { queryClient } from "@/lib/query-client";
import { runStartupBootstrap } from "@/services/startup-bootstrap";
import { useUiStore } from "@/store/uiStore";
import {
  canFinishStartupGate,
  getIntroTimings,
  loadStartupLaunchContext,
  persistStartupLaunchContext,
  type IntroVariant,
  type StartupLaunchContext,
} from "@/services/startup-flow";
import { logStartupEvent } from "@/services/startup-orchestrator";
import { useOnboardingStore } from "@/store/onboarding-store";
import { VideoIntro } from "@/components/startup/VideoIntro";

type BootstrapState = "idle" | "running" | "failed";

const FALLBACK_RETRY_DELAY_MS = 900;

export function StartupCoordinator() {
  const router = useRouter();
  const navState = useRootNavigationState();
  const { authReady, isAuthenticated } = useNexora();
  const hasCompletedOnboarding = useOnboardingStore(
    (state) => state.hasCompletedOnboarding,
  );
  const onboardingHydrated = useOnboardingStore((state) => state.hasHydrated);

  const [visible, setVisible] = useState(true);
  const [introVariant, setIntroVariant] = useState<IntroVariant>("standard");
  const [skipRequested] = useState(false);
  const [introCompleted, setIntroCompleted] = useState(false);
  const [criticalBootstrapDone, setCriticalBootstrapDone] = useState(false);
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>("idle");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [clockMs, setClockMs] = useState(Date.now());

  const contextRef = useRef<StartupLaunchContext | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const routeAppliedRef = useRef(false);

  const bootReadyForExit = useMemo(
    () =>
      canFinishStartupGate({
        variant: introVariant,
        startedAtMs: startedAtRef.current,
        nowMs: clockMs,
        introCompleted,
        criticalBootstrapDone,
        authReady,
        skipRequested,
      }),
    [
      authReady,
      clockMs,
      criticalBootstrapDone,
      introCompleted,
      introVariant,
      skipRequested,
    ],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    const interval = setInterval(() => {
      setClockMs(Date.now());
    }, 120);

    return () => clearInterval(interval);
  }, [visible]);

  useEffect(() => {
    let cancelled = false;
    let skipTimer: ReturnType<typeof setTimeout> | null = null;

    const setup = async () => {
      setBootstrapState("running");
      setBootstrapError(null);

      try {
        const version = String(Constants.expoConfig?.version || "0.0.0");
        const context = await loadStartupLaunchContext(version);
        if (cancelled) return;

        contextRef.current = context;
        setIntroVariant(context.variant);

        logStartupEvent("boot", "info", "startup-intro-variant", {
          variant: context.variant,
          reason: context.reason,
          currentVersion: context.currentVersion,
          previousVersion: context.previousVersion,
        });

        const timing = getIntroTimings(context.variant);
        if (context.variant === "extended") {
          skipTimer = setTimeout(() => {
            if (!cancelled) setClockMs(Date.now());
          }, timing.skipAfterMs);
        }
      } catch (error) {
        if (!cancelled) {
          setIntroVariant("standard");
          logStartupEvent("boot", "warn", "startup-context-failed", {
            error: String((error as any)?.message || error || "unknown"),
          });
        }
      }
    };

    void setup();

    return () => {
      cancelled = true;
      if (skipTimer) {
        clearTimeout(skipTimer);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const runBootstrap = async () => {
      setBootstrapState("running");
      setBootstrapError(null);
      startedAtRef.current = Date.now();
      routeAppliedRef.current = false;
      setCriticalBootstrapDone(false);
      setClockMs(Date.now());

      try {
        const bootstrap = runStartupBootstrap(queryClient);
        await bootstrap.criticalDone;
        if (cancelled) return;
        setCriticalBootstrapDone(true);

        void bootstrap.fullDone.catch(() => undefined);
        setBootstrapState("idle");
      } catch (error) {
        if (cancelled) return;
        setBootstrapState("failed");
        setBootstrapError(
          String((error as any)?.message || "Bootstrap failed"),
        );
        logStartupEvent("boot", "error", "startup-bootstrap-failed", {
          error: String((error as any)?.message || error || "unknown"),
        });
      }
    };

    void runBootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timings = getIntroTimings(introVariant);
    const watchdog = setTimeout(() => {
      if (!criticalBootstrapDone) {
        setBootstrapState("failed");
        setBootstrapError(
          "Startup duurt langer dan verwacht. Probeer opnieuw om veilig verder te gaan.",
        );
      }
    }, timings.maxDurationMs + 400);

    return () => clearTimeout(watchdog);
  }, [criticalBootstrapDone, introVariant]);

  useEffect(() => {
    if (
      !visible ||
      routeAppliedRef.current ||
      !navState?.key ||
      !bootReadyForExit ||
      !introCompleted ||
      bootstrapState === "failed"
    ) {
      return;
    }
    if (isAuthenticated && !onboardingHydrated) {
      return;
    }

    routeAppliedRef.current = true;
    setVisible(false);

    const context = contextRef.current;
    if (context) {
      void persistStartupLaunchContext(context).catch(() => undefined);
    }

    // Always go to auth after intro — the auth screen handles biometric
    // quick-unlock for returning users and shows registration for new ones.
    const target = "/auth" as const;
    router.replace(target);

    logStartupEvent("boot", "info", "startup-transition-finished", {
      target,
      elapsedMs: Date.now() - startedAtRef.current,
      introVariant,
      authReady,
      isAuthenticated,
      hasCompletedOnboarding,
      skipRequested,
    });
  }, [
    authReady,
    bootReadyForExit,
    bootstrapState,
    hasCompletedOnboarding,
    introCompleted,
    introVariant,
    isAuthenticated,
    onboardingHydrated,
    router,
    skipRequested,
    navState?.key,
    visible,
  ]);

  useEffect(() => {
    if (!onboardingHydrated) return;
    setClockMs(Date.now());
  }, [onboardingHydrated]);

  const handleRetry = () => {
    setBootstrapState("running");
    setBootstrapError(null);
    setTimeout(() => {
      setCriticalBootstrapDone(false);
      startedAtRef.current = Date.now();
      setClockMs(Date.now());
      if (introVariant === "extended") {
        const timing = getIntroTimings(introVariant);
        setTimeout(() => {
          setClockMs(Date.now());
        }, timing.skipAfterMs);
      }
      const bootstrap = runStartupBootstrap(queryClient);
      void bootstrap.criticalDone
        .then(() => {
          setCriticalBootstrapDone(true);
          setBootstrapState("idle");
          void bootstrap.fullDone.catch(() => undefined);
        })
        .catch((error) => {
          setBootstrapState("failed");
          setBootstrapError(
            String((error as any)?.message || "Bootstrap failed"),
          );
        });
    }, FALLBACK_RETRY_DELAY_MS);
  };

  if (!visible) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      {!introCompleted ? (
        <VideoIntro
          onFinish={() => {
            setIntroCompleted(true);
            useUiStore.getState().setIntroPlaying(false);
          }}
        />
      ) : null}

      {bootstrapState === "failed" ? (
        <View style={styles.fallbackCard}>
          <Text style={styles.fallbackTitle}>Startup interrupted</Text>
          <Text style={styles.fallbackBody}>
            {bootstrapError ||
              "We could not finish startup in time. Retry once to continue safely."}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetry}
            activeOpacity={0.88}
          >
            <Text style={styles.retryLabel}>Retry startup</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackCard: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 30,
    backgroundColor: "rgba(11,11,16,0.94)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 16,
    gap: 8,
  },
  fallbackTitle: {
    color: "#F9FAFC",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  fallbackBody: {
    color: "#AEB3BC",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  retryButton: {
    marginTop: 6,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#D41320",
    alignItems: "center",
    justifyContent: "center",
  },
  retryLabel: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
});
