import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { COLORS } from "@/constants/colors";

export default function OnboardingLoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={COLORS.accent} />
      <Text style={styles.title}>Loading your setup</Text>
      <Text style={styles.subtitle}>Preparing preferences and personalized rails</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
});
