import { Alert, Platform } from "react-native";

/**
 * Cross-platform confirm dialog.
 * `Alert.alert` is a no-op on react-native-web (see react-native-web's
 * Alert implementation), so destructive-action confirmations would
 * silently do nothing on web/PWA builds. This uses `window.confirm`
 * on web and native `Alert.alert` everywhere else.
 */
export const SafeAlert = {
  confirm: (
    title: string,
    message: string,
    confirmText: string,
    onConfirm: () => void,
    options?: { destructive?: boolean; cancelText?: string },
  ) => {
    if (Platform.OS === "web") {
      const confirmed =
        typeof window !== "undefined" && typeof window.confirm === "function"
          ? window.confirm(`${title}\n\n${message}`)
          : false;
      if (confirmed) onConfirm();
      return;
    }
    Alert.alert(title, message, [
      { text: options?.cancelText ?? "Cancel", style: "cancel" },
      {
        text: confirmText,
        style: options?.destructive === false ? "default" : "destructive",
        onPress: onConfirm,
      },
    ]);
  },
};
