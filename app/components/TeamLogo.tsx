import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { COLORS } from "@/constants/colors";
import { getInitials, resolveTeamLogoUri } from "@/lib/logo-manager";

export const TeamLogo = React.memo(function TeamLogo({
  uri,
  teamName,
  size = 48,
}: {
  uri?: string | null;
  teamName: string;
  size?: number;
}) {
  const [error, setError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const resolved = useMemo(
    () => (!error ? resolveTeamLogoUri(teamName, uri) : null),
    [teamName, uri, error],
  );
  const initials = useMemo(() => getInitials(teamName, 2), [teamName]);

  const imageSource =
    resolved != null
      ? typeof resolved === "number"
        ? resolved
        : { uri: resolved as string }
      : null;

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
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
          style={{ width: size - 10, height: size - 10, position: "absolute" }}
          resizeMode="contain"
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setError(true);
            setImageLoaded(false);
          }}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.cardElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
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
