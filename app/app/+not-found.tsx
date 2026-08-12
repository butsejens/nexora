import React from "react";
import { View } from "react-native";
import { Stack, router } from "expo-router";

import { useT } from "@/i18n";
import { EmptyState } from "@/components/ui/States";
import { makeStyles } from "@/theme";

export default function NotFoundScreen() {
  const t = useT();
  const styles = useStyles();
  return (
    <>
      <Stack.Screen options={{ title: "Not found", headerShown: false }} />
      <View style={styles.root}>
        <EmptyState
          icon="compass-outline"
          title={t("This page doesn't exist")}
          message={t(
            "The link may be out of date. Let's get you back to discovering.",
          )}
          actionLabel={t("Go to Home")}
          onAction={() => router.replace("/(tabs)/home")}
        />
      </View>
    </>
  );
}

const useStyles = makeStyles((c, t) => ({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.background,
  },
}));
