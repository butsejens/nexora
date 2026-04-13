import React, { useCallback, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ResizeMode, Video } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "@/constants/colors";

type NexoraIntroVideoProps = {
  onDone: () => void;
};

export function NexoraIntroVideo({ onDone }: NexoraIntroVideoProps) {
  const finishedRef = useRef(false);

  const complete = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onDone();
  }, [onDone]);

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#050507", "#0C0D12", "#07080D"]} style={StyleSheet.absoluteFill} />

      <View style={styles.videoCard}>
        <Video
          source={require("@/assets/videos/intro-616.mp4")}
          style={styles.video}
          shouldPlay
          isLooping={false}
          resizeMode={ResizeMode.COVER}
          onPlaybackStatusUpdate={(status) => {
            if (!status.isLoaded) return;
            if (status.didJustFinish) {
              complete();
            }
          }}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.52)"]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <View style={styles.bottomCtaWrap}>
        <Pressable style={styles.skipBtn} onPress={complete}>
          <Text style={styles.skipText}>Overslaan</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  videoCard: {
    width: "100%",
    maxWidth: 560,
    aspectRatio: 16 / 9,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#000",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.42,
    shadowRadius: 24,
    elevation: 22,
  },
  video: {
    width: "100%",
    height: "100%",
  },
  bottomCtaWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 34,
    alignItems: "center",
  },
  skipBtn: {
    minHeight: 44,
    minWidth: 138,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: "rgba(9,9,14,0.72)",
    paddingHorizontal: 20,
  },
  skipText: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
});
