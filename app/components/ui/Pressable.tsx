/**
 * CineLog — press and hover feedback.
 *
 * Scales down on touch and (on pointer devices) lifts slightly on hover, giving
 * the same card the right affordance on both mobile and desktop.
 */

import React, { useCallback } from "react";
import { Pressable, type PressableProps, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ANIM } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";

export interface TouchableScaleProps extends Omit<PressableProps, "style"> {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Scale applied while hovering on pointer devices. */
  hoverScale?: number;
  /** Disable the hover lift (e.g. for full-width rows). */
  enableHover?: boolean;
}

export function TouchableScale({
  children,
  style,
  hoverScale = ANIM.hoverScale,
  enableHover = true,
  ...props
}: TouchableScaleProps) {
  const { supportsHover } = useResponsive();
  const scale = useSharedValue(1);

  const animate = useCallback(
    (value: number) => {
      scale.value = withTiming(value, { duration: ANIM.fast });
    },
    [scale],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        animate(ANIM.pressScale);
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animate(supportsHover && enableHover ? hoverScale : 1);
        props.onPressOut?.(event);
      }}
      onHoverIn={(event) => {
        if (supportsHover && enableHover) animate(hoverScale);
        props.onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        animate(1);
        props.onHoverOut?.(event);
      }}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
