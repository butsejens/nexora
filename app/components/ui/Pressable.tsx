/**
 * CineLog — press and hover feedback.
 *
 * `Pressable` re-exports React Native's Pressable with the hover state that
 * react-native-web adds but React Native's own types don't describe, so desktop
 * hover styles stay type-safe.
 *
 * `TouchableScale` scales down on touch and lifts slightly on hover, giving the
 * same card the right affordance on both mobile and desktop.
 */

import React, { useCallback } from "react";
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ANIM } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";

/** Interaction state react-native-web passes to `style` and `children`. */
export interface InteractionState {
  pressed: boolean;
  hovered?: boolean;
  focused?: boolean;
}

export interface PressableProps extends Omit<RNPressableProps, "style"> {
  style?:
    StyleProp<ViewStyle> | ((state: InteractionState) => StyleProp<ViewStyle>);
}

export const Pressable =
  RNPressable as unknown as React.ComponentType<PressableProps>;

export interface TouchableScaleProps extends Omit<RNPressableProps, "style"> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
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
    <RNPressable
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
    </RNPressable>
  );
}
