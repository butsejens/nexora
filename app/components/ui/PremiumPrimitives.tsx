import React from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { SPACING, TYPOGRAPHY } from "@/constants/design-system";

export function SurfaceCard({
  children,
  style,
  elevated = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}) {
  return <View style={[styles.card, elevated && styles.cardElevated, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionTitleWrap}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.8} style={styles.sectionActionBtn}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function StateBlock({
  icon,
  title,
  message,
  loading,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title?: string;
  message?: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <SurfaceCard style={styles.stateWrap}>
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} />
      ) : icon ? (
        <Ionicons name={icon} size={34} color={COLORS.textMuted} />
      ) : null}
      {title ? <Text style={styles.stateTitle}>{title}</Text> : null}
      {message ? <Text style={styles.stateMessage}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.stateActionBtn} activeOpacity={0.85} onPress={onAction}>
          <Text style={styles.stateActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </SurfaceCard>
  );
}

export function PillTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  active: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.pillsRow}>
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => onChange(tab.id)}
            activeOpacity={0.85}
          >
            {tab.icon ? (
              <Ionicons name={tab.icon} size={14} color={isActive ? "#fff" : COLORS.textMuted} />
            ) : null}
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: SPACING.borderRadius.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: SPACING.padding.standard,
  },
  cardElevated: {
    backgroundColor: COLORS.cardElevated,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.gap.standard,
    marginBottom: SPACING.gap.standard,
  },
  sectionTitleWrap: { flex: 1, gap: SPACING.gap.tight },
  sectionTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.text,
  },
  sectionSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  sectionActionBtn: {
    borderRadius: SPACING.borderRadius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: SPACING.gap.standard,
    paddingVertical: SPACING.gap.tight,
  },
  sectionActionText: {
    ...TYPOGRAPHY.small,
    color: COLORS.text,
  },
  stateWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.gap.small,
    minHeight: 180,
  },
  stateTitle: {
    ...TYPOGRAPHY.cardTitle,
    color: COLORS.text,
    textAlign: "center",
  },
  stateMessage: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  stateActionBtn: {
    marginTop: SPACING.gap.small,
    borderRadius: SPACING.borderRadius.pill,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.padding.standard,
    paddingVertical: SPACING.gap.small,
  },
  stateActionText: {
    ...TYPOGRAPHY.badge,
    color: "#fff",
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.gap.small,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.gap.tight,
    borderRadius: SPACING.borderRadius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: SPACING.gap.standard,
    paddingVertical: SPACING.gap.small,
    backgroundColor: COLORS.surface,
  },
  pillActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  pillText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontFamily: "Inter_600SemiBold",
  },
  pillTextActive: {
    color: "#fff",
  },
});
