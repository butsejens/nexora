import { Platform, NativeModules } from "react-native";

/**
 * Detect Android TV / Fire TV at runtime.
 * Primary: RN built-in `isTV` flag (checks UiModeManager).
 * Fallback: BuildConfig.IS_TV via native module (set by Gradle TV flavor).
 */
export const isTV: boolean =
  Platform.isTV === true ||
  (Platform.OS === "android" && NativeModules.TVConfig?.IS_TV === true);
export const isAndroid: boolean = Platform.OS === "android";
export const isIOS: boolean = Platform.OS === "ios";
export const isWeb: boolean = Platform.OS === "web";
