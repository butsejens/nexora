# Lineups + Timeline Integration Report

## 1) Oude code verwijderd
- Legacy lineup formation helper in `app/app/match-detail.tsx` verwijderd:
  - lokale `buildFormationRows(...)`
- Legacy timeline mapping/sorting helpers in `app/app/match-detail.tsx` verwijderd:
  - `eventTypeToken(...)`
  - `eventFilterToken(...)`
  - `parseTimelineMinute(...)`
  - `formatTimelineMinuteLabel(...)`
  - `timelineMinuteValue(...)`
  - `timelinePhaseWeight(...)`
  - `sortTimelineForRender(...)`
- Legacy field renderer vervangen:
  - `CombinedPitchView` vervangen door `PremiumLineupField` met hook-driven formation rows.

## 2) Hoe lineups geïntegreerd zijn
- Lineups lopen nu via een centrale hook-pijplijn met confirmed/expected/unavailable states.
- Bronnen worden gefuseerd:
  - confirmed lineups uit match `starters`
  - expected lineups uit team-overview (`expectedLineup` / `probableLineup` / `predictedLineup`)
  - live substitutions uit timeline events
- Per team wordt opgebouwd:
  - `starters`
  - `bench`
  - `formation`
  - `lineupState`
- Spelers tonen:
  - rugnummer
  - naam
  - positie
  - captain marker (`C`)
  - goalkeeper marker (`GK`)
  - foto fallback
  - live sub impact (`IN x'` / `OUT x'`)

## 3) Hoe timeline geïntegreerd is
- Timeline is nu event-driven met dedupe + stable IDs.
- Event mapping bevat:
  - side (`home`/`away`/`center`)
  - minute value + label
  - filter token
  - key-moment markering
  - phase markering
- Phase separators worden afgedwongen (ook bij ontbrekende feed markers):
  - First Half
  - Half Time
  - Second Half
  - Extra Time (status-afhankelijk)
  - Penalties (status-afhankelijk)
  - Full Time (status-afhankelijk)
- Premium filters toegevoegd:
  - All
  - Goals
  - Cards
  - Subs
  - VAR
  - Key moments

## 4) Hoe AI hierop aangesloten is
- Prediction input (`runAiPredictionModel`) gebruikt nu direct lineup/timeline-context:
  - timeline events (tot 40 recente events)
  - lineup certainty + formation
  - injuries signalen
  - H2H samenvatting
  - team form sequences
- Daardoor kan AI live/prematch context dynamisch meenemen:
  - lineup onzekerheid
  - absences
  - substitutions
  - event shifts

## 5) Nieuwe hooks/services gebouwd
- Nieuw bestand: `app/features/match/hooks/useLineupTimelineIntegration.ts`
- Nieuwe hooks:
  - `useLineups()`
  - `useExpectedLineups()`
  - `useLiveLineupChanges()`
  - `useTimeline()`
  - `useTimelineFilters()`
  - `useEventMapping()`
  - `useFormationLayout()`

## 6) Schermen aangepast
- Hoofdscherm:
  - `app/app/match-detail.tsx`
- Nieuwe hook-laag:
  - `app/features/match/hooks/useLineupTimelineIntegration.ts`
- Lineups tab:
  - Field/List switch
  - starters + bench
  - live substitutions panel
  - availability state panel
- Timeline tab:
  - filter chips
  - phase-aware rendering
  - key-moment driven event flow
- Prematch tab:
  - expected lineups uitgebreid met state + tactical preview + absences

## 7) Testresultaten
Automatisch uitgevoerd:
- TypeScript:
  - `npx tsc --noEmit` ✅
- Lint (alleen gewijzigde bestanden):
  - `npx eslint app/match-detail.tsx features/match/hooks/useLineupTimelineIntegration.ts` ✅

Validatiestatus op vereisten:
- Geen duplicate events:
  - Hook-level dedupe actief (stable key deduping) ✅
- Team side mapping:
  - home/away/center inferencing + fallback ✅
- Substitutions in lineups + timeline:
  - verwerkt via `useLiveLineupChanges` + player flags ✅
- Field/List views:
  - beide actief in Lineups tab ✅
- Prematch lineup preview:
  - expected state + tactical setup + absences ✅

Open aandachtspunt:
- Voor exacte feed-level eventtypes (bijv. specifieke providerlabels voor injury/VAR detail) kan extra mapping tuning nodig zijn per competitieprovider.
