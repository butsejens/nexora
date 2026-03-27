# Nexora Auth + Monetization Production Checklist

This checklist activates the new real login and monetization stack (Firebase OAuth + RevenueCat + AdMob rewarded ads).

## 1) Fill environment variables

Copy values into your local `.env` (or EAS secrets):

- Firebase/Auth:
  - `EXPO_PUBLIC_FIREBASE_API_KEY`
  - `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
  - `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `EXPO_PUBLIC_FIREBASE_APP_ID`
  - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
  - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
  - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- RevenueCat:
  - `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
  - `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
  - `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` (default `nexora_premium`)
- AdMob:
  - `EXPO_PUBLIC_ADMOB_IOS_APP_ID`
  - `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`
  - `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID`

## 2) Firebase setup

1. Enable Authentication providers:
   - Google
   - Apple
   - Email/Password
2. Add app identifiers:
   - iOS bundle id: `com.nexora.sportsstream`
   - Android package: `com.nexora.sportsstream`
3. Make sure OAuth redirect and client IDs are generated in Firebase.

## 3) RevenueCat setup

1. Create products in App Store Connect and Google Play Console.
2. Link those products in RevenueCat Offering (`current`).
3. Ensure these package types exist:
   - Weekly
   - Monthly
   - Annual
4. Create entitlement id matching `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`.

## 4) AdMob setup

1. Create app entries for iOS and Android in AdMob.
2. Create a Rewarded ad unit.
3. Put app IDs and rewarded unit ID in env vars.

## 5) Native rebuild required

Because new native SDKs were added, do a native build (OTA-only is not enough).

Suggested commands:

```bash
cd app
npx expo prebuild --clean
```

Then build with EAS:

```bash
cd app
npx eas build --platform ios --profile production
npx eas build --platform android --profile production
```

## 6) Validation run (must pass)

- First launch shows required login screen.
- Google button opens OAuth page and returns only after successful login.
- Apple sign in works on iOS device.
- Email sign in works (new account create + existing login).
- Locked prediction:
  - first rewarded ad unlocks exactly one match per day
  - second different match stays locked unless premium
- Premium:
  - weekly/monthly/yearly selectable
  - yearly shows `Save 40%`
  - purchase grants entitlement
  - restore purchases button restores entitlement

## 7) Release

After passing all checks, publish your OTA/app release as normal.
