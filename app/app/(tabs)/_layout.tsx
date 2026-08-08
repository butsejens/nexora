import React, { useCallback } from "react";
import { View } from "react-native";
import { Tabs, router, usePathname } from "expo-router";

import { useT } from "@/i18n";
import { BottomNavigation } from "@/components/navigation/BottomNavigation";
import { DesktopNavigation } from "@/components/navigation/DesktopNavigation";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/store/auth-store";
import { makeStyles, useTheme } from "@/theme";

/**
 * CineLog tab shell: bottom navigation on phones, a top bar from tablet width
 * up. Both drive the same tab navigator so state and scroll position survive
 * switching sections.
 */
export default function TabsLayout() {
  const t = useT();
  const { colors } = useTheme();
  const styles = useStyles();
  const { isMobile, gutter } = useResponsive();
  const pathname = usePathname();
  const user = useAuth((state) => state.user);

  const activeRoute = `/${pathname.split("/").filter(Boolean).pop() ?? "home"}`;

  const navigate = useCallback((route: string) => {
    router.navigate(`/(tabs)${route}` as never);
  }, []);

  const openProfile = useCallback(() => {
    router.push("/profile");
  }, []);

  return (
    <View style={styles.root}>
      {isMobile ? null : (
        <DesktopNavigation
          activeRoute={activeRoute}
          onNavigate={navigate}
          onOpenProfile={openProfile}
          gutter={gutter}
          displayName={user?.displayName ?? t("Guest")}
          avatarUrl={user?.avatarUrl ?? null}
        />
      )}

      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
        }}
        tabBar={(props) =>
          isMobile ? (
            <BottomNavigation
              activeRoute={activeRoute}
              onNavigate={(route) => {
                const target = props.state.routeNames.find(
                  (name) => `/${name}` === route,
                );
                if (target) props.navigation.navigate(target);
              }}
            />
          ) : null
        }
      >
        <Tabs.Screen name="home" options={{ title: "Home" }} />
        <Tabs.Screen name="movies" options={{ title: "Movies" }} />
        <Tabs.Screen name="series" options={{ title: "Series" }} />
        <Tabs.Screen name="search" options={{ title: "Search" }} />
        <Tabs.Screen name="watchlist" options={{ title: "Watchlist" }} />
      </Tabs>
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
  root: {
    flex: 1,
    backgroundColor: c.background,
  },
}));
