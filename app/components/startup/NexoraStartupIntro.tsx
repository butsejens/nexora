import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import type { IntroVariant } from "@/services/startup-flow";

type LegacyProps = {
  variant: IntroVariant;
  shouldExpedite: boolean;
  showSkip: boolean;
  onSkip: () => void;
  onNaturalComplete: () => void;
};

type NexoraIntroProps = {
  variant: IntroVariant;
  onFinish: () => void;
};

type ParticleConfig = {
  id: string;
  x: number;
  y: number;
  size: number;
  delayMs: number;
  driftX: number;
  driftY: number;
  alpha: number;
};

type IntroTiming = {
  totalMs: number;
  ambientInMs: number;
  energyDelayMs: number;
  energyInMs: number;
  nDelayMs: number;
  nMs: number;
  wordDelayMs: number;
  wordMs: number;
  holdDelayMs: number;
  holdMs: number;
  exitMs: number;
};

const RED = "#E10612";
const WHITE = "#F8FAFC";
const BLACK = "#040506";

function getTiming(variant: IntroVariant): IntroTiming {
  if (variant === "extended") {
    return {
      totalMs: 7400,
      ambientInMs: 820,
      energyDelayMs: 550,
      energyInMs: 1500,
      nDelayMs: 1700,
      nMs: 1050,
      wordDelayMs: 2600,
      wordMs: 920,
      holdDelayMs: 3800,
      holdMs: 2200,
      exitMs: 560,
    };
  }

  return {
    totalMs: 5000,
    ambientInMs: 620,
    energyDelayMs: 300,
    energyInMs: 1000,
    nDelayMs: 1050,
    nMs: 760,
    wordDelayMs: 1700,
    wordMs: 620,
    holdDelayMs: 2500,
    holdMs: 1400,
    exitMs: 420,
  };
}

function buildParticles(count: number): ParticleConfig[] {
  return Array.from({ length: count }, (_, i) => {
    const x = ((i * 37 + 11) % 96) + 2;
    const y = ((i * 23 + 17) % 76) + 10;
    const size = 1.8 + (i % 4) * 1.1;
    const delayMs = 180 + i * 36;
    const driftX = ((i % 2 ? -1 : 1) * (6 + (i % 6) * 2.6));
    const driftY = ((i % 3 ? -1 : 1) * (8 + (i % 5) * 2.2));
    const alpha = 0.28 + (i % 5) * 0.09;
    return {
      id: `p-${i}`,
      x,
      y,
      size,
      delayMs,
      driftX,
      driftY,
      alpha,
    };
  });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] || 0;
    const b = bytes[i + 1] || 0;
    const c = bytes[i + 2] || 0;

    const triplet = (a << 16) | (b << 8) | c;

    out += alphabet[(triplet >> 18) & 63];
    out += alphabet[(triplet >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triplet >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? alphabet[triplet & 63] : "=";
  }

  return out;
}

function renderToneWavBase64(freq: number, durationMs: number, gain: number): string {
  const sampleRate = 22050;
  const sampleCount = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const p = i / sampleCount;
    const attack = clamp01(p / 0.12);
    const release = clamp01((1 - p) / 0.3);
    const env = Math.min(attack, release);
    const shimmer = Math.sin(2 * Math.PI * (freq * 1.75) * t) * 0.16;
    const sample = (Math.sin(2 * Math.PI * freq * t) + shimmer) * gain * env;
    const intSample = Math.max(-1, Math.min(1, sample)) * 32767;
    view.setInt16(44 + i * 2, intSample, true);
  }

  return encodeBase64(bytes);
}

async function ensureCueFile(name: string, freq: number, durationMs: number, gain: number): Promise<string | null> {
  try {
    const root = FileSystem.cacheDirectory;
    if (!root) return null;
    const uri = `${root}${name}.wav`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      const wavBase64 = renderToneWavBase64(freq, durationMs, gain);
      await FileSystem.writeAsStringAsync(uri, wavBase64, { encoding: FileSystem.EncodingType.Base64 });
    }
    return uri;
  } catch {
    return null;
  }
}

