import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

type PulseBrandMarkProps = {
  size?: number;
  showWordmark?: boolean;
  subtitle?: string | null;
};

function PulseBrandMarkComponent({ size = 72, showWordmark = true, subtitle = null }: PulseBrandMarkProps) {
  const ringSize = size;
  const coreSize = Math.round(size * 0.62);
  const dotSize = Math.max(10, Math.round(size * 0.16));

  return (
    <View style={styles.container}>
      <View style={[styles.markShell, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}>
        <View style={[styles.markRing, { borderRadius: ringSize / 2 }]} />
        <View style={[styles.markCore, { width: coreSize, height: coreSize, borderRadius: coreSize / 2 }]}>
          <View style={styles.pulseLine} />
          <View style={[styles.pulseDot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2 }]} />
        </View>
      </View>
      {showWordmark ? (
        <View style={styles.wordmarkWrap}>
          <Text style={styles.wordmark}>PULSE</Text>
          <Text style={styles.wordmarkSub}>{subtitle || "Premium streaming hub"}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const PulseBrandMark = memo(PulseBrandMarkComponent);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 14,
  },
  markShell: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  markRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  markCore: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5A5F",
    shadowColor: "#FF5A5F",
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  pulseLine: {
    width: "56%",
    height: 3,
    borderRadius: 999,
    backgroundColor: "#0E1117",
  },
  pulseDot: {
    position: "absolute",
    right: "20%",
    backgroundColor: "#0E1117",
  },
  wordmarkWrap: {
    alignItems: "center",
    gap: 4,
  },
  wordmark: {
    color: "#F7F7FB",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 7,
  },
  wordmarkSub: {
    color: "rgba(247,247,251,0.72)",
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
});