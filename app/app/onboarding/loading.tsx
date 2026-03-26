import { PulseLaunchScreen } from "@/components/brand/PulseLaunchScreen";

export default function OnboardingLoadingScreen() {
  return (
    <PulseLaunchScreen
      badge="Onboarding"
      title="Loading your setup"
      subtitle="Preparing preferences and personalized rails"
      progress={42}
    />
  );
}
