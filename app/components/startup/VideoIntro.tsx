import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import Animated, {
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const introSource = require("@/assets/videos/intro.mp4");

type VideoIntroProps = {
  onFinish: () => void;
};

export function VideoIntro({ onFinish }: VideoIntroProps) {
  const videoRef = useRef<Video>(null);
  const doneRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const [showSkip, setShowSkip] = useState(false);
  const opacity = useSharedValue(1);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isWeb = Platform.OS === "web";

  // Keep the ref in sync without changing `finish` identity on every parent render
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    opacity.value = withTiming(0, { duration: 320 });
    setTimeout(() => onFinishRef.current(), 340);
  }, [opacity]); // stable — does not change when parent re-renders

  const handlePlaybackStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      if (status.positionMillis > 2000 && !showSkip) {
        setShowSkip(true);
      }
      if (status.didJustFinish) {
        finish();
      }
    },
    [finish, showSkip],
  );

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    const skipTimer = setTimeout(
      () => {
        setShowSkip(true);
      },
      isWeb ? 300 : 800,
    );

    const finishTimer = setTimeout(
      () => {
        finish();
      },
      isWeb ? 800 : 3500,
    );

    return () => {
      clearTimeout(skipTimer);
      clearTimeout(finishTimer);
    };
  }, [finish, isWeb]);

  return (
    <Animated.View style={[styles.container, fadeStyle]}>
      <Video
        ref={videoRef}
        source={introSource}
        style={{ width: screenW, height: screenH }}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        isMuted={isWeb}
        isLooping={false}
        onPlaybackStatusUpdate={handlePlaybackStatus}
        onError={() => finish()}
      />
      {showSkip && (
        <Animated.View entering={FadeOut} style={styles.skipWrap}>
          <Pressable onPress={finish} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#06050A",
    zIndex: 13000,
    justifyContent: "center",
    alignItems: "center",
  },
  skipWrap: {
    position: "absolute",
    bottom: 48,
    right: 24,
  },
  skipButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: "rgba(192,38,211,0.18)",
    borderWidth: 1,
    borderColor: "rgba(192,38,211,0.35)",
  },
  skipText: {
    color: "#F8FAFC",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.4,
  },
});
