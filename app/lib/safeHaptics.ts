import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export const SafeHaptics = {
  impactLight: async () => {
    if (Platform.OS === "web") return;
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  },
  impactMedium: async () => {
    if (Platform.OS === "web") return;
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
  },
  selection: async () => {
    if (Platform.OS === "web") return;
    try { await Haptics.selectionAsync(); } catch {}
  },
  success: async () => {
    if (Platform.OS === "web") return;
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  },
  error: async () => {
    if (Platform.OS === "web") return;
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
  },
  warning: async () => {
    if (Platform.OS === "web") return;
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
  },
};
