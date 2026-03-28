# NEXORA PREMIUM PRODUCT - COMPLETE IMPLEMENTATION GUIDE

**Version:** 2.0 Premium  
**Date:** 2024-2025  
**Status:** ✅ Ready for Integration Testing

---

## 📋 EXECUTIVE SUMMARY

This document outlines the complete premium subscription product implementation for Nexora, transforming it from a basic streaming app into a professional premium platform with:

- ✅ **Enhanced Authentication Flow** (Google, Apple, Email with unified UX)
- ✅ **Comprehensive Settings Hub** (12 categories, module visibility control)
- ✅ **Premium Paywall** (€2.99/week, €7.99/month, €59.99/year with benefits)
- ✅ **Free Unlock System** (1 daily prediction unlock via rewarded ads)
- ✅ **Module Visibility Control** (Enable/disable sports, movies, series, IPTV)
- ✅ **Premium Material Design** (Dark cards, red accents, professional styling)

---

## 🏗️ ARCHITECTURE OVERVIEW

### New Components Created

#### 1. **PremiumAuthFlow.tsx**
**Path:** `/app/components/auth/PremiumAuthFlow.tsx`

**Purpose:** Unified authentication interface with Google, Apple, and Email sign-in.

**Modes:**
- `welcome`: Initial landing with social sign-in + email option
- `login`: Email/password authentication
- `signup`: New account creation with email validation
- `forgot-password`: Password reset flow

**Key Features:**
- Real OAuth redirects (Google, Apple)
- Proper error handling (invalid password, user not found, etc.)
- Password visibility toggle
- Form validation (email format, password strength, matching passwords)
- Loading states with activity indicators
- Responsive keyboard handling (KeyboardAvoidingView)

**Used By:**
- `premium-settings.tsx` (when unauthenticated)
- Direct integration option for login screens

---

#### 2. **PremiumSettingsHub.tsx**
**Path:** `/app/components/settings/PremiumSettingsHub.tsx`

**Purpose:** Centralized settings dashboard consolidating all user preferences.

**Sections (7 Total):**

1. **Account**
   - User profile (email, account type)
   - Member since date
   - Sign out with confirmation
   
2. **Subscription**
   - Current plan details (weekly/monthly/yearly)
   - Renewal date
   - Auto-renewal status
   - Benefits list (ad-free, predictions, downloads, playback speed, languages)
   - Restore purchases button
   - Cancel subscription option (for premium users)
   - Upgrade to Premium button (for free users)

3. **Modules**
   - Radio toggles for: Sports, Movies, Series, Live TV
   - Each toggle persists to AsyncStorage
   - Real-time home feed update (integrates with module visibility system)
   - Help text explaining purpose

4. **Preferences**
   - Video Quality: 480p, 720p, 1080p, Auto
   - Subtitles: Toggle with description
   - Audio Language: Selectable picker
   - Autoplay Next: Toggle (premium feature only)
   - Interface Language: Selectable picker
   - Theme: Dark/Light/Auto

5. **Notifications**
   - Master notifications switch
   - Conditional sub-preferences when enabled:
     - Sports Alerts
     - Watchlist Updates
     - Promotions
     - Messages

6. **Privacy & Legal**
   - Data sharing status
   - Tracking status
   - Privacy Policy link
   - Terms of Service link
   - Cookie Settings link
   - Change Password action

7. **Diagnostics**
   - App Version, Build, Platform info
   - Storage: Cache size, Downloads size
   - Clear Cache with confirmation
   - About Nexora link
   - Dev-only: Redux state, Firebase status (when `__DEV__`)

**Navigation:**
- Horizontal ScrollView with icon+label tabs
- Each tab toggles section content
- Persistent section state during session

