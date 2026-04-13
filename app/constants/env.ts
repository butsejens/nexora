export const ENV = {
  apiBase: process.env.EXPO_PUBLIC_API_BASE || "",
  sportsApiBase: process.env.EXPO_PUBLIC_SPORTS_API_BASE || "",
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "",
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "",
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "",
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "",
  },
  purchases: {
    iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || "",
    androidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || "",
    entitlementId: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || "nexora_premium",
  },
  ads: {
    rewardedUnitId: process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID || "",
    iosAppId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || "",
    androidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || "",
  },
} as const;
