import { Platform } from "react-native";

/**
 * Detect Android TV / Fire TV at runtime.
 * Uses the RN built-in `isTV` flag (set by Expo prebuild when
 * the manifest declares leanback support).
 */
export const isTV: boolean = Platform.isTV === true;
export const isAndroid: boolean = Platform.OS === "android";
export const isIOS: boolean = Platform.OS === "ios";
export const isWeb: boolean = Platform.OS === "web";
