import { Text, View } from "react-native";

export default function OnboardingStep({ title }: { title: string }) {
  return (
    <View>
      <Text>{title}</Text>
    </View>
  );
}
