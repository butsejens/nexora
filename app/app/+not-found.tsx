import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Niet gevonden", headerShown: false }} />
      <View style={styles.container}>
        <Ionicons name="alert-circle-outline" size={56} color={COLORS.textMuted} />
        <Text style={styles.title}>Pagina niet gevonden</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Ga naar home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: COLORS.background,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  link: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  linkText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
