# NEXORA MEDIA SYSTEM ARCHITECTURE
## 9-Phase Implementation Strategy

**Vision**: "Make movies and series feel like Netflix + Apple TV + TMDB combined"

---

## PHASE 1: MEDIA DATA RECOVERY ✅ (IN PROGRESS)
### Objective
Fix broken detail pages, ensure all TMDB metadata is properly enriched and displayed, add full null-safety.

### Implementation
1. ✅ Enhanced `mapTrendingItem()` in server to include:
   - genreIds (for categorization)
   - productionCompanies (for studio grouping)
   - keywords (for anime detection)
   - originalLanguage (for anime detection)
   - popularity (for trending logic)
   - releaseDate/overview

2. **TODO - Client Side**:
   - Verify VodModuleItem type includes all necessary fields
   - Ensure detail.tsx handles null/undefined gracefully
   - Add optional field assertions in template rendering

### Data Fields Map
```
VodModuleItem {
  id: string;                    // Primary ID
  tmdbId?: number;               // TMDB ID
  type: "movie" | "series";
  title: string;
  poster?: string;               // Poster image
  backdrop?: string;              // Backdrop image
  synopsis?: string;              // Short description
  overview?: string;              // Long description
  year?: string | number;         // Release year
  releaseDate?: string;           // Full release date
  imdb?: string | number;        // IMDb rating
  rating?: string | number;      // TMDB rating
  genre?: string[];              // Genre names
  genreIds?: number[];           // Genre numeric IDs
  keywords?: string[];           // Keywords for context
  originalLanguage?: string;     // Language code
  productionCompanies?: VodCompany[]; // Studios
  runtimeMinutes?: number;       // Duration (movies)
  seasons?: number;              // Season count (series)
  collection?: VodCollectionMeta; // Franchise/collection
}
```

### Success Criteria
- [ ] Detail pages load without null reference errors
- [ ] All metadata fields display properly
- [ ] Images/posters update with fallbacks
- [ ] Mobile and desktop responsive

---

## PHASE 2: AUTO CATEGORIZATION
### Objective
Automatically categorize movies/series using genre, keywords, language, ratings without manual tagging.

### Implementation
- ✅ `categorizeVodItem()` - Multi-criteria categorization
- ✅ `buildCategoryRails()` - Auto-build genre/category rails
- Priority order: Trending > Popular > New Releases > Top Rated > Genre categories > Anime

### Content Rails
- **Trending** (popularity, last 7 days)
- **Popular** (popularity score)
- **New Releases** (release_date recent)
- **Top Rated** (rating ≥ 7.8)
- **By Genre**: Action, Comedy, Drama, Horror, Sci-Fi, Animation, Thriller, Crime, Family, Documentary, Adventure, Romance
- **Anime** (animation genre + Japanese language OR anime keywords)
- **Hidden Gems** (high rating, low popularity)
- **Acclaimed** (8+ rating)

### Success Criteria
- [ ] All media auto-categorized into ≥1 rail
- [ ] No "Uncategorized" items
- [ ] Rails ordered by priority
- [ ] Anime detected correctly (anime-oriented content)

---

## PHASE 3: COLLECTION/FRANCHISE SYSTEM
### Objective
Detect and organize movie franchises and collections (Star Wars, Harry Potter, MCU, etc).

### Implementation
- ✅ Primary detection: TMDB `collection` field → `VodCollectionMeta`
- ✅ Fallback detection: Title-based franchise matching (franchise_fallbacks)
- ✅ `buildCollectionGroups()` - Sort collections chronologically (OLD→NEW)
- Create collection detail pages

### Collection Features
- Collection card showing:
  - Collection banner/poster
  - Title (e.g. "Star Wars Collection")
  - Item count (e.g. "9 titles")
  - Year range (e.g. 1977-2023)
- Collection page showing:
  - All items in franchise
  - Chronological order (release date)
  - Watch progress per item

### Franchises to Detect
- Star Wars (from TMDB collection_id)
- Harry Potter / Fantastic Beasts
- Fast & Furious
- Lord of the Rings / The Hobbit
- Mission: Impossible
- John Wick
- Marvel (via production company AND keywords)
- DC Extended Universe
- James Bond
- Back to the Future
- Indiana Jones
- Shrek

### Success Criteria
- [ ] Collection detection working via TMDB collection_id
- [ ] Fallback franchise detection working
- [ ] Collections sorted chronologically
- [ ] Collection detail pages implemented

---

## PHASE 4: STUDIO SYSTEM
### Objective
Identify, organize, and browse by studio (Marvel Studios, Pixar, Disney, Warner Bros, etc).

### Implementation
- ✅ Studio extraction from `productionCompanies`
- ✅ `buildStudioGroups()` - Group by studio name
- Deduplication logic (Disney vs. Walt Disney Pictures vs. Pixar)
- Studio logo resolution

### Studio Features
- **Studio Cards** showing:
  - Studio logo (from TMDB or placeholder)
  - Studio name
  - Title count
