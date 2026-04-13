/**
 * NEXORA Responsive Utilities
 * Scale UI based on screen size so layout looks good on small and large devices.
 * Base design resolution: 375 x 812 (iPhone SE/standard)
 */
import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Base dimensions used during design
const BASE_W = 375;
const BASE_H = 812;

/** Scale a horizontal/size dimension proportionally to screen width */
export function s(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel(size * (SCREEN_W / BASE_W)));
}

/** Scale a vertical dimension proportionally to screen height */
export function vs(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel(size * (SCREEN_H / BASE_H)));
}

/**
 * Moderate scale – scales less aggressively.
 * factor 0 = no scaling, factor 1 = full linear scaling.
 * Default factor 0.5 is a good balance.
 */
export function ms(size: number, factor = 0.5): number {
  return Math.round(
    PixelRatio.roundToNearestPixel(size + (s(size) - size) * factor)
  );
}

/** Current screen width */
export const screenWidth = SCREEN_W;
/** Current screen height */
export const screenHeight = SCREEN_H;

/** true on physically small devices (< 360dp wide) */
export const isSmallDevice = SCREEN_W < 360;
/** true on large phones / small tablets (> 414dp wide) */
export const isLargeDevice = SCREEN_W > 414;
/** true on tablets (> 600dp wide) */
export const isTablet = SCREEN_W >= 600;

/**
 * Pick a value based on screen size bucket.
 * Usage: responsive({ small: 12, medium: 14, large: 16 })
 */
export function responsive<T>(options: {
  small?: T;
  medium: T;
  large?: T;
}): T {
  if (isTablet && options.large !== undefined) return options.large;
  if (isLargeDevice && options.large !== undefined) return options.large;
  if (isSmallDevice && options.small !== undefined) return options.small;
  return options.medium;
}
