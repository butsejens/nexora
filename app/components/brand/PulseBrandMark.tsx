import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

type PulseBrandMarkProps = {
  size?: number;
  showWordmark?: boolean;
  subtitle?: string | null;
  wordmarkText?: string;
};

function PulseBrandMarkComponent({ size = 72, showWordmark = true, subtitle = null, wordmarkText = "NEXORA" }: PulseBrandMarkProps) {
  const outerSize = size;
  const innerSize = Math.round(size * 0.68);
  const letterSize = Math.round(size * 0.42);

  return (
    <View style={styles.container}>
      {/* Outer glow ring */}
      <View
        style={[
          styles.outerRing,
          { width: outerSize, height: outerSize, borderRadius: outerSize / 2 },
        ]}
      >
        {/* Inner accent circle */}
        <View
          style={[
            styles.innerCircle,
            { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
          ]}
        >
          <Text style={[styles.letterMark, { fontSize: letterSize, lineHeight: letterSize * 1.1 }]}>N</Text>
        </View>
      </View>

      {showWordmark ? (
        <View style={styles.wordmarkWrap}>
          <Text style={styles.wordmark}>{wordmarkText}</Text>
          {subtitle ? <Text style={styles.wordmarkSub}>{subtitle}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export const PulseBrandMark = memo(PulseBrandMarkComponent);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 16,
  },
  outerRing: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.30)",
    backgroundColor: "rgba(229,9,20,0.06)",
    shadowColor: "#E50914",
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  innerCircle: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E50914",
    shadowColor: "#E50914",
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
  },
  letterMark: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: -1,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  wordmarkWrap: {
    alignItems: "center",
    gap: 6,
  },
  wordmark: {
    color: "#F7F7FB",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 8,
  },
  wordmarkSub: {
    color: "rgba(247,247,251,0.60)",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});