/** CineLog — cast member card used in the detail-page cast carousel. */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { TouchableScale } from "@/components/ui/Pressable";
import { COLORS, FONTS, RADIUS, SPACING } from "@/constants/theme";
import type { CastMember } from "@/lib/cinelog/types";

export interface CastCardProps {
  member: CastMember;
  width: number;
  onPress: () => void;
}

export function CastCard({ member, width, onPress }: CastCardProps) {
  return (
    <TouchableScale
      onPress={onPress}
      style={{ width }}
      accessibilityRole="button"
      accessibilityLabel={
        member.character
          ? `${member.name} as ${member.character}`
          : member.name
      }
    >
      <View style={[styles.photoWrap, { width, height: width }]}>
        {member.photo ? (
          <Image
            source={{ uri: member.photo }}
            style={styles.photo}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.photo, styles.fallback]}>
            <Ionicons name="person" size={24} color={COLORS.textFaint} />
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {member.name}
      </Text>
      {member.character ? (
        <Text style={styles.character} numberOfLines={1}>
          {member.character}
        </Text>
      ) : null}
    </TouchableScale>
  );
}

const styles = StyleSheet.create({
  photoWrap: {
    borderRadius: RADIUS.pill,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceElevated,
  },
  name: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: COLORS.textPrimary,
    textAlign: "center",
    paddingTop: SPACING.sm,
  },
  character: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
    paddingTop: 1,
  },
});
