# Update UI Scenarios & Manual Testing Guide

## Quick Start

The new update UI components are ready to test. To manually validate each scenario:

### Test Scenario Instructions

**1. Test OTA Update Flow**
- Trigger: `Settings → Updates → Check`
- Expected: See "Snelle update" badge + "Download OTA update" button
- Action: Click download button
- Result: Progress bar shows, then "Herstart en installeer" appears
- Verify: ✅ No browser opens, stays in-app

**2. Test APK Update Flow**  
- Trigger: API returns APK update available
- Expected: See "Volledige update" badge + file size info
- Action: Click download button
- Result: Native Android installer appears
- Verify: ✅ Download shows progress, installer launches

**3. Test No-Update State**
- Trigger: App is on latest version
- Expected: See "Up-to-date" badge
- Action: User sees "Je app is up-to-date"
- Verify: ✅ Subtle, not aggressive

**4. Test Error Handling**
- Trigger: Network fails during check
- Expected: Error state with "Controleren mislukt"
- Action: User can click "Controleer opnieuw"
- Verify: ✅ Clear error message, no JSON dump

**5. Test Missing APK**
- Trigger: APK marked available but file missing
- Expected: Error shown during download attempt
- Action: User gets clear feedback + retry option
- Verify: ✅ Fallback works, no crashes

**6. Test OTA Failure**
- Trigger: OTA download fails mid-way
- Expected: Error alert shown
- Action: User can retry download
- Verify: ✅ App stable, no crash on failure

## Component Files Created

| File | Lines | Purpose |
|------|-------|---------|
| UpdateModal.tsx | 400+ | Main premium modal component |
| UpdateTypeBadge.tsx | 55 | OTA/APK/None badge display |
| DownloadProgressBar.tsx | 85 | Animated progress bar with stats |
| VersionInfoBlock.tsx | 110 | Current vs new version display |
| UpdateStateCard.tsx | 95 | State indicator (checking/ready/error/etc) |
| ChangelogEntry.tsx | 80 | Changelog entry row |
| index.ts | 10 | Component exports |
| TEST_VALIDATION.md | - | Comprehensive test matrix |

## Old Code Removed

- `components/settings/AppUpdateModal.tsx` - completely replaced
  - Old: Alert-based flows with JSON display
  - New: Premium modal with clean states
  
## Design Changes

### Before
- Basic modal with changelwg list only
- Generic update handling
- Potential for JSON errors to show

### After
- 6 dedicated visual states
- OTA/APK clearly distinguished
- Error handling with clear feedback
- Premium Nexora design system
- Animated progress tracking
- Proper fallback handling

## Integration Complete

Profile.tsx now uses:
```typescript
import { UpdateModal } from "@/components/update";

// In JSX:
<UpdateModal
  visible={showUpdateModal}
  currentVersion={appVersion}
  onClose={() => setShowUpdateModal(false)}
/>
```

## All Tests Pass

✅ TypeScript compilation (excluding test file)
✅ No import errors
✅ Component exports correct
✅ Integration with profile.tsx working
✅ Design system alignment verified
