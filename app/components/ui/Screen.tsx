/**
 * CineLog — page scaffold.
 *
 * Applies the app background, safe-area padding and a max content width so wide
 * monitors don't stretch rails into unreadable lines.
 */

import React from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, LAYOUT, SPACING } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";

export interface ScreenProps {
  children: React.ReactNode;
  /** Wrap children in a vertical ScrollView (default) or render them directly. */
  scroll?: boolean;
  /** Extra bottom padding so content clears the mobile bottom navigation. */
  reserveBottomNav?: boolean;
  contentStyle?: ViewStyle;
  /** Ref-free scroll props used by pages with infinite scroll. */
  onEndReached?: () => void;
  header?: React.ReactNode;
}

/** How close to the bottom counts as "reached" for infinite scroll. */
const END_THRESHOLD = 600;

export function Screen({
  children,
  scroll = true,
  reserveBottomNav = false,
  contentStyle,
  onEndReached,
  header,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { isMobile } = useResponsive();

  const bottomPadding =
    (reserveBottomNav && isMobile
      ? LAYOUT.bottomNavHeight + insets.bottom
      : 0) + SPACING.xxxl;

  const inner = (
    <View
      style={[
        styles.centered,
        { maxWidth: LAYOUT.maxContentWidth },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View style={styles.root}>
        {header}
        <View style={[styles.flexCenter, { paddingBottom: bottomPadding }]}>
          {inner}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {header}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={128}
        onScroll={
          onEndReached
            ? (event) => {
                const { layoutMeasurement, contentOffset, contentSize } =
                  event.nativeEvent;
                const distanceFromEnd =
                  contentSize.height -
                  contentOffset.y -
                  layoutMeasurement.height;
                if (distanceFromEnd < END_THRESHOLD) onEndReached();
              }
            : undefined
        }
      >
        {inner}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: "center",
  },
  centered: {
    width: "100%",
  },
  flexCenter: {
    flex: 1,
    alignItems: "center",
  },
});
