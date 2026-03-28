/**
 * CrashRecoveryScreen.tsx
 *
 * Full-screen crash report displayed when a fatal JS error from the previous
 * (or current) launch was persisted via the global crash guard in index.js or
 * the app's ErrorBoundary.
 *
 * Intentionally uses ONLY system fonts and primitive RN primitives so it
 * renders even when the normal font / provider stack never completed booting.
 */

import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import type { CrashLogEntry } from "@/services/crash-log";
import { buildDiagnosticCode, buildDiagnosticReport } from "@/services/update-diagnostics";

export type CrashRecoveryScreenProps = {
  crash: CrashLogEntry;
  /** Called when the user chooses to dismiss the report and retry. */
  onDismiss: () => void;
};

const MONO_FONT = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

export function CrashRecoveryScreen({ crash, onDismiss }: CrashRecoveryScreenProps) {
  const scheme = useColorScheme();
  const dark = scheme !== "light";
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);

  const bg = dark ? "#000" : "#fff";
  const bgCard = dark ? "#1c1c1e" : "#f2f2f7";
  const text = dark ? "#fff" : "#000";
  const textSub = dark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.55)";
  const red = "#ef4444";
  const redBg = dark ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.08)";
  const redBorder = dark ? "rgba(239,68,68,0.4)" : "rgba(239,68,68,0.3)";
  const green = "#16a34a";

  // Build a synthetic Error object so buildDiagnosticReport can format it.
  const syntheticError = Object.assign(new Error(crash.message), { stack: crash.stack });
  const diagCode = buildDiagnosticCode("boot-crash");
  const diagReport = buildDiagnosticReport("boot-crash", syntheticError);

  const [copied, setCopied] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);

  const qrPayload = JSON.stringify({
    app: "nexora",
    kind: "crash",
    code: diagCode,
    ts: crash.timestamp,
    src: crash.source,
    fatal: crash.isFatal,
    msg: String(crash.message || "").slice(0, 220),
  });

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    Alert.alert(
      "Crashrapport",
      "Selecteer en kopieer de onderstaande tekst handmatig, of deel deze schermafbeelding.",
    );
  };

  const handleDismiss = () => {
    if (dismissed) return;
    setDismissed(true);
    onDismiss();
  };

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: bg, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: red }]}>App vastgelopen</Text>
        <Text style={[styles.subtitle, { color: textSub }]}>
          De vorige sessie is onverwacht gestopt. Hieronder staat de foutinformatie.
        </Text>
      </View>

      {/* Error badge */}
      <View style={[styles.badge, { backgroundColor: redBg, borderColor: redBorder }]}>
        <Text selectable style={[styles.badgeText, { color: "#fca5a5", fontFamily: MONO_FONT }]}>
          {diagCode}
        </Text>
      </View>

      {/* Metadata row */}
      <View style={[styles.metaRow, { backgroundColor: bgCard }]}>
        <MetaItem label="Bron" value={crash.source} textColor={text} subColor={textSub} />
        <MetaItem label="Fataal" value={crash.isFatal ? "ja" : "nee"} textColor={text} subColor={textSub} />
        <MetaItem
          label="Tijd"
          value={crash.timestamp.replace("T", " ").slice(0, 19)}
          textColor={text}
          subColor={textSub}
        />
      </View>

      {/* Error message */}
      <View style={[styles.section, { backgroundColor: bgCard }]}>
        <Text style={[styles.sectionLabel, { color: textSub }]}>Foutmelding</Text>
        <Text selectable style={[styles.errorMessage, { color: red }]}>
          {crash.message || "(geen bericht)"}
        </Text>
      </View>

      {/* Full diagnostic report (scrollable) */}
      <View style={[styles.reportContainer, { backgroundColor: bgCard, borderColor: redBorder }]}>
        <Text style={[styles.sectionLabel, { color: textSub, marginBottom: 6 }]}>Volledig rapport</Text>
        <ScrollView style={styles.reportScroll} nestedScrollEnabled>
          <Text selectable style={[styles.reportText, { color: textSub, fontFamily: MONO_FONT }]}>
            {diagReport}
          </Text>
        </ScrollView>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={handleCopy}
          style={({ pressed }) => [
            styles.btnSecondary,
            { backgroundColor: copied ? green : bgCard, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.btnText, { color: text }]}>
            {copied ? "Rapport geselecteerd" : "Kopieer rapport"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setQrVisible(true)}
          style={({ pressed }) => [
            styles.btnSecondary,
            { backgroundColor: bgCard, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.btnText, { color: text }]}>Toon QR</Text>
        </Pressable>

        <Pressable
          onPress={handleDismiss}
          style={({ pressed }) => [
            styles.btnPrimary,
            { backgroundColor: "#007AFF", opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.btnText, { color: "#fff" }]}>
            Opnieuw proberen
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={qrVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQrVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: bgCard }]}> 
            <Text style={[styles.modalTitle, { color: text }]}>Crash QR</Text>
            <Text style={[styles.modalSubtitle, { color: textSub }]}>Scan deze QR om de crashcode snel te delen.</Text>

            <View style={styles.qrWrap}>
              <QRCode value={qrPayload} size={220} backgroundColor="#FFFFFF" color="#111111" />
            </View>

            <Text selectable style={[styles.qrCodeText, { color: textSub, fontFamily: MONO_FONT }]}>
              {diagCode}
            </Text>

            <Pressable
              onPress={() => setQrVisible(false)}
              style={({ pressed }) => [
                styles.btnPrimary,
                { backgroundColor: "#007AFF", opacity: pressed ? 0.85 : 1, alignSelf: "stretch" },
              ]}
            >
              <Text style={[styles.btnText, { color: "#fff" }]}>Sluiten</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MetaItem({
  label,
  value,
  textColor,
  subColor,
}: {
  label: string;
  value: string;
  textColor: string;
  subColor: string;
}) {
  return (
    <View style={styles.metaItem}>
      <Text style={[styles.metaLabel, { color: subColor }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: textColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 18,
    gap: 12,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  badge: {
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: "row",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 16,
  },
  metaItem: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "500",
  },
  section: {
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  errorMessage: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  reportContainer: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    minHeight: 120,
  },
  reportScroll: {
    flex: 1,
  },
  reportText: {
    fontSize: 10,
    lineHeight: 15,
  },
  actions: {
    gap: 10,
  },
  btnPrimary: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  btnSecondary: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  btnText: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  modalSubtitle: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
  qrWrap: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
  },
  qrCodeText: {
    fontSize: 11,
  },
});
