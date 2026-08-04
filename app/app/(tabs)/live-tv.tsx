/**
 * Live TV — verwijderd. Redirect naar Home.
 */
import { Redirect } from "expo-router";

export default function LiveTvScreen() {
  return <Redirect href="/(tabs)/home" />;
}