async function playCue(uri: string | null, volume: number): Promise<void> {
  if (!uri) return;
  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      {
        shouldPlay: true,
        volume,
        isLooping: false,
      }
    );
    setTimeout(() => {
      sound.unloadAsync().catch(() => undefined);
    }, 2200);
  } catch {
    // Audio is non-blocking by design.
  }
}

function Particle({ cfg, energy }: { cfg: ParticleConfig; energy: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const phase = clamp01((energy.value - cfg.delayMs / 2500) * 1.4);
    const opacity = phase * cfg.alpha;
    return {
      opacity,
      transform: [
        { translateX: (1 - phase) * cfg.driftX },
        { translateY: (1 - phase) * cfg.driftY },
        { scale: 0.5 + phase * 1.2 },
      ],
    };
  }, [cfg]);

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: `${cfg.x}%`,
          top: `${cfg.y}%`,
          width: cfg.size,
          height: cfg.size,
        },
        style,
      ]}
    />
  );
}

export function NexoraIntro({ variant, onFinish }: NexoraIntroProps) {
  const timing = getTiming(variant);
  const particleCount = variant === "extended" ? 30 : 18;

  const particles = useMemo(() => buildParticles(particleCount), [particleCount]);

  const [safeFallback, setSafeFallback] = useState(false);

  const ambient = useSharedValue(0);
  const energy = useSharedValue(0);
  const nReveal = useSharedValue(0);
  const wordReveal = useSharedValue(0);
  const lockup = useSharedValue(0);
  const exit = useSharedValue(1);

  const completedRef = useRef(false);

  const finishOnce = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    let mounted = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const run = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          playsInSilentModeIOS: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        const hit = await ensureCueFile("nexora-intro-hit", 82, 520, 0.34);
        const whoosh = await ensureCueFile("nexora-intro-whoosh", 186, 460, 0.2);
        const shimmer = await ensureCueFile("nexora-intro-shimmer", 740, 380, 0.16);

        timers.push(setTimeout(() => { void playCue(hit, 0.34); }, timing.nDelayMs - 180));
        timers.push(setTimeout(() => { void playCue(whoosh, 0.22); }, timing.wordDelayMs - 120));
        timers.push(setTimeout(() => { void playCue(shimmer, 0.18); }, timing.wordDelayMs + 220));
      } catch {
        if (mounted) {
          setSafeFallback(true);
        }
      }
    };

    ambient.value = withTiming(1, {
      duration: timing.ambientInMs,
      easing: Easing.out(Easing.quad),
    });

    energy.value = withDelay(
      timing.energyDelayMs,
      withTiming(1, { duration: timing.energyInMs, easing: Easing.out(Easing.cubic) })
    );

    nReveal.value = withDelay(
      timing.nDelayMs,
      withTiming(1, { duration: timing.nMs, easing: Easing.out(Easing.exp) })
    );

    wordReveal.value = withDelay(
      timing.wordDelayMs,
      withTiming(1, { duration: timing.wordMs, easing: Easing.out(Easing.exp) })
    );

    lockup.value = withSequence(
      withDelay(timing.wordDelayMs + 120, withTiming(1, { duration: 460 })),
      withDelay(timing.holdDelayMs, withTiming(1, { duration: timing.holdMs }))
    );

    exit.value = withDelay(
      timing.totalMs - timing.exitMs,
      withTiming(0, { duration: timing.exitMs }, (finished) => {
        if (finished) {
          runOnJS(finishOnce)();
        }
      })
    );

    void run();

    return () => {
      mounted = false;
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [ambient, energy, exit, finishOnce, lockup, nReveal, timing, wordReveal]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: exit.value }));
  const ambientStyle = useAnimatedStyle(() => ({
    opacity: ambient.value * 0.9,
    transform: [{ scale: 0.94 + ambient.value * 0.08 }],
  }));
  const coreGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.16 + energy.value * 0.55,
    transform: [{ scale: 0.78 + energy.value * 0.32 }],
  }));
  const nStyle = useAnimatedStyle(() => ({
    opacity: nReveal.value,
    transform: [
      { translateY: (1 - nReveal.value) * 16 },
      { translateX: (1 - nReveal.value) * -22 },
      { scale: 0.86 + nReveal.value * 0.16 },
    ],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordReveal.value,
    transform: [
      { translateX: (1 - wordReveal.value) * 22 },
      { translateY: (1 - wordReveal.value) * 8 },
    ],
  }));
  const sweepStyle = useAnimatedStyle(() => ({
    opacity: nReveal.value * 0.6,
    transform: [{ translateX: -120 + nReveal.value * 240 }],
  }));

  if (safeFallback) {
    return (
      <Animated.View entering={FadeIn.duration(260)} style={[styles.container, styles.fallback, containerStyle]}>
        <Text style={styles.fallbackN}>N</Text>
        <Text style={styles.fallbackWord}>EXORA</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <View style={styles.bg} />

      <Animated.View style={[styles.ambientHaloLarge, ambientStyle]} />
      <Animated.View style={[styles.ambientHaloCore, coreGlowStyle]} />

      <View pointerEvents="none" style={styles.particleLayer}>
        {particles.map((cfg) => (
          <Particle key={cfg.id} cfg={cfg} energy={energy} />
        ))}
      </View>

      <View style={styles.logoWrap}>
        <View style={styles.nWrap}>
          <Animated.Text style={[styles.nMark, nStyle]}>N</Animated.Text>
          <Animated.View style={[styles.lightSweep, sweepStyle]} />
        </View>

        <Animated.Text style={[styles.wordmark, wordStyle]}>EXORA</Animated.Text>
      </View>

      <Text style={styles.kicker}>RED ENERGY. PURE MOTION.</Text>
    </Animated.View>
  );
}

