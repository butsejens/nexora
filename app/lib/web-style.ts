import { Platform, type TextStyle } from "react-native";

/**
 * react-native-web paints a browser focus ring on text inputs that clashes with
 * CineLog's own focus treatment. `outlineStyle` is web-only, so it needs a cast
 * to sit inside a React Native style object.
 */
export const NO_WEB_OUTLINE = Platform.select({
  web: { outlineStyle: "none" } as unknown as TextStyle,
  default: {} as TextStyle,
});
