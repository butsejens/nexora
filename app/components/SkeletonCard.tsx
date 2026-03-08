import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { COLORS } from "../constants/colors";

interface Props {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: object;
}

export function Skeleton({ width = "100%", height = 20, borderRadius = 8, style }: Props) {
  const anim = useRef(new Animated.Value(0)).current;

   
  // anim is a stable ref — intentionally omitted from deps
   
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: COLORS.cardElevated,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonMatchCard() {
  return (
    <View style={styles.matchCard}>
      <Skeleton width={80} height={10} borderRadius={4} />
      <View style={styles.row}>
        <Skeleton width={60} height={14} borderRadius={4} />
        <Skeleton width={40} height={20} borderRadius={6} />
        <Skeleton width={60} height={14} borderRadius={4} />
      </View>
      <View style={styles.row}>
        <Skeleton width={60} height={28} borderRadius={6} />
        <Skeleton width={60} height={28} borderRadius={6} />
        <Skeleton width={60} height={28} borderRadius={6} />
      </View>
    </View>
  );
}

export function SkeletonContentCard() {
  return (
    <View style={styles.contentCard}>
      <Skeleton width={130} height={195} borderRadius={12} />
      <Skeleton width={100} height={12} borderRadius={4} style={{ marginTop: 8 }} />
    </View>
  );
}

export function SkeletonChannelCard() {
  return (
    <View style={styles.channelCard}>
      <Skeleton width="100%" height={120} borderRadius={12} />
      <Skeleton width="70%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
      <Skeleton width="50%" height={10} borderRadius={4} style={{ marginTop: 4 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  matchCard: {
    width: 260,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginRight: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  contentCard: {
    width: 130,
    marginRight: 12,
  },
  channelCard: {
    flex: 1,
    margin: 6,
  },
});
