import React, { useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { COLORS } from "@/constants/colors";
import { getBestCachedOrSeedPlayerImage, resolvePlayerImageUri } from "@/lib/player-image-system";

type PlayerSeed = {
  id?: string;
  name?: string;
  team?: string;
  league?: string;
  sport?: string;
  photo?: string | null;
  theSportsDbPhoto?: string | null;
  nationality?: string;
  position?: string;
  age?: number;
};

export const PlayerPhoto = React.memo(function PlayerPhoto({
  player,
  size = 128,
  showInitials = true,
  allowNetwork = true,
}: {
  player: PlayerSeed;
  size?: number;
  showInitials?: boolean;
  allowNetwork?: boolean;
}) {
  const [photoUri, setPhotoUri] = useState<string | null>(
    getBestCachedOrSeedPlayerImage(player)
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [failCount, setFailCount] = useState(0);

  const initials = useMemo(() => {
    const name = String(player.name || "?").trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }, [player.name]);

  // Load best cached image on mount
  useEffect(() => {
    setPhotoUri(getBestCachedOrSeedPlayerImage(player));
    setFailCount(0);
    setImageLoaded(false);
  }, [player]);

  // Try to resolve better image from network
  useEffect(() => {
    if (!allowNetwork) return;
    let disposed = false;

    void resolvePlayerImageUri(player, { allowNetwork: true, preloadProfile: false })
      .then((uri) => {
        if (!disposed && uri) {
          setPhotoUri(uri);
          setImageLoaded(false);
          setFailCount(0);
        }
      })
      .catch(() => undefined);

    return () => { disposed = true; };
  }, [player, allowNetwork]);

  const maxRetries = 2;
  const shouldShowImage = photoUri && failCount <= maxRetries;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size * 0.12,
        },
      ]}
    >
      {shouldShowImage ? (
        <Image
          source={{ uri: photoUri }}
          style={[
            styles.image,
            {
              width: size,
              height: size,
              borderRadius: size * 0.12,
              opacity: imageLoaded ? 1 : 0.7,
            },
          ]}
          resizeMode="cover"
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setFailCount((c) => c + 1);
            setImageLoaded(false);
            if (failCount + 1 >= maxRetries) {
              // Try cached fallback
              const fallback = getBestCachedOrSeedPlayerImage(player);
              if (fallback && fallback !== photoUri) {
                setPhotoUri(fallback);
                setFailCount(0);
              }
            }
          }}
        />
      ) : null}

      {showInitials && !imageLoaded && (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size * 0.12,
            },
          ]}
        >
          <Text
            style={[
              styles.initialsText,
              { fontSize: size * 0.32 },
            ]}
          >
            {initials}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  image: {
    position: "absolute",
  },
  fallback: {
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  initialsText: {
    fontFamily: "Inter_700Bold",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});
