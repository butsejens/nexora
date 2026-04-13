import React, { useRef } from "react";
import { Animated, Pressable, PressableProps } from "react-native";

type ScalePressProps = PressableProps & {
  scaleTo?: number;
  children: React.ReactNode;
};

export function ScalePress({ scaleTo = 0.96, style, children, onPressIn, onPressOut, ...rest }: ScalePressProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) => {
    Animated.timing(scale, {
      toValue,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style as any]}>
      <Pressable
        {...rest}
        onPressIn={(event) => {
          animateTo(scaleTo);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          animateTo(1);
          onPressOut?.(event);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