- **Studio Pages** showing:
  - Studio branding
  - All titles by studio
  - Sorted by year (newest first)

### Key Studios
Priority: Marvel Studios, Pixar, Disney, Warner Bros, Universal, DreamWorks, Paramount, Columbia, Legendary, Netflix, HBO, Apple TV+

### Success Criteria
- [ ] Studios properly extracted from production_companies
- [ ] Logo images loading or fallback rendering
- [ ] Studio deduplication working (no duplicates of same studio)
- [ ] Studio pages functional

---

## PHASE 5: HOME CONTENT STRUCTURE
### Objective
Build premium home page with trending, collections, studios, categories, and personalization.

### Home Page Layout
```
┌─ Featured Hero ─────────────────────────┐
│ Large backdrop + title + play button     │
├─ Continue Watching ─────────────────────┤
│ Horizontal cards with resume position    │
├─ Recommended For You ────────────────────┤
│ Smart picks based on mood/watch history  │
├─ Trending Now ──────────────────────────┤
│ Trending movies + TV shows               │
├─ Top Collections ────────────────────────┤
│ Star Wars, Harry Potter, Marvel, etc     │
├─ Featured Studios ──────────────────────┤
│ Marvel, Pixar, Disney, Warner Bros, etc  │
├─ By Genre ──────────────────────────────┤
│ Action, Comedy, Drama, Horror, etc       │
└─ New Releases ──────────────────────────┘
```

### VodModuleHub Enhancements
- ✅ Home pane: multi-section scrollable view
- ✅ Search pane: unified search + filters
- ✅ More pane: additional categories

### Success Criteria
- [ ] Home scrolls smoothly with multiple sections
- [ ] Pull-to-refresh loads new content
- [ ] Links to detail pages working
- [ ] Collections/studios clickable

---

## PHASE 6: WATCHLIST/HISTORY/CONTINUE WATCHING
### Objective
Fix duplication issues, implement smart sorting, enable resume functionality.

### WatchedItem Structure
```typescript
interface WatchedItem {
  id: string;
  contentId?: string;
  type: "movie" | "series" | "channel" | "sport";
  title: string;
  progress?: number;           // 0-1 (percentage)
  lastWatched: string;         // ISO date
  poster?: string;
  backdrop?: string;
  currentTime?: number;        // Seconds into playback
  totalDuration?: number;      // Total seconds
  season?: number;             // Current season (series)
  episode?: number;            // Current episode (series)
  episodeTitle?: string;
}
```

### Features
1. **Continue Watching**
   - Prioritize incomplete videos
   - Show resume time
   - Sort by most recent
   - Limit to 6-10 items

2. **Watch History**
   - All watched items
   - Smart sorting (recent first)
   - Last 50 items stored

3. **Deduplication Fix**
   - Prevent duplicate entries
   - Update existing entry on re-watch
   - Clear progress on deletion

4. **Favorites/Watchlist**
   - Toggle favorite status
   - Persist in AsyncStorage
   - Show on favorites screen

### Success Criteria
- [ ] No duplicate history entries
- [ ] Continue watching shows resume position
- [ ] History persists across app restarts
- [ ] Deletion removes entry permanently

---

## PHASE 7: MEDIA AI/RECOMMENDATIONS
### Objective
Context-based recommendations showing "because you watched X", genre-based, collection-based, studio-based picks.

### Recommendation Types
1. **Because You Watched**
   - Same genre as watched item
   - Same studio as watched item
   - Same collection as watched item
   - Related keywords/themes

2. **Mood-Based**
   - Fun / Comedy mood
   - Binge mood (series)
   - Action mood
   - Relaxing mood
   - Thriller mood

3. **Trending/Popular**
   - This week's trending
   - Similar to your watchlist
   - Newly released content
   - Hidden gems for you

### Implementation (Client)
- ✅ `buildMoodRecommendations()` - Mood-based picks
- ✅ `createContinueWatching()` - Resume tracking
- Enhance with context awareness messages
- Fallback to trending if no history

### Success Criteria
- [ ] Recommendations show personalized reasons
- [ ] Mood detection working
- [ ] Fallback to trending when needed
- [ ] No stale recommendations

---

## PHASE 8: MEDIA SEARCH INPUTS
### Objective
Unified search across movies, TV shows, anime, cast/crew, studios, collections.

### Search Scopes
- **Movies** - By title, year, genre
- **TV Shows** - By title, year, genre  
- **Anime** - Japanese animation series
- **Actors/Crew** - Search cast members
- **Studios** - Search by production company
- **Collections** - Search franchises

### Search Features
- Fuzzy matching (typo tolerance)
- Real-time suggestions
- Filter by type
- Sort by relevance/date/rating

### Implementation
- ✅ `/api/search/multi` - Movies + TV combined search
- ✅ `/api/search/unified` - Full unified search with filters
- Enhance client-side filtering and display

