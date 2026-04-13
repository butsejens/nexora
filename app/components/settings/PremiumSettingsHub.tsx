import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNexora } from "@/context/NexoraContext";
import { COLORS } from "@/constants/colors";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useOnboardingStore } from "@/store/onboarding-store";

const QUALITY_OPTIONS = ["480p", "720p", "1080p", "Auto"];
const LANGUAGE_OPTIONS = ["English", "Dutch", "Spanish", "French"];

export const PremiumSettingsHub = React.memo(function PremiumSettingsHub({
  onLogout,
}: {
  onLogout?: () => void;
}) {
  const {
    authEmail,
    isPremium,
    signOut,
    purchasePremiumSubscription,
    restorePremiumAccess,
  } = useNexora();
  const insets = useSafeAreaInsets();
  const moviesEnabled = useOnboardingStore((s) => s.moviesEnabled);
  const setMoviesEnabled = useOnboardingStore((s) => s.setMoviesEnabled);

  // UI State
  const [activeSection, setActiveSection] = useState<
    | "account"
    | "subscription"
    | "modules"
    | "preferences"
    | "notifications"
    | "privacy"
    | "diagnostics"
  >("account");
  const [loading, setLoading] = useState(false);

  // Settings State
  const [quality, setQuality] = useState("1080p");
  const [subtitles, setSubtitles] = useState(true);
  const [audioLanguage, setAudioLanguage] = useState("English");
  const [autoplay, setAutoplay] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [cacheSize, setCacheSize] = useState("245 MB");

  // Module Visibility
  const modules = useMemo(
    () => ({
      movies: moviesEnabled,
      series: moviesEnabled,
    }),
    [moviesEnabled],
  );

  // Handle Logout
  const handleLogout = useCallback(async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", onPress: () => {} },
      {
        text: "Sign Out",
        onPress: async () => {
          try {
            setLoading(true);
            await signOut?.();
            onLogout?.();
          } finally {
            setLoading(false);
          }
        },
        style: "destructive",
      },
    ]);
  }, [signOut, onLogout]);

  // Handle Module Toggle
  const toggleModule = useCallback(
    async (moduleName: keyof typeof modules) => {
      if (moduleName === "movies" || moduleName === "series") {
        setMoviesEnabled(!modules.movies);
      }

      const updated = {
        movies:
          moduleName === "movies" || moduleName === "series"
            ? !modules.movies
            : modules.movies,
        series:
          moduleName === "movies" || moduleName === "series"
            ? !modules.series
            : modules.series,
      };
      await AsyncStorage.setItem(
        "nexora_module_visibility",
        JSON.stringify(updated),
      );
    },
    [modules, setMoviesEnabled],
  );

  const handleUpgrade = useCallback(
    async (plan: "weekly" | "monthly" | "yearly") => {
      try {
        setLoading(true);
        const result = await purchasePremiumSubscription(plan);
        if (result.ok) {
          Alert.alert("Premium active", "Your subscription is now active.");
        } else if (result.cancelled) {
          Alert.alert(
            "Purchase cancelled",
            "No changes were made to your subscription.",
          );
        } else {
          Alert.alert(
            "Purchase failed",
            result.reason || "Unable to activate premium right now.",
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [purchasePremiumSubscription],
  );

  const openUpgradeChooser = useCallback(() => {
    Alert.alert("Choose plan", "Select a Premium plan", [
      {
        text: "Weekly",
        onPress: () => {
          void handleUpgrade("weekly");
        },
      },
      {
        text: "Monthly",
        onPress: () => {
          void handleUpgrade("monthly");
        },
      },
      {
        text: "Yearly",
        onPress: () => {
          void handleUpgrade("yearly");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [handleUpgrade]);

  const handleRestorePurchases = useCallback(async () => {
    try {
      setLoading(true);
      const result = await restorePremiumAccess();
      if (result.ok && result.restored) {
        Alert.alert("Restored", "Your premium access has been restored.");
      } else {
        Alert.alert(
          "Nothing to restore",
          result.reason || "No active purchase found.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [restorePremiumAccess]);

  // Handle Clear Cache
  const handleClearCache = useCallback(async () => {
    Alert.alert("Clear Cache", "This will free up storage space. Continue?", [
      { text: "Cancel", onPress: () => {} },
      {
        text: "Clear",
        onPress: async () => {
          try {
            setLoading(true);
            // Clear AsyncStorage data (optional)
            // await AsyncStorage.clear();
            setCacheSize("0 MB");
            // In real app, delete actual cache files
            setLoading(false);
          } catch {
            Alert.alert("Error", "Failed to clear cache");
            setLoading(false);
          }
        },
      },
    ]);
  }, []);

  return (
    <LinearGradient
      colors={[COLORS.background, "#1a1a2e"]}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="help-circle-outline" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {/* Navigation Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.navContainer}
          contentContainerStyle={styles.navContent}
        >
          <NavTab
            icon="person"
            label="Account"
            active={activeSection === "account"}
            onPress={() => setActiveSection("account")}
          />
          <NavTab
            icon="crown"
            label="Subscription"
            active={activeSection === "subscription"}
            onPress={() => setActiveSection("subscription")}
          />
          <NavTab
            icon="grid"
            label="Modules"
            active={activeSection === "modules"}
            onPress={() => setActiveSection("modules")}
          />
          <NavTab
            icon="sliders"
            label="Preferences"
            active={activeSection === "preferences"}
            onPress={() => setActiveSection("preferences")}
          />
          <NavTab
            icon="bell"
            label="Notifications"
            active={activeSection === "notifications"}
            onPress={() => setActiveSection("notifications")}
          />
          <NavTab
            icon="lock"
            label="Privacy"
            active={activeSection === "privacy"}
            onPress={() => setActiveSection("privacy")}
          />
          <NavTab
            icon="wrench"
            label="Diagnostics"
            active={activeSection === "diagnostics"}
            onPress={() => setActiveSection("diagnostics")}
          />
        </ScrollView>

        {/* Content */}
        <View style={styles.content}>
          {/* ACCOUNT SECTION */}
          {activeSection === "account" && (
            <View style={styles.section}>
              <SectionTitle title="Account Info" />

              <SettingCard>
                <View style={styles.accountHeader}>
                  <View style={styles.avatar}>
                    <Ionicons name="person" size={32} color={COLORS.accent} />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.userName}>
                      {authEmail?.split("@")[0] || "User"}
                    </Text>
                    <Text style={styles.userEmail}>
                      {authEmail || "Not logged in"}
                    </Text>
                  </View>
                </View>
              </SettingCard>

              <SectionSubTitle title="Account Management" />

              <SettingCard>
                <SettingRow label="Email" value={authEmail || "—"} />
                <SettingRow
                  label="Account Type"
                  value={isPremium ? "Premium" : "Free"}
                  valueColor={isPremium ? COLORS.accent : COLORS.textMuted}
                />
                <SettingRow label="Member Since" value="Dec 2024" />
              </SettingCard>

              <TouchableOpacity
                style={styles.dangerButton}
                onPress={handleLogout}
                disabled={loading}
              >
                <Ionicons name="log-out" size={20} color="#FF5252" />
                <Text style={styles.dangerButtonText}>Sign Out</Text>
              </TouchableOpacity>

              <Text style={styles.hint}>
                You can sign in again anytime with the same account.
              </Text>
            </View>
          )}

          {/* SUBSCRIPTION SECTION */}
          {activeSection === "subscription" && (
            <View style={styles.section}>
              <SectionTitle title="Your Subscription" />

              {isPremium ? (
                <>
                  <SettingCard>
                    <View style={styles.planBadge}>
                      <Ionicons name="star" size={28} color={COLORS.accent} />
                      <View style={styles.planText}>
                        <Text style={styles.planName}>Premium Annual</Text>
                        <Text style={styles.planPrice}>€59.99/year</Text>
                      </View>
                    </View>
                  </SettingCard>

                  <SectionSubTitle title="Plan Details" />
                  <SettingCard>
                    <SettingRow
                      label="Status"
                      value="Active"
                      valueColor={COLORS.accent}
                    />
                    <SettingRow label="Renewal Date" value="Dec 20, 2025" />
                    <SettingRow label="Auto-Renewal" value="Enabled" />
                  </SettingCard>

                  <SectionSubTitle title="What's Included" />
                  <SettingCard>
                    <BenefitRow
                      icon="sparkles"
                      benefit="Ad-free streaming across all content"
                    />
                    <BenefitRow
                      icon="play-circle"
                      benefit="Unlimited movies, series & live TV"
                    />
                    <BenefitRow
                      icon="download"
                      benefit="Download for offline viewing"
                    />
                    <BenefitRow
                      icon="play-speed"
                      benefit="Playback speed control"
                    />
                    <BenefitRow
                      icon="subtitles"
                      benefit="Multiple audio & subtitle languages"
                    />
                  </SettingCard>

                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => {
                      void handleRestorePurchases();
                    }}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons
                      name="refresh"
                      size={18}
                      color={COLORS.accent}
                    />
                    <Text style={styles.secondaryButtonText}>
                      Restore Purchases
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dangerButton}
                    onPress={() =>
                      Alert.alert(
                        "Manage subscription",
                        "Open your App Store or Play Store subscriptions to change or cancel your plan.",
                      )
                    }
                  >
                    <Ionicons name="close" size={20} color="#FF5252" />
                    <Text style={styles.dangerButtonText}>
                      Cancel Subscription
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <SettingCard>
                    <View style={styles.planBadge}>
                      <Ionicons
                        name="lock-open"
                        size={28}
                        color={COLORS.textMuted}
                      />
                      <View style={styles.planText}>
                        <Text style={styles.planName}>Free Plan</Text>
                        <Text style={styles.planPrice}>Limited access</Text>
                      </View>
                    </View>
                  </SettingCard>

                  <SectionSubTitle title="Unlock Premium" />
                  <SettingCard>
                    <BenefitRow icon="sparkles" benefit="Ad-free streaming" />
                    <BenefitRow icon="target" benefit="AI predictions" />
                    <BenefitRow icon="download" benefit="Offline downloads" />
                  </SettingCard>

                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      { backgroundColor: COLORS.accent },
                    ]}
                    onPress={openUpgradeChooser}
                    disabled={loading}
                  >
                    <Ionicons name="card" size={20} color="#fff" />
                    <Text style={[styles.primaryButtonText, { color: "#fff" }]}>
                      Upgrade to Premium
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* MODULES SECTION */}
          {activeSection === "modules" && (
            <View style={styles.section}>
              <SectionTitle title="Content Modules" />
              <Text style={styles.sectionDescription}>
                Choose which content categories appear in your home feed and
                menu.
              </Text>

              <SettingCard>
                <SwitchRow
                  icon="filmstrip"
                  label="Movies"
                  desc="Hollywood & indie films"
                  value={modules.movies}
                  onToggle={() => toggleModule("movies")}
                  disabled={loading}
                />
              </SettingCard>

              <SettingCard>
                <SwitchRow
                  icon="play-circle"
                  label="Series"
                  desc="TV shows & episodic content"
                  value={modules.series}
                  onToggle={() => toggleModule("series")}
                  disabled={loading}
                />
              </SettingCard>

              <Text style={styles.hint}>
                Changes apply immediately. You can enable modules anytime from
                home settings.
              </Text>
            </View>
          )}

          {/* PREFERENCES SECTION */}
          {activeSection === "preferences" && (
            <View style={styles.section}>
              <SectionTitle title="Playback & Display" />

              <SettingCard>
                <PickerRow
                  label="Video Quality"
                  value={quality}
                  options={QUALITY_OPTIONS}
                  onSelect={setQuality}
                />
              </SettingCard>

              <SettingCard>
                <SwitchRow
                  icon="closed-captioning"
                  label="Subtitles"
                  desc="Show subtitles by default"
                  value={subtitles}
                  onToggle={setSubtitles}
                />
              </SettingCard>

              <SettingCard>
                <PickerRow
                  label="Audio Language"
                  value={audioLanguage}
                  options={LANGUAGE_OPTIONS}
                  onSelect={setAudioLanguage}
                />
              </SettingCard>

              <SettingCard>
                <SwitchRow
                  icon="play-speed"
                  label="Autoplay Next"
                  desc="Play next episode automatically"
                  value={autoplay}
                  onToggle={setAutoplay}
                  disabled={!isPremium}
                />
              </SettingCard>

              <SectionSubTitle title="App Language" />
              <SettingCard>
                <PickerRow
                  label="Interface Language"
                  value={"English"}
                  options={["English", "Dutch", "Spanish"]}
                  onSelect={() => {}}
                />
              </SettingCard>

              <SectionSubTitle title="App Appearance" />
              <SettingCard>
                <PickerRow
                  label="Theme"
                  value={"Dark"}
                  options={["Dark", "Light", "Auto"]}
                  onSelect={() => {}}
                />
              </SettingCard>
            </View>
          )}

          {/* NOTIFICATIONS SECTION */}
          {activeSection === "notifications" && (
            <View style={styles.section}>
              <SectionTitle title="Notification Preferences" />

              <SettingCard>
                <SwitchRow
                  icon="bell"
                  label="All Notifications"
                  desc="Master switch for all notifications"
                  value={notificationsEnabled}
                  onToggle={setNotificationsEnabled}
                />
              </SettingCard>

              {notificationsEnabled && (
                <>
                  <SettingCard>
                    <SwitchRow
                      icon="bookmark"
                      label="Watchlist Updates"
                      desc="New episodes & releases"
                      value={true}
                      onToggle={() => {}}
                    />
                  </SettingCard>

                  <SettingCard>
                    <SwitchRow
                      icon="local-offer"
                      label="Promotions"
                      desc="Special offers & new features"
                      value={true}
                      onToggle={() => {}}
                    />
                  </SettingCard>

                  <SettingCard>
                    <SwitchRow
                      icon="message-text"
                      label="Messages"
                      desc="Support & account updates"
                      value={true}
                      onToggle={() => {}}
                    />
                  </SettingCard>
                </>
              )}

              <Text style={styles.hint}>
                Manage notification settings on your device for app-level
                controls.
              </Text>
            </View>
          )}

          {/* PRIVACY SECTION */}
          {activeSection === "privacy" && (
            <View style={styles.section}>
              <SectionTitle title="Privacy & Legal" />

              <SectionSubTitle title="Data & Privacy" />
              <SettingCard>
                <SettingRow label="Data Sharing" value="Limited" />
                <SettingRow label="Tracking" value="Disabled" />
              </SettingCard>

              <TouchableOpacity style={styles.linkRow}>
                <Text style={styles.linkText}>Privacy Policy</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.accent}
                />
              </TouchableOpacity>

              <TouchableOpacity style={styles.linkRow}>
                <Text style={styles.linkText}>Terms of Service</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.accent}
                />
              </TouchableOpacity>

              <TouchableOpacity style={styles.linkRow}>
                <Text style={styles.linkText}>Cookie Settings</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.accent}
                />
              </TouchableOpacity>

              <SectionSubTitle title="Account Security" />
              <SettingCard>
                <TouchableOpacity style={styles.actionRow}>
                  <Ionicons name="key" size={18} color={COLORS.accent} />
                  <Text style={styles.actionText}>Change Password</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>
              </SettingCard>
            </View>
          )}

          {/* DIAGNOSTICS SECTION */}
          {activeSection === "diagnostics" && (
            <View style={styles.section}>
              <SectionTitle title="App Information" />

              <SettingCard>
                <SettingRow label="App Version" value="2.1.0" />
                <SettingRow label="Build" value="42" />
                <SettingRow label="Platform" value="iOS 18.4" />
              </SettingCard>

              <SectionSubTitle title="Storage" />
              <SettingCard>
                <SettingRow label="Cache Size" value={cacheSize} />
                <SettingRow label="Downloads" value="1.2 GB" />
              </SettingCard>

              <TouchableOpacity
                style={styles.dangerButton}
                onPress={handleClearCache}
                disabled={loading}
              >
                <Ionicons name="trash" size={20} color="#FF5252" />
                <Text style={styles.dangerButtonText}>Clear Cache</Text>
              </TouchableOpacity>

              <SectionSubTitle title="About" />
              <SettingCard>
                <TouchableOpacity style={styles.linkRow}>
                  <Text style={styles.linkText}>About Nexora Premium</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={COLORS.accent}
                  />
                </TouchableOpacity>
              </SettingCard>

              {_DEV && (
                <>
                  <SectionSubTitle title="Debug (Dev Only)" />
                  <SettingCard>
                    <SettingRow label="Redux State" value="OK" />
                    <SettingRow label="Firebase" value="Connected" />
                  </SettingCard>
                </>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {loading && <LoadingOverlay />}
    </LinearGradient>
  );
});

// Navigation Tab
function NavTab({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.navTab, active && styles.navTabActive]}
      onPress={onPress}
    >
      <Ionicons
        name={icon as any}
        size={18}
        color={active ? COLORS.accent : COLORS.textMuted}
      />
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// Section Title
function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

// Section Subtitle
function SectionSubTitle({ title }: { title: string }) {
  return <Text style={styles.sectionSubTitle}>{title}</Text>;
}

// Setting Card (Container)
function SettingCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

// Settings Row (Label + Value)
function SettingRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor && { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

// Benefit Row
function BenefitRow({ icon, benefit }: { icon: string; benefit: string }) {
  return (
    <View style={styles.benefitRow}>
      <MaterialCommunityIcons
        name={icon as any}
        size={20}
        color={COLORS.accent}
      />
      <Text style={styles.benefitText}>{benefit}</Text>
    </View>
  );
}

// Switch Row
function SwitchRow({
  icon,
  label,
  desc,
  value,
  onToggle,
  disabled,
}: {
  icon: string;
  label: string;
  desc: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchInfo}>
        <MaterialCommunityIcons
          name={icon as any}
          size={20}
          color={COLORS.accent}
        />
        <View style={styles.switchText}>
          <Text style={styles.switchLabel}>{label}</Text>
          <Text style={styles.switchDesc}>{desc}</Text>
        </View>
      </View>
      <Switch value={value} onValueChange={onToggle} disabled={disabled} />
    </View>
  );
}

// Picker Row
function PickerRow({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (val: string) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => {
        Alert.alert(label, undefined, [
          { text: "Cancel", onPress: () => {} },
          ...options.map((opt) => ({
            text: opt,
            onPress: () => onSelect(opt),
          })),
        ]);
      }}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.pickerValue}>
        <Text style={styles.rowValue}>{value}</Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

// Loading Overlay
function LoadingOverlay() {
  return (
    <View style={styles.loadingOverlay}>
      <ActivityIndicator size="large" color={COLORS.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 28,
    color: COLORS.text,
  },

  navContainer: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  navContent: { paddingHorizontal: 16, gap: 8, paddingVertical: 12 },
  navTab: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navTabActive: { backgroundColor: "rgba(229,9,20,0.12)" },
  navLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.textMuted,
  },
  navLabelActive: { color: COLORS.accent },

  content: { paddingHorizontal: 16, paddingVertical: 20 },
  section: { gap: 20 },

  sectionTitle: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 20,
    color: COLORS.text,
    marginBottom: 8,
  },
  sectionSubTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: COLORS.text,
    marginTop: 12,
    marginBottom: 8,
  },
  sectionDescription: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 12,
  },

  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },

  accountHeader: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    padding: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(229,9,20,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  accountInfo: { flex: 1, gap: 4 },
  userName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: COLORS.text,
  },
  userEmail: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  rowLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  rowValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.accent,
  },
  pickerValue: { flexDirection: "row", alignItems: "center", gap: 6 },

  planBadge: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    padding: 16,
  },
  planText: { flex: 1, gap: 4 },
  planName: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  planPrice: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.textMuted,
  },

  benefitRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  benefitText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },

  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  switchInfo: { flexDirection: "row", gap: 12, alignItems: "center", flex: 1 },
  switchText: { flex: 1, gap: 2 },
  switchLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
  },
  switchDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
  },

  actionRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },

  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    marginVertical: 8,
  },
  linkText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.accent,
  },

  primaryButton: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonText: { fontFamily: "Inter_700Bold", fontSize: 15 },

  secondaryButton: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: "rgba(229,9,20,0.12)",
  },
  secondaryButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.accent,
  },

  dangerButton: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FF5252",
    backgroundColor: "rgba(255,82,82,0.12)",
  },
  dangerButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#FF5252",
  },

  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 12,
  },

  loadingOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});

const _DEV = __DEV__;
