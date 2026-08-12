/**
 * CineLog — runtime theme.
 *
 * Resolves the viewer's Appearance setting (dark / light / system) into a
 * palette, and exposes `makeStyles` so a component's stylesheet is rebuilt only
 * when the scheme actually changes.
 *
 * Usage:
 *
 *   const useStyles = makeStyles((c) => ({ card: { backgroundColor: c.surface } }));
 *
 *   function Card() {
 *     const styles = useStyles();
 *     const { colors } = useTheme();
 *     return <View style={styles.card}><Icon color={colors.accent} /></View>;
 *   }
 */

import React, { createContext, useContext, useMemo } from "react";
import {
  StyleSheet,
  useColorScheme,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import {
  BACKDROP_SCRIM,
  DARK_PALETTE,
  LIGHT_PALETTE,
  SHADOWS,
  type Palette,
  type ShadowSet,
} from "@/constants/theme";
import { useSettings } from "@/store/settings-store";

export type ColorScheme = "dark" | "light";

export interface Theme {
  colors: Palette;
  scheme: ColorScheme;
  isDark: boolean;
  /** Elevation presets matched to the active scheme. */
  shadows: ShadowSet;
  /** Gradient stops that fade artwork into the page background. */
  backdropScrim: readonly string[];
}

const DARK_THEME: Theme = {
  colors: DARK_PALETTE,
  scheme: "dark",
  isDark: true,
  shadows: SHADOWS.dark,
  backdropScrim: BACKDROP_SCRIM.dark,
};

const LIGHT_THEME: Theme = {
  colors: LIGHT_PALETTE,
  scheme: "light",
  isDark: false,
  shadows: SHADOWS.light,
  backdropScrim: BACKDROP_SCRIM.light,
};

// CineLog is dark-first, so the default stands in until the provider mounts.
const ThemeContext = createContext<Theme>(DARK_THEME);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSettings((state) => state.theme);
  const systemScheme = useColorScheme();

  const theme = useMemo(() => {
    const scheme: ColorScheme =
      preference === "system"
        ? systemScheme === "light"
          ? "light"
          : "dark"
        : preference;
    return scheme === "light" ? LIGHT_THEME : DARK_THEME;
  }, [preference, systemScheme]);

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * Build a themed stylesheet. The factory receives the active palette and the
 * theme, and the result is memoized per scheme rather than per render.
 */
export function makeStyles<T extends NamedStyles>(
  factory: (colors: Palette, theme: Theme) => T,
) {
  const cache = new Map<ColorScheme, T>();

  return function useStyles(): T {
    const theme = useTheme();
    return useMemo(() => {
      const cached = cache.get(theme.scheme);
      if (cached) return cached;
      const created = StyleSheet.create(factory(theme.colors, theme)) as T;
      cache.set(theme.scheme, created);
      return created;
    }, [theme]);
  };
}
