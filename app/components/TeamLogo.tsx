import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { COLORS } from "@/constants/colors";
import { getInitials, resolveTeamLogoUri, sanitizeRemoteLogoUri } from "@/lib/logo-manager";

export const TeamLogo = React.memo(function TeamLogo({
  uri,
  teamName,
  size = 48,
}: {
  uri?: string | null;
  teamName: string;
  size?: number;
}) {
  const [failCount, setFailCount] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const maxFails = 3;
  const resolved = useMemo(() => {
    if (failCount >= maxFails) return null;
    // First try: server URI preferred, ESPN fallback
    if (failCount === 0) return resolveTeamLogoUri(teamName, uri);
    // Second try: ESPN-only fallback (skip possibly-broken server URI)
    if (failCount === 1) return resolveTeamLogoUri(teamName, null);
    return null;
  }, [teamName, uri, failCount]);
  const initials = useMemo(() => getInitials(teamName, 2), [teamName]);

  const imageSource =
    resolved != null
      ? typeof resolved === "number"
        ? resolved
        : sanitizeRemoteLogoUri(resolved as string)
          ? { uri: sanitizeRemoteLogoUri(resolved as string) as string }
          : null
      : null;

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size * 0.18 },
      ]}
    >
      <Text
        style={[
          styles.initials,
          { fontSize: size * 0.28 },
          imageLoaded && { opacity: 0 },
        ]}
      >
        {initials}
      </Text>
      {imageSource ? (
        <Image
          source={imageSource as any}
          style={{ width: size, height: size, position: "absolute", borderRadius: size * 0.18 }}
          resizeMode="contain"
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setFailCount((c) => Math.min(c + 1, maxFails));
            setImageLoaded(false);
          }}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  initials: {
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.textMuted,
  },
});