### Success Criteria
- [ ] Searches respond within 300ms
- [ ] Fuzzy matching working
- [ ] Filters functional
- [ ] No null reference errors

---

## PHASE 9: CLEANUP & VALIDATION
### Objective
Remove broken code, stale logic, and validate all systems working together.

### Cleanup Tasks
- [ ] Remove unused imports
- [ ] Delete dead code branches
- [ ] Fix console warnings/errors
- [ ] Update type definitions
- [ ] Remove test/debug code
- [ ] Optimize re-renders

### Validation Checklist
- [ ] Home page loads in <2s
- [ ] Detail pages errors < 5%
- [ ] Search returns in <500ms
- [ ] No memory leaks on app navigation
- [ ] All media categorized properly
- [ ] Collections sorted chronologically
- [ ] Studios deduplicated
- [ ] Recommendations personalized
- [ ] Watchlist/history persistent
- [ ] No broken links
- [ ] Responsive on all device sizes

### Testing Scenarios
1. **First Use**
   - Fresh app, no history
   - Verify trends show
   - Create watchlist entry
   - Navigate to detail page

2. **Active Watcher**
   - App with full history
   - Verify recommendations show
   - Check continue watching
   - Test search functionality

3. **Collections**
   - Search for franchise (e.g. "Star Wars")
   - Verify chronological order
   - Check all movies present

4. **Studios**
   - Browse by studio
   - Verify deduplication
   - Check logo loading

5. **Connectivity**
   - Test with slow network
   - Verify timeouts handled
   - Check offline fallbacks

---

## Deliverables Checklist

- [ ] 1. Root cause analysis (complete with file locations)
- [ ] 2. Media architecture summary (with type diagrams)
- [ ] 3. Collection/franchise strategy (with implementation)
- [ ] 4. Studio system strategy (with implementation)
- [ ] 5. Categorization strategy (with content rails list)
- [ ] 6. Watchlist/history logic (with deduplication strategy)
- [ ] 7. Recommendation logic (with context types)
- [ ] 8. Changed files list (with diffs)
- [ ] 9. New files list (with complete code)
- [ ] 10. Cleanup summary (with removed code)
- [ ] 11. Validation checklist (with test results)

---

## Code Quality Standards

### TypeScript
- Strict null checking enabled
- All optional fields explicitly marked
- No `any` types
- Proper error handling

### Performance
- Images lazy-loaded
- List virtualization
- Debounced searches
- Cached API responses

### UX
- Loading states for async operations
- Error boundaries with fallbacks
- Haptic feedback on interactions
- Smooth transitions

---

## Key Files Reference

### Server (Node.js)
- `/server/index.js` - API endpoints, TMDB integration, field mapping
  - `mapTrendingItem()` - List item mapping (enhanced ✅)
  - `mapFullDetail()` - Full detail mapping
  - `/api/movies/trending` - Movie lists
  - `/api/series/trending` - Series lists
  - `/api/movies/:id/full` - Movie detail
  - `/api/series/:id/full` - Series detail
  - `/api/search/multi` - Unified search

### Client - Types
- `/app/lib/vod-module.ts` - VodModuleItem types, categorization, collections, studios
  - `VodModuleItem` - Media type
  - `categorizeVodItem()` - Auto-categorization
  - `buildCategoryRails()` - Rails builder
  - `buildCollectionGroups()` - Collection grouper
  - `buildStudioGroups()` - Studio grouper
  - `enrichVodModuleItem()` - Data enrichment

### Client - Components
- `/app/components/vod/VodModuleHub.tsx` - Main media browser
  - Home pane (featured, trending, collections, studios)
  - Search pane (query + filters)
  - More pane (additional categories)

- `/app/app/detail.tsx` - Detail page component
  - Media metadata display
  - Cast/crew information
  - Download/play options
  - Similar media suggestions

### Client - Context
- `/app/context/NexoraContext.tsx` - State management
  - `favorites` - Favorite media
  - `watchHistory` - Watch progress
  - `toggleFavorite()` - Add/remove from favorites
  - `addToHistory()` - Track watch progress

### Client - Services
- `/app/lib/vod-curation.ts` - Recommendations & continue watching
  - `buildMoodRecommendations()` - Mood-based picks
  - `createContinueWatching()` - Resume tracking

---

## Timeline Estimate
- PHASE 1: 1-2 hours (data recovery & null safety)
- PHASE 2: 1 hour (verify categorization works)
- PHASE 3: 1-2 hours (enhance collections)
- PHASE 4: 1-2 hours (enhance studios)
- PHASE 5: 2-3 hours (redesign home)
- PHASE 6: 1-2 hours (fix watchlist logic)
- PHASE 7: 1-2 hours (enhance recommendations)
- PHASE 8: 1 hour (enhance search)
- PHASE 9: 2-3 hours (cleanup & validation)

**Total**: ~12-17 hours of implementation

---

End of MEDIA_SYSTEM_ARCHITECTURE.md