export function NexoraStartupIntro({
  variant,
  shouldExpedite,
  showSkip,
  onSkip,
  onNaturalComplete,
}: LegacyProps) {
  const earlyExitOpacity = useSharedValue(1);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!shouldExpedite || doneRef.current) return;
    earlyExitOpacity.value = withTiming(0, { duration: 260 }, (finished) => {
      if (finished && !doneRef.current) {
        doneRef.current = true;
        runOnJS(onNaturalComplete)();
      }
    });
  }, [earlyExitOpacity, onNaturalComplete, shouldExpedite]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: earlyExitOpacity.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]}>
      <NexoraIntro
        variant={variant}
        onFinish={() => {
          if (doneRef.current) return;
          doneRef.current = true;
          onNaturalComplete();
        }}
      />

      {showSkip ? (
        <View style={styles.skipWrap}>
          <Pressable onPress={onSkip} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip intro</Text>
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BLACK,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 12000,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BLACK,
  },
  ambientHaloLarge: {
    position: "absolute",
    width: 440,
    height: 440,
    borderRadius: 220,
    backgroundColor: "rgba(180,12,24,0.28)",
    shadowColor: RED,
    shadowOpacity: 0.55,
    shadowRadius: 44,
    shadowOffset: { width: 0, height: 0 },
  },
  ambientHaloCore: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(229,6,18,0.26)",
  },
  particleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255,42,54,0.9)",
  },
  logoWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  nWrap: {
    position: "relative",
    overflow: "hidden",
    marginRight: 8,
  },
  nMark: {
    color: RED,
    fontSize: 84,
    lineHeight: 92,
    fontFamily: "Inter_900Black",
    letterSpacing: -1.1,
    textShadowColor: "rgba(229,6,18,0.74)",
    textShadowRadius: 24,
  },
  lightSweep: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 36,
    backgroundColor: "rgba(255,255,255,0.25)",
    transform: [{ rotate: "18deg" }],
  },
  wordmark: {
    color: WHITE,
    fontSize: 58,
    lineHeight: 66,
    fontFamily: "Inter_700Bold",
    letterSpacing: 5.2,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 8,
  },
  kicker: {
    marginTop: 18,
    color: "rgba(255,255,255,0.66)",
    letterSpacing: 3.1,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  skipWrap: {
    position: "absolute",
    right: 24,
    bottom: 38,
  },
  skipButton: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(18,18,24,0.7)",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
  },
  fallback: {
    gap: 2,
  },
  fallbackN: {
    color: RED,
    fontSize: 70,
    lineHeight: 74,
    fontFamily: "Inter_900Black",
  },
  fallbackWord: {
    color: WHITE,
    fontSize: 42,
    lineHeight: 46,
    fontFamily: "Inter_700Bold",
    letterSpacing: 3.2,
  },
});
