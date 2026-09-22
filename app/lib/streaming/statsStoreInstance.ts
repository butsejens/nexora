import AsyncStorage from "@react-native-async-storage/async-storage";

import { ProviderStatsStore } from "@/lib/streaming/stats";

/** App-wide singleton so every PlayButton instance shares the same stats. */
export const providerStatsStore = new ProviderStatsStore(AsyncStorage);
