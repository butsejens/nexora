/**
 * Nexora — layout constants
 * Central place for nav-bar heights, z-indices, etc.
 */
import { Platform } from "react-native";

/** Total height (px) of the premium top navigation bar. */
export const TOP_NAV_H = Platform.OS === "web" ? 76 : 86;

/** z-index for the top nav so it floats above page content. */
export const TOP_NAV_Z = 100;
