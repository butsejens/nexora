import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { COLORS } from "@/constants/colors";
import type { Server } from "@/components/MatchCard";
import { SafeHaptics } from "@/lib/safeHaptics";

interface Props {
  servers: Server[];
  selected: string;
  onSelect: (server: Server) => void;
  compact?: boolean;
}

const SERVER_COLORS: Record<string, string> = {
  BRAVO: "#7C3AED",
  ALPHA: COLORS.accent,
  ECHO: "#10B981",
};

export function ServerSelector({ servers, selected, onSelect, compact }: Props) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {servers.map((server) => {
        const isSelected = selected === server.id;
        const color = SERVER_COLORS[server.name] || COLORS.accent;
        return (
          <TouchableOpacity
            key={server.id}
            style={[
              styles.button,
              compact && styles.buttonCompact,
              isSelected && { backgroundColor: color, borderColor: color },
              !isSelected && { borderColor: `${color}44` },
            ]}
            onPress={() => {
              SafeHaptics.impactLight();
              onSelect(server);
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.name, isSelected && styles.nameSelected, !isSelected && { color: `${color}99` }]}>
              {server.name}
            </Text>
            {!compact && (
              <Text style={[styles.quality, isSelected && styles.qualitySelected, !isSelected && { color: `${color}66` }]}>
                {server.quality}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 8,
  },
  containerCompact: {
    gap: 6,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    gap: 2,
  },
  buttonCompact: {
    paddingVertical: 6,
    borderRadius: 8,
  },
  name: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  nameSelected: {
    color: COLORS.text,
  },
  quality: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    letterSpacing: 0.3,
  },
  qualitySelected: {
    color: "rgba(255,255,255,0.7)",
  },
});
