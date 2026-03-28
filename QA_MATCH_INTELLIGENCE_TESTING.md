# QA Testing Checklist: Match Intelligence Engine

## Overview
This checklist covers QA testing for the new local Match Intelligence engine (`buildGroundedMatchAnalysis`) that replaced the `/api/sports/predict` endpoint.

## Pre-Testing Setup
- [ ] App is running: `npm run app` at least 5 minutes
- [ ] No TypeScript errors affecting match-detail screen
- [ ] No runtime errors in console related to `match-analysis-engine`

## Test Scenarios

### Scenario 1: Prematch Match - Predictions Tab Visible
**Goal**: Verify Match Intelligence engine output displays in prematch state

**Steps**:
1. Navigate to a **prematch match** (status: not started, no live TV)
2. Scroll to the **Predictions ⚡ AI** tab
3. Verify the following panels render:
   - [ ] AI Match Summary (text description of match)
   - [ ] Outcome Probabilities (Home %, Draw %, Away % - should sum to ~100%)
   - [ ] Smart Markets (O/U 1.5/2.5/3.5, BTTS, Clean Sheets, First Team to Score, Double Chance)
   - [ ] Risk Factors (list of risk items, e.g., "Recent form concern", "Defensive injuries")
   - [ ] Confidence Meter (visual gauge 0-100 with label: Low/Medium/High/Elite)

**Expected Results**:
- All panels render without errors
- Confidence label matches range: Low (<55), Medium (55-69), High (69-82), Elite (≥82)
- Market probabilities are between 0-100%
- Outcome probabilities sum close to 100% (may vary by rounding)

---

### Scenario 2: Prematch Match - Premium Unlock
**Goal**: Verify premium unlock CTA and gating works

**Steps**:
1. In the **Predictions ⚡ AI** tab on a prematch match:
2. Scroll to **H2H Stats** section
3. If not premium user:
   - [ ] See "Unlock H2H Stats" or similar premium CTA
   - [ ] Tap CTA to show rewarded ad unlock option
   - [ ] Confirm ad unlock button appears (or paywall if no ad available)
4. If premium user:
   - [ ] H2H section fully visible
   - [ ] No premium CTA shown
   - [ ] Can see team head-to-head record and stats

**Expected Results**:
- Free users see clear premium upgrade path
- Rewarded ad unlock flow triggers correctly
- Premium users see full content without CTAs

---

### Scenario 3: Live Match - Predictions Tab (Minute 15-30)
**Goal**: Verify engine handles live match state

**Steps**:
1. Find a **live match** (status: in progress, minute 15-45)
2. Navigate to **Predictions ⚡ AI** tab
3. Verify same panels as Scenario 1:
   - [ ] AI Match Summary (updated with live context)
   - [ ] Outcome Probabilities (should reflect current score + live stats)
   - [ ] Smart Markets
   - [ ] Risk Factors (should acknowledge live momentum)
   - [ ] **NEW: Live Momentum tab** should be visible
4. Check **Live Momentum** panel:
   - [ ] Shows momentum direction (Favoring Home / Balanced / Favoring Away)
   - [ ] Includes possession % if available
   - [ ] Shows shots on target, dangerous attacks

**Expected Results**:
- All panels render without errors with live data
- Confidence may be lower in live state (due to volatility)
- Momentum indicator reflects actual match dynamics
- Outcome probabilities shift when goals are scored in real-time

---

### Scenario 4: Half-Time Match
**Goal**: Verify engine handles half-time state

**Steps**:
1. Find a **half-time match** (status: halftime, current minute: 45)
2. Navigate to **Predictions ⚡ AI** tab
3. Verify:
   - [ ] All panels render (same as Scenario 3)
   - [ ] Outcome probabilities adjusted for current score
   - [ ] Confidence updated based on first-half data
   - [ ] Live Momentum visible

**Expected Results**:
- Same as Scenario 3
- Outcome probabilities should favor team leading at half-time

---

### Scenario 5: Late-Game Match (Minute 80+)
**Goal**: Verify engine handles high-confidence late-game prediction

**Steps**:
1. Find a **late-game match** (status: in progress, minute 80+)
2. Navigate to **Predictions ⚡ AI** tab
3. Verify:
   - [ ] Outcome probabilities highly skewed toward current leader
   - [ ] Confidence score is HIGH or ELITE (should be >80%)
   - [ ] Risk Factors minimal (less uncertainty)
   - [ ] Live Momentum shows strong trend

**Expected Results**:
- Late-game confidence should be visibly higher than prematch
- Winning team should have >70% win probability in 80+ minute

---

### Scenario 6: Finished Match
**Goal**: Verify predictions tab hidden after match ends

**Steps**:
1. Find a **finished match** (status: final)
2. Check tabs available
3. Verify:
   - [ ] Predictions tab is **not visible** in tab list (or disabled)
   - [ ] Match details still show (lineups, timeline, etc.)

**Expected Results**:
- Predictions only shown for prematch or live matches
- Finished matches show only historical data

---

### Scenario 7: Edge Case - Low Data Coverage
**Goal**: Verify engine gracefully handles missing/incomplete data

**Steps**:
1. Find a **lower-league or obscure match** (e.g., local cup, international friendly)
2. Navigate to **Predictions ⚡ AI** tab
3. Verify:
   - [ ] All panels still render (no crashes)
   - [ ] Confidence score is **LOW** (<55%)
   - [ ] Risk Factors include "Limited data" or similar warning
   - [ ] Market probabilities still compute (even if uncertain)

**Expected Results**:
- Engine gracefully degrades when data is sparse
- Confidence reflects low data certainty
- UI doesn't crash on edge cases

---

### Scenario 8: Type Validation - Console Errors
**Goal**: Verify no TypeScript errors logged at runtime

**Steps**:
1. Open **React Native Debugger** or **Console**
2. Navigate through multiple matches (scenarios 1-7)
3. Monitor console for:
   - [ ] No errors related to `buildGroundedMatchAnalysis`
   - [ ] No undefined property errors on prediction object
   - [ ] No type mismatches on UI bindings

**Expected Results**:
- Clean console (no prediction-related errors)
- All predictions render without runtime type errors

---

## Post-Testing Cleanup

### If All Scenarios Pass:
- [ ] Mark migration as **QA validated**
- [ ] Proceed to legacy component audit (check for orphaned `AIPredictionView`)
- [ ] Prepare release notes documenting:
  - Removed `/api/sports/predict` endpoint
  - New local Match Intelligence engine
  - Premium gating via Nexora context

### If Scenarios Fail:
- [ ] Document which scenario failed
- [ ] Capture console error messages
- [ ] Check `match-analysis-engine.ts` for logic bugs
- [ ] Verify premium unlock state in `useNexora()` context

---

## Known Limitations (Not Bugs)
- **Low confidence on obscure matches**: Expected due to sparse data
- **Sudden probability shifts on goals**: Expected live behavior
- **Different markets for different leagues**: Engine adapts per competition
- **Mobile-specific rendering**: Small screens may wrap long risk factors

---

## Sign-Off
- Tester Name: _______________
- Date: _______________
- All Scenarios Passed: [ ] Yes [ ] No
- Notes: _______________
