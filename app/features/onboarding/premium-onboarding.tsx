/**
 * Premium NEXORA Onboarding
 * First-launch experience with background data preload
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
  Image,
} from 'react-native';
import { designTokens, componentTokens } from '@/constants/design-tokens';
import { useModulePreferences } from '@/store/module-preferences';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

type OnboardingStep = 'welcome' | 'sports' | 'teams' | 'competitions' | 'media' | 'notifications' | 'loading';

interface OnboardingProps {
  onComplete: () => void;
}

export function PremiumOnboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [sportsEnabled, setSportsEnabled] = useState(true);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedCompetitions, setSelectedCompetitions] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const { setPreferences, addFavoriteTeam, addFavoriteCompetition, addFavoriteGenre, completeOnboarding } =
    useModulePreferences();

  const handleSportsChoice = (enabled: boolean) => {
    setSportsEnabled(enabled);
    setStep(enabled ? 'teams' : 'media');
  };

  const handleTeamSelect = (teamId: string) => {
    setSelectedTeams((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const handleCompetitionSelect = (competitionId: string) => {
    setSelectedCompetitions((prev) =>
      prev.includes(competitionId)
        ? prev.filter((id) => id !== competitionId)
        : [...prev, competitionId]
    );
  };

  const handleGenreSelect = (genreId: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]
    );
  };

  const handleFinish = async () => {
    setStep('loading');

    // Save preferences
    await setPreferences({
      sportsEnabled,
      notificationsEnabled,
      favoriteTeams: selectedTeams,
      favoriteCompetitions: selectedCompetitions,
      favoriteGenres: selectedGenres,
    });

    // Trigger data preload
    // TODO: Integrate with onboarding-preload service

    await completeOnboarding();
    onComplete();
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: designTokens.colors.background,
    },
    safeArea: {
      flex: 1,
    },
    content: {
      flex: 1,
      padding: designTokens.spacing.lg,
      justifyContent: 'space-between',
    },
    logo: {
      width: 80,
      height: 80,
      borderRadius: designTokens.radius.lg,
      backgroundColor: designTokens.colors.primaryDark,
      alignSelf: 'center',
      marginBottom: designTokens.spacing.xl,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      ...designTokens.typography.heading1,
      color: designTokens.colors.textPrimary,
      marginBottom: designTokens.spacing.md,
      textAlign: 'center',
    },
    subtitle: {
      ...designTokens.typography.body,
      color: designTokens.colors.textSecondary,
      marginBottom: designTokens.spacing.xl,
      textAlign: 'center',
      lineHeight: 24,
    },
    scrollContent: {
      paddingBottom: designTokens.spacing.xl,
    },
    itemGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: designTokens.spacing.md,
      marginBottom: designTokens.spacing.xl,
    },
    itemButton: {
      flex: 1,
      minWidth: '45%',
      padding: designTokens.spacing.md,
      borderRadius: designTokens.radius.xl,
      backgroundColor: designTokens.colors.surface,
      borderWidth: 2,
      borderColor: designTokens.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemButtonSelected: {
      borderColor: designTokens.colors.primary,
      backgroundColor: designTokens.colors.primaryDark,
    },
    itemText: {
      ...designTokens.typography.body,
      color: designTokens.colors.textPrimary,
      marginTop: designTokens.spacing.sm,
    },
    choiceContainer: {
      gap: designTokens.spacing.lg,
      marginBottom: designTokens.spacing.xl,
    },
    choiceButton: {
      paddingVertical: componentTokens.button.paddingY,
      paddingHorizontal: componentTokens.button.paddingX,
      borderRadius: componentTokens.button.borderRadius,
      minHeight: componentTokens.button.minHeight,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
    },
    choiceButtonPrimary: {
      backgroundColor: designTokens.colors.primary,
      borderColor: designTokens.colors.primary,
    },
    choiceButtonSecondary: {
      backgroundColor: designTokens.colors.surface,
      borderColor: designTokens.colors.border,
    },
    choiceButtonText: {
      ...designTokens.typography.bodyLarge,
      fontWeight: '600',
    },
    choiceButtonPrimaryText: {
      color: designTokens.colors.background,
    },
    choiceButtonSecondaryText: {
      color: designTokens.colors.textPrimary,
    },
    toggleButton: {
      flexDirection: 'row',
      padding: designTokens.spacing.md,
      borderRadius: componentTokens.button.borderRadius,
      backgroundColor: designTokens.colors.surface,
      borderWidth: 1,
      borderColor: designTokens.colors.border,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    toggleButtonText: {
      ...designTokens.typography.body,
      color: designTokens.colors.textPrimary,
      flex: 1,
      marginLeft: designTokens.spacing.md,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      ...designTokens.typography.body,
      color: designTokens.colors.textSecondary,
      marginTop: designTokens.spacing.lg,
      textAlign: 'center',
    },
    progressBar: {
      width: width - designTokens.spacing.lg * 2,
      height: 3,
      backgroundColor: designTokens.colors.surface,
      borderRadius: designTokens.radius.full,
      overflow: 'hidden',
      marginTop: designTokens.spacing.xl,
    },
    progressFill: {
      height: '100%',
      backgroundColor: designTokens.colors.primary,
    },
    footer: {
      flexDirection: 'row',
      gap: designTokens.spacing.md,
    },
    backButton: {
      flex: 1,
      paddingVertical: componentTokens.button.paddingY,
      borderRadius: componentTokens.button.borderRadius,
      minHeight: componentTokens.button.minHeight,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: designTokens.colors.surface,
      borderWidth: 1,
      borderColor: designTokens.colors.border,
    },
    nextButton: {
      flex: 2,
      paddingVertical: componentTokens.button.paddingY,
      borderRadius: componentTokens.button.borderRadius,
      minHeight: componentTokens.button.minHeight,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: designTokens.colors.primary,
    },
    buttonText: {
      ...designTokens.typography.bodyLarge,
      fontWeight: '600',
      color: designTokens.colors.background,
    },
    secondaryButtonText: {
      color: designTokens.colors.textPrimary,
    },
  });

  const renderWelcome = () => (
    <View style={styles.content}>
      <View>
        <View style={styles.logo}>
          <Text style={{ fontSize: 40, fontWeight: '700', color: designTokens.colors.primary }}>
            N
          </Text>
        </View>
        <Text style={styles.title}>Welcome to NEXORA</Text>
        <Text style={styles.subtitle}>
          Your premium sports & media hub. Let's personalize your experience in seconds.
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextButton, { flex: 1 }]}
          onPress={() => setStep('sports')}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSports = () => (
    <View style={styles.content}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Do you love sports?</Text>
        <Text style={styles.subtitle}>
          We can highlight live matches, scores, and your favorite teams.
        </Text>

        <View style={styles.choiceContainer}>
          <TouchableOpacity
            style={[styles.choiceButton, styles.choiceButtonPrimary]}
            onPress={() => handleSportsChoice(true)}
          >
            <Text style={[styles.choiceButtonText, styles.choiceButtonPrimaryText]}>Yes, show sports</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.choiceButton, styles.choiceButtonSecondary]}
            onPress={() => handleSportsChoice(false)}
          >
            <Text style={[styles.choiceButtonText, styles.choiceButtonSecondaryText]}>
              No, hide sports
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('welcome')}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTeams = () => (
    <View style={styles.content}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Favorite teams?</Text>
        <Text style={styles.subtitle}>Select your top teams to personalize your feed.</Text>

        <View style={styles.itemGrid}>
          {POPULAR_TEAMS.map((team) => (
            <TouchableOpacity
              key={team.id}
              style={[
                styles.itemButton,
                selectedTeams.includes(team.id) && styles.itemButtonSelected,
              ]}
              onPress={() => handleTeamSelect(team.id)}
            >
              <Ionicons
                name="shield"
                size={32}
                color={
                  selectedTeams.includes(team.id)
                    ? designTokens.colors.primary
                    : designTokens.colors.textTertiary
                }
              />
              <Text style={styles.itemText}>{team.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('sports')}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={() => setStep('competitions')}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCompetitions = () => (
    <View style={styles.content}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Follow competitions?</Text>
        <Text style={styles.subtitle}>Select leagues and tournaments to track.</Text>

        <View style={styles.itemGrid}>
          {POPULAR_COMPETITIONS.map((comp) => (
            <TouchableOpacity
              key={comp.id}
              style={[
                styles.itemButton,
                selectedCompetitions.includes(comp.id) && styles.itemButtonSelected,
              ]}
              onPress={() => handleCompetitionSelect(comp.id)}
            >
              <Ionicons
                name="trophy"
                size={32}
                color={
                  selectedCompetitions.includes(comp.id)
                    ? designTokens.colors.primary
                    : designTokens.colors.textTertiary
                }
              />
              <Text style={styles.itemText}>{comp.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('teams')}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={() => setStep('media')}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderMedia = () => (
    <View style={styles.content}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>What media do you love?</Text>
        <Text style={styles.subtitle}>Select genres to personalize recommendations.</Text>

        <View style={styles.itemGrid}>
          {POPULAR_GENRES.map((genre) => (
            <TouchableOpacity
              key={genre.id}
              style={[
                styles.itemButton,
                selectedGenres.includes(genre.id) && styles.itemButtonSelected,
              ]}
              onPress={() => handleGenreSelect(genre.id)}
            >
              <Ionicons
                name={genre.icon as any}
                size={32}
                color={
                  selectedGenres.includes(genre.id)
                    ? designTokens.colors.primary
                    : designTokens.colors.textTertiary
                }
              />
              <Text style={styles.itemText}>{genre.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('competitions')}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={() => setStep('notifications')}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderNotifications = () => (
    <View style={styles.content}>
      <View>
        <Text style={styles.title}>Stay updated</Text>
        <Text style={styles.subtitle}>
          Get notified about your favorite teams and new episodes.
        </Text>

        <View style={{ gap: designTokens.spacing.lg, marginTop: designTokens.spacing.xl }}>
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setNotificationsEnabled(!notificationsEnabled)}
          >
            <Ionicons
              name={notificationsEnabled ? 'notifications' : 'notifications-off'}
              size={24}
              color={
                notificationsEnabled ? designTokens.colors.primary : designTokens.colors.textTertiary
              }
            />
            <Text style={styles.toggleButtonText}>
              {notificationsEnabled ? 'Notifications on' : 'Notifications off'}
            </Text>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: designTokens.radius.full,
                backgroundColor: notificationsEnabled
                  ? designTokens.colors.primary
                  : designTokens.colors.surface,
              }}
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('media')}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.nextButton} onPress={handleFinish}>
          <Text style={styles.buttonText}>Finish Setup</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={designTokens.colors.primary} />
      <Text style={styles.loadingText}>Setting up your NEXORA...</Text>
      <Text style={styles.loadingText}>Loading personalized content...</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {step === 'welcome' && renderWelcome()}
      {step === 'sports' && renderSports()}
      {step === 'teams' && renderTeams()}
      {step === 'competitions' && renderCompetitions()}
      {step === 'media' && renderMedia()}
      {step === 'notifications' && renderNotifications()}
      {step === 'loading' && renderLoading()}
    </SafeAreaView>
  );
}

// Mock data - replace with real data from API
const POPULAR_TEAMS = [
  { id: '1', name: 'Manchester United' },
  { id: '2', name: 'Liverpool' },
  { id: '3', name: 'Real Madrid' },
  { id: '4', name: 'Barcelona' },
  { id: '5', name: 'Bayern Munich' },
  { id: '6', name: 'Paris Saint-Germain' },
];

const POPULAR_COMPETITIONS = [
  { id: 'pl', name: 'Premier League' },
  { id: 'la', name: 'La Liga' },
  { id: 'serie-a', name: 'Serie A' },
  { id: 'bundesliga', name: 'Bundesliga' },
  { id: 'cl', name: 'Champions League' },
  { id: 'prem-eu', name: 'Europa League' },
];

const POPULAR_GENRES = [
  { id: 'action', name: 'Action', icon: 'flash' },
  { id: 'drama', name: 'Drama', icon: 'sad' },
  { id: 'comedy', name: 'Comedy', icon: 'happy' },
  { id: 'horror', name: 'Horror', icon: 'skull' },
  { id: 'scifi', name: 'Sci-Fi', icon: 'planet' },
  { id: 'romance', name: 'Romance', icon: 'heart' },
];