**Styling:**
- Dark premium cards: `rgba(255,255,255,0.05)` background
- Red accent: `COLORS.accent` (#E50914)
- Inter typography family (Bold, SemiBold, Medium, Regular)
- 12pt spacing system
- Rounded corners (12-14pt border radius)

---

#### 3. **EnhancedPaywall.tsx**
**Path:** `/app/components/paywall/EnhancedPaywall.tsx`

**Purpose:** Professional premium subscription upsell screen.

**Pricing Plans:**
- **Weekly:** €2.99/week (popular: no)
- **Monthly:** €7.99/month (popular: yes - highlighted)
- **Yearly:** €59.99/year (popular: no, with "Save 40%" badge)

**Features:**
- Plan selector with visual selection state (red accent border + background)
- Price breakdown for yearly (€5/month, cancel anytime)
- Benefits grid (8 items with icons):
  - Ad-free streaming
  - AI predictions
  - Offline downloads
  - Playback speed control
  - 30+ language audio & subtitles
  - Up to 4K quality
  - Family sharing (6 profiles)
  - Watch history sync
- "Start Free Trial" primary button
- "Restore Purchases" secondary button
- Legal links (Privacy Policy, Terms of Service)
- Error message display
- Loading states

**Flow:**
1. User selects plan (radio button style)
2. User taps "Start Free Trial"
3. Integration with RevenueCat `purchasePremiumSubscription(plan)`
4. On success: close modal, refresh premium status
5. On error: display error message with retry option

**Styling:**
- Linear gradient background (COLORS.background → #1a1a2e)
- Premium cards with icon containers
- Red accent for selected plan and CTA
- Popular badge on monthly plan
- Savings badge on yearly plan (red)

---

#### 4. **FreeUnlockModal.tsx**
**Path:** `/app/components/unlocks/FreeUnlockModal.tsx`

**Purpose:** Beautiful free prediction unlock experience with countdown + rewarded ads.

**States:**

1. **Loading State**
   - Fetches unlock state from AsyncStorage
   - Initializes countdown to next reset

2. **Main Unlock State (3 Scenarios)**

   **A. Can Unlock (Free User, Unlocks Remaining)**
   - Large number display: `1` unlock available today
   - Description of free unlock system
   - Countdown box: Time until reset (e.g., "23h 45m 30s")
   - Method cards:
     - "Watch Ad & Unlock" (primary, with icon)
     - "Go Premium" (secondary, with icon)
   - Bottom CTA: Large "Watch Ad & Unlock" button

   **B. Exhausted (Free User, No Unlocks)**
   - Warning icon + "Daily unlocks exhausted" message
   - Countdown to reset
   - Method cards (same as above)
   - No bottom CTA (only method cards)

   **C. Premium User**
   - Crown icon + "Premium Predictions Unlimited" message
   - Benefits list (Unlimited Predictions, Advanced Analytics, Full History)
   - No method cards (they already have access)

3. **Success State**
   - Large checkmark icon (green/accent color)
   - "Prediction Unlocked!" title
   - Success message
   - Countdown to next unlock
   - "Continue Using App" button
   - Auto-closes after 2.5 seconds

**AsyncStorage Data Structure:**
```json
{
  "nexora_prediction_unlock": {
    "remaining": 0-1,
    "lastReset": "ISO timestamp",
    "nextReset": "ISO timestamp (UTC midnight)",
    "canUnlock": boolean
  }
}
```

**Countdown Logic:**
- Resets at UTC midnight daily
- Updates every 1 second while modal open
- Format: "23h 45m 30s" → "Ready for next unlock!" when near reset

**User Flow for Ad:**
1. User sees modal with countdown
2. User taps "Watch Ad & Unlock"
3. Rewarded ad plays (mocked as 2s delay in demo)
4. On success: unlock count decreases, success state shown
5. Auto-close after 2.5s
6. User can use 1 prediction unlock for that day

---

#### 5. **usePremiumProduct Hook**
**Path:** `/app/hooks/usePremiumProduct.ts`

**Purpose:** Centralized state management for all premium features (single source of truth).

**State Management:**

```typescript
{
  // Auth
  authState: "loading" | "unauthenticated" | "authenticated"
  authError: string | null
  isAuthenticated: boolean
  handleAuthentication: (method: "google" | "apple" | "email") => Promise<void>
  handleLogout: () => Promise<void>
  initializeAuth: () => Promise<void>
  
  // Premium
  isPremium: boolean
  premiumModalVisible: boolean
  setPremiumModalVisible: (visible: boolean) => void
  handleShowPremiumPaywall: () => void
  
  // Settings
  settingsModalVisible: boolean
  setSettingsModalVisible: (visible: boolean) => void
  handleShowSettingsHub: () => void
  
  // Free Unlocks
  freeUnlockModalVisible: boolean
  setFreeUnlockModalVisible: (visible: boolean) => void
  handleShowFreeUnlock: () => void
  handleUnlocked: () => void
  
  // Module Visibility
  moduleVisibility: {
    sport: boolean
    movies: boolean
    series: boolean
    livetv: boolean
  }
  updateModuleVisibility: (modules) => Promise<void>
  
  // User
  user: User | null
  
  // RevenueCat
  purchasePremiumSubscription: (plan: "weekly" | "monthly" | "yearly") => Promise<boolean>
  restorePremiumPurchases: () => Promise<void>
}
```

**Helper Hooks:**

```typescript
// Check if module is enabled
useModuleAccess("sport") // boolean

// Check if feature requires premium
usePremiumFeature("predictions") // { requiresPremium, allowed }
```

**Key Features:**
- Session restoration on app launch
- Module visibility persistence
- Auth state synchronization
- Error handling for all operations
- Integration with NexoraContext

---

#### 6. **premium-settings.tsx Screen**
**Path:** `/app/app/premium-settings.tsx`

**Purpose:** Main premium product entry point/dashboard.

**Routes:**
- `/premium-settings` - Full premium management screen

**Flow:**
1. Show loading spinner while auth initializing
2. If unauthenticated: Show `PremiumAuthFlow`
3. If authenticated: Show `PremiumSettingsHub` + modals
4. Modals (overlays):
   - `EnhancedPaywall` (when premium upgrade triggered)
   - `FreeUnlockModal` (when claiming daily free unlock)

**Navigation:**
- Back button → closes screen/logs out
- Settings hub navigation within screen
- Modal stack properly managed

---

## 📱 INTEGRATION POINTS

### AsyncStorage Keys (Persistence)

```typescript
"nexora_auth_session"              // { uid, email, photoURL }
"nexora_module_visibility"         // { sport, movies, series, livetv }
"nexora_prediction_unlock"         // { remaining, lastReset, nextReset, canUnlock }

// Existing keys still used:
"nexora_quality"                   // "480p" | "720p" | "1080p" | "Auto"
"nexora_subtitles"                 // boolean
"nexora_audio_lang"                // "English" | "Dutch" | ...
"nexora_autoplay"                  // boolean
"nexora_reset_email"               // for password reset
```

### Context Integration (NexoraContext)

**Used Methods:**
- `signInWithGoogle()` → PremiumAuthFlow
- `signInWithApple()` → PremiumAuthFlow
- `signInWithEmail(email, password)` → PremiumAuthFlow
- `logOut()` → PremiumSettingsHub
- `isPremium` → Feature gating throughout app
- `moduleVisibility` → Home layout + settings
- `hasPremium(category)` → Content access control
- `purchasePremiumSubscription(plan)` → EnhancedPaywall
- `restorePremiumPurchases()` → EnhancedPaywall

**Extensions Needed in NexoraContext:**
```typescript
moduleVisibility?: {
  sport: boolean
  movies: boolean
  series: boolean
  livetv: boolean
}

setModuleVisibility?: (modules: ModuleVisibility) => void
```

---

## 🎨 DESIGN SYSTEM

### Colors

```typescript
// From COLORS constants
COLORS.background       // "#0a0a0a" (pure black backgrounds)
COLORS.accent          // "#E50914" (premium red - Netflix-like)
COLORS.text            // "#FFFFFF" (primary text)
COLORS.textMuted       // "#8B8B8B" (secondary text)
COLORS.border          // rgba(255, 255, 255, 0.1)
```

### Typography

**Families:** Inter (system font)
- Inter_800ExtraBold (28, 24, 20 - headers)
- Inter_700Bold (18, 16, 15 - section titles, buttons)
- Inter_600SemiBold (16, 15, 14 - labels, emphasis)
- Inter_500Medium (14, 13, 12 - descriptions, secondary)
- Inter_400Regular (14, 13, 12 - body text)

### Spacing

**Base unit:** 4px
- Padding: 12, 16, 20, 24, 32, 40px
- Gap: 4, 8, 10, 12, 14, 16px
- Border radius: 8, 10, 12, 14, 24, 28, 40px

### Components

**Cards:**
- Background: `rgba(255,255,255,0.05)`
- Border: 1px `COLORS.border`
- Border Radius: 12-14px
- Padding: 16px

**Buttons:**
- Primary: `backgroundColor: COLORS.accent`, white text, 14px padding
- Secondary: Border + transparent fill, `COLORS.accent` text
- Danger: Border + red, `#FF5252` text/icon

---

## 🔄 DATA FLOW DIAGRAMS

### Authentication Flow

```
App Start
  ↓
initializeAuth()
  ↓
Check AsyncStorage: "nexora_auth_session"
  ├─ Found + Valid → authState = "authenticated"
  └─ Not Found → authState = "unauthenticated"
  ↓
Show PremiumAuthFlow (if unauthenticated)
  ├─ Google OAuth
  │  ├─ expo-auth-session
  │  ├─ Firebase Auth.signInWithCredential()
  │  └─ Save to "nexora_auth_session"
  ├─ Apple Sign-In
  │  ├─ expo-apple-authentication
  │  ├─ Firebase Auth.signInWithCredential()
  │  └─ Save to "nexora_auth_session"
  └─ Email/Password
     ├─ Firebase Auth.signInWithEmailAndPassword()
     └─ Save to "nexora_auth_session"
  ↓
Navigate to premium-settings.tsx
  ↓
Show PremiumSettingsHub (authenticated)
```

### Premium Purchase Flow

```
User in Premium Settings
  ↓
Taps "Upgrade to Premium"
  ↓
setShowPaywall(true) → EnhancedPaywall renders
  ↓
User selects plan (weekly/monthly/yearly)
  ↓
Taps "Start Free Trial"
  ↓
purchasePremiumSubscription(plan)
  ├─ RevenueCat SDK integration
  ├─ Platform: iOS App Store / Android Play Store
  └─ Prompts app store (7-day free trial)
  ↓
On Success:
  ├─ Update context: isPremium = true
  ├─ Close paywall
  ├─ Refresh Premium Settings UI
  └─ User now sees premium benefits
  ↓
On Error:
  ├─ Show error message
  ├─ Retry option
  └─ Paywall remains open
```

### Module Visibility Flow

```
Onboarding/Settings
  ↓
User enables/disables modules (Sport, Movies, Series, IPTV)
  ↓
toggleModule(moduleName)
  ├─ Update local state
  ├─ Save to AsyncStorage: "nexora_module_visibility"
  └─ Call setModuleVisibility() in context
  ↓
Home Screen
  ├─ Reads context.moduleVisibility
  ├─ Conditionally renders sections:
  │  ├─ sports || moduleVisibility.sport
  │  ├─ movies || moduleVisibility.movies
  │  ├─ series || moduleVisibility.series
  │  └─ livetv || moduleVisibility.livetv
  └─ User sees only enabled modules
```

### Free Unlock Flow

```
User taps "Claim Free Prediction"
  ↓
FreeUnlockModal opens
  ↓
Load AsyncStorage: "nexora_prediction_unlock"
  ├─ First time: Create with remaining=1, nextReset=tomorrow 24:00 UTC
  └─ Not first time: Load existing state
  ↓
Show unlock state:
  ├─ If remaining > 0: "Watch Ad & Unlock" button enabled
  ├─ If remaining = 0: "Check back tomorrow" with countdown
  └─ Countdown timer runs (updates every second)
  ↓
User taps "Watch Ad & Unlock"
  ├─ Trigger rewarded ad (Google Mobile Ads)
  ├─ On ad reward: Decrement remaining count
  ├─ Save updated state to AsyncStorage
  └─ Show success state (2.5s auto-close)
  ↓
Next day (after UTC midnight):
  ├─ Countdown reaches 0
  ├─ Unlock state resets
  ├─ User gets 1 new free unlock
  └─ Cycle repeats
```

---

## 🧪 TESTING CHECKLIST

### Authentication Tests

- [ ] Google Sign-In: Real redirect (not fake button)
- [ ] Apple Sign-In: Real redirect (not fake button)
- [ ] Email Sign-In: Valid email format check
- [ ] Email Sign-In: Password length validation (8+ chars)
- [ ] Email Sign-In: Password match validation (signup)
- [ ] Wrong email/password: Shows error message
- [ ] Logout: Clears session + navigates back
- [ ] Session restore: App restart→ still authenticated (if session exists)
- [ ] Loading states: Show spinner during auth operations

### Premium Paywall Tests

- [ ] Plan selection: Radio button toggles correctly
- [ ] Plan selection: Visual feedback (red border + background)
- [ ] Plan switching: Price updates correctly
- [ ] Yearly plan: Shows "Save 40%" badge
- [ ] Monthly plan: Marked as "MOST POPULAR"
- [ ] Benefits list: All 8 benefits display correctly
- [ ] Purchase flow: Calls RevenueCat SDK with correct plan
- [ ] Success: Modal closes, premium status updates in settings
- [ ] Error: Error message displays with retry
- [ ] Restore Purchases: Clicking button triggers restore flow

### Settings Hub Tests

- [ ] Account Section: Displays correct user email
- [ ] Account Section: Sign out button shows confirmation
- [ ] Subscription Section: Shows correct plan (weekly/monthly/yearly)
- [ ] Subscription Section: Shows renewal date
- [ ] Modules Section: Sport toggle persists to AsyncStorage
- [ ] Modules Section: On toggle, home layout updates immediately
- [ ] Preferences Section: Quality picker shows 4 options
- [ ] Preferences Section: Language picker shows options
- [ ] Notifications Section: Master switch disables sub-options
- [ ] Privacy Section: Links open (or show placeholder)
- [ ] Diagnostics Section: App version displays correctly
- [ ] Diagnostics Section: Clear cache shows confirmation
- [ ] Screenshot test: Settings layout visually matches design

### Free Unlock Tests

- [ ] First open: Shows "1 unlock available today"
- [ ] Countdown: Updates every 1 second correctly
- [ ] Countdown format: "23h 45m 30s" → "Ready for next unlock!" at reset time
- [ ] Watch ad: Clicking button triggers rewarded ad
- [ ] After ad reward: Unlock count decreases to 0
- [ ] After ad reward: Success state shows for 2.5s then closes
- [ ] Exhausted unlock: Shows "Daily unlocks exhausted" + countdown
- [ ] Next day reset: At UTC midnight, remaining resets to 1
- [ ] Next day: "Ready for next unlock!" appears in countdown
- [ ] Premium user: Shows "Unlimited Predictions" text instead
- [ ] Premium user: No method cards shown
- [ ] AsyncStorage: Data persists after app restart

### Module Visibility Tests

- [ ] Toggle sport: Sports section appears/disappears on home
- [ ] Toggle movies: Movies section appears/disappears on home
- [ ] Toggle series: Series section appears/disappears on home
- [ ] Toggle livetv: Live TV section appears/disappears on home
- [ ] Multiple toggles: Combinations work correctly
- [ ] All disabled: Home shows empty state or message
- [ ] Persistence: Module state survives app restart
- [ ] Onboarding: Initial selections affect module visibility

### End-to-End Tests

1. **Full Journey (Unauthenticated → Premium User)**
   - [ ] App start → See PremiumAuthFlow
   - [ ] Sign up with email → Taken to PremiumSettingsHub
   - [ ] Tap "Upgrade to Premium" → EnhancedPaywall opens
   - [ ] Select yearly plan → Tap purchase
   - [ ] Complete purchase in app store → Modal closes
   - [ ] Premium status updated in settings → See premium benefits
   - [ ] Navigate to modules → Can enable/disable content

2. **Free User Journey**
   - [ ] Free user taps predictions → FreeUnlockModal opens
   - [ ] See "1 unlock available" + countdown
   - [ ] Tap "Watch Ad & Unlock" → Ad plays
   - [ ] Success state → Modal auto-closes
   - [ ] Prediction now available to use
   - [ ] Next hour: Still "0 unlocks available"
   - [ ] Next day (after reset): "1 unlock available" again

3. **Premium User Journey**
   - [ ] Premium user views settings → See active plan + benefits
   - [ ] Tap "Change Plan" → EnhancedPaywall with restore option
   - [ ] Tap restore → Purchases verified
   - [ ] Tap predictions → Modal shows "Unlimited"
   - [ ] No countdown shown for premium user

---

## 📦 FILE STRUCTURE

```
app/
├── components/
│   ├── auth/
│   │   └── PremiumAuthFlow.tsx          ✨ NEW
│   ├── settings/
│   │   └── PremiumSettingsHub.tsx       ✨ NEW
│   ├── paywall/
│   │   └── EnhancedPaywall.tsx          ✨ NEW
│   └── unlocks/
│       └── FreeUnlockModal.tsx          ✨ NEW
│
├── hooks/
│   └── usePremiumProduct.ts             ✨ NEW
│
└── app/
    ├── premium-settings.tsx             ✨ NEW (route: /premium-settings)
    ├── profile.tsx                      ℹ️  EXISTING (can integrate settings hub)
    ├── settings.tsx                     ℹ️  EXISTING (can link to premium-settings)
    └── ...other screens...
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Before Launch

- [ ] All TypeScript compilation errors resolved
- [ ] All components tested in simulator/device
- [ ] All AsyncStorage keys documented
- [ ] RevenueCat SDK configured (iOS App Store + Android Play Store)
- [ ] Google OAuth credentials verified
- [ ] Apple Sign-In settings configured
- [ ] Rewarded ads SDK configured (Google Mobile Ads)
- [ ] Firebase Auth rules updated if needed
- [ ] Strings all in English (hardcoded for now, i18n ready)

### Features Ready

- [ ] Auth flow: Google, Apple, Email all working
- [ ] Paywall: Purchase flow end-to-end working
- [ ] Settings: All sections functional
- [ ] Module visibility: Home layout responds to toggles
- [ ] Free unlocks: Countdown + ads working
- [ ] Error states: User-friendly messages shown

### Performance

- [ ] Settings hub: Smooth scrolling with 60fps
- [ ] Modals: Proper memory cleanup on dismiss
- [ ] Images: No unoptimized assets
- [ ] Storage: AsyncStorage queries optimized

### Security

- [ ] Auth tokens: Not logged to console
- [ ] Passwords: Not stored in plaintext
- [ ] Session: Expires appropriately
- [ ] API keys: Environment-based (not hardcoded)

---

## 🎯 QUICK START

### 1. Import the Hook

```typescript
import { usePremiumProduct } from "@/hooks/usePremiumProduct";

function MyScreen() {
  const premium = usePremiumProduct();
  
  // Now you have access to all premium state + methods
}
```

### 2. Navigate to Premium Settings

```typescript
import { router } from "expo-router";

router.push("/premium-settings");
```

### 3. Show Paywall Programmatically

```typescript
const premium = usePremiumProduct();

<TouchableOpacity onPress={() => premium.handleShowPremiumPaywall()}>
  <Text>Upgrade to Premium</Text>
</TouchableOpacity>
```

### 4. Check Module Access

```typescript
import { useModuleAccess } from "@/hooks/usePremiumProduct";

function HomeScreen() {
  const showSports = useModuleAccess("sport");
  
  return (
    <>
      {showSports && <SportsSection />}
    </>
  );
}
```

### 5. Check Premium Feature Access

```typescript
import { usePremiumFeature } from "@/hooks/usePremiumProduct";

function OfflineDownloadButton() {
  const { allowed, requiresPremium } = usePremiumFeature("offline-download");
  
  if (!allowed) {
    return <Text>Available in Premium</Text>;
  }
  
  return <TouchableOpacity>Download</TouchableOpacity>;
}
```

---

## 🐛 KNOWN LIMITATIONS & FUTURE WORK

### Current Demo Limitations

1. **Rewarded Ads:** Currently mocked (2s delay). Real ads need Google Mobile Ads SDK configuration.
2. **Password Reset:** Stored in AsyncStorage only. Real app should send email.
3. **RevenueCat:** SDK calls mocked. Real implementation uses actual RevenueCat SDK.
4. **Privacy Links:** Placeholder. Link to actual policies.
5. **Dark theme only:** Light theme not implemented yet.
6. **English only:** i18n ready but not implemented.

### Future Enhancement Ideas

- [ ] Family sharing (add 5 more family members)
- [ ] Payment history / invoices
- [ ] Tier-based content (all premium or tiered: basic/standard/premium)
- [ ] Analytics dashboard (watch time, favorite genres, etc.)
- [ ] PIN protection for kids profiles
- [ ] Offline download management (storage quota)
- [ ] Advanced recommendation engine based on premium tier
- [ ] Premium early access to new content

---

## 📞 SUPPORT / TROUBLESHOOTING

### AsyncStorage Not Persisting

```typescript
// Verify AsyncStorage is working:
import AsyncStorage from "@react-native-async-storage/async-storage";

// Test write/read
await AsyncStorage.setItem("test", "value");
const value = await AsyncStorage.getItem("test");
console.log(value); // should be "value"
```

### Colors Not Matching Design

```typescript
// Verify COLORS constant is imported:
import { COLORS } from "@/constants/colors";

// Check if COLORS.accent is #E50914
console.log(COLORS.accent);
```

### Module Visibility Not Updating Home

```typescript
// In home screen, ensure NexoraContext is reading moduleVisibility:
const { moduleVisibility } = useNexora();

// And rendering conditionally:
{moduleVisibility?.sport && <SportsSection />}
```

### Countdown Timer Not Updating

```typescript
// FreeUnlockModal uses a 1-second interval, check if:
// 1. Modal is visible (useEffect depends on [visible])
// 2. State is loaded (not null)
// 3. Not unlocked already (useEffect depends on [unlocked])
```

---

## 📝 ADDITIONAL NOTES

### Code Quality

All components follow:
- TypeScript strict mode
- React.memo optimization (where appropriate)
- Proper cleanup of intervals/timers
- Error boundaries for robustness
- Accessible touch targets (hitSlop)
- Keyboard-aware inputs

### Performance Considerations

- Settings hub uses horizontal ScrollView (optimized)
- Modals overlay parent (don't affect parent re-renders)
- AsyncStorage calls memoized with useCallback
- No unnecessary re-renders (proper dependencies)

### Browser Support

- Native iOS & Android only
- React Native + Expo
- No web version included

---

**End of Implementation Guide**
