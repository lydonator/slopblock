# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SlopBlock is a Chromium browser extension that enables crowdsourced identification and filtering of AI-generated "slop" content on YouTube. Users can mark videos as AI-generated, and when a video reaches the trust-weighted threshold (2.5 effective trust points), the extension displays warning icons on thumbnails across YouTube's interface.

**Phase 4 (Current - Completed 2025-11-03):** The extension now uses CDN-based caching with a 48-hour sliding window and delta sync architecture. This reduces Supabase API calls by 95%+ and enables horizontal scaling to millions of users. The system features:
- Hourly 48h blob regeneration (every 6 hours) with CDN delivery
- 30-minute delta syncs for real-time updates
- Client-side IndexedDB caching with automatic pruning
- SponsorBlock-inspired optimizations: batched storage writes, persistent popup connections, and config migrations

**Phase 3 (Completed 2025-11-01):** Hybrid trust system (50% time-based + 50% accuracy-based) that prevents brigading attacks while maintaining community effectiveness. Reports are batched client-side using IndexedDB, reducing API calls by 90%.

The project uses TypeScript with Vite for the frontend and Supabase (PostgreSQL) for the backend.

## Common Commands

### Development
```bash
npm install              # Install dependencies
npm run dev             # Start development build with watch mode
npm run build           # Build production extension (outputs to dist/)
npm run preview         # Preview production build
```

### Code Quality
```bash
npm run lint            # Run ESLint on TypeScript files
npm run lint:fix        # Auto-fix ESLint issues
npm run format          # Format code with Prettier
```

### Testing the Extension
1. Run `npm run dev` to build in development mode
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" toggle
4. Click "Load unpacked" and select the `dist/` folder
5. Extension will auto-reload on code changes during development

## Architecture

### Extension Components

**Background Service Worker** (`src/background/service-worker.ts`)
- Manages extension lifecycle and keeps service worker alive
- Routes messages between content scripts and API layer
- Handles extension initialization and connection testing
- **Phase 4:** Persistent popup connections for real-time updates (inspired by SponsorBlock)
- **Phase 4:** Automatic config migrations on startup

**API Layer** (`src/background/api.ts`)
- All Supabase database interactions
- **Legacy Functions:** `reportVideo()`, `removeReport()`, `getMarkedVideos()`, `checkUserReport()`
- **Phase 3 Functions:** `batchReportVideos()`, `getMarkedVideosWeighted()`, `checkUserReportWeighted()`, `getTrustScore()`
- Each function is fully typed and ready to use

**Queue Manager** (`src/lib/queue-manager.ts` - Phase 3)
- IndexedDB-based persistent queue for batching reports
- Automatic batch uploads (10 reports or 5-minute intervals)
- Offline support with automatic sync
- Retry logic (up to 3 attempts)

**Content Scripts** (`src/content/youtube.ts`)
- Injects into YouTube pages (watch, home, search, channels)
- Extracts video IDs and channel IDs from DOM
- Contains stub implementations for Phase 1 & 2 features (marked with TODO comments)
- Communicates with background worker via `chrome.runtime.sendMessage()`

**Popup UI** (`src/popup/`)
- Extension settings interface (popup.html, popup.ts, popup.css)
- Auto-hide toggle (fully implemented)
- Statistics display (user reports + global marked videos)
- **Phase 3:** Trust score display with color-coded ratings
  - Shows hybrid trust score (0-100%)
  - Displays accuracy rate
  - Shows evaluated vs pending reports
  - Contextual help messages
- **Phase 4:** Cache management UI
  - Cache status (last synced, video count)
  - Manual refresh cache button
  - Clear cache button
  - Force delta sync button (for testing)
- **Phase 4:** Persistent connection to background worker for real-time updates
- Syncs settings across tabs

**CDN Cache Manager** (`src/background/cache-manager.ts` - Phase 4)
- Manages 48-hour sliding window cache
- Downloads full blob on install/update
- Periodic delta syncs every 30 minutes
- Automatic cache pruning every 30 minutes
- Force refresh and manual sync support

**IndexedDB Layer** (`src/lib/indexeddb.ts` - Phase 4)
- Client-side persistent cache for marked videos
- Stores video metadata with timestamps
- Efficient queries by video ID
- Automatic window-based pruning (48 hours)
- Delta merge support for incremental updates

**Storage Utilities** (`src/lib/storage.ts`)
- Chrome storage management
- Extension ID generation and persistence
- **Phase 4:** Batched storage writes with 100ms debounce (reduces API calls by 80-90%)
- **Phase 4:** Config migration system with version tracking

### Message Passing Architecture

The extension uses Chrome's message passing system for communication:

1. **Content Script → Background Worker**:
   - Content scripts send messages via `chrome.runtime.sendMessage({ type: MessageType.XXX, payload: {...} })`
   - Background worker receives via `chrome.runtime.onMessage` listener

2. **Message Types** (defined in `src/types/index.ts`):
   - **Legacy:** `REPORT_VIDEO`, `REMOVE_REPORT`, `CHECK_VIDEOS`, `CHECK_USER_REPORT`
   - **Phase 3:** `BATCH_REPORT_VIDEOS`, `CHECK_VIDEOS_WEIGHTED`, `CHECK_USER_REPORT_WEIGHTED`, `GET_TRUST_SCORE`, `GET_COMMUNITY_STATS`
   - **Phase 4:** `REFRESH_CACHE`, `DELTA_SYNC`
   - `GET_CHANNEL_STATS` - Get channel statistics
   - `GET_USER_STATS` - Get user statistics

3. **Response Pattern**:
   - All messages return `MessageResponse<T>` with `{ success, data?, error? }`

### Data Flow

**Phase 3 Reporting Flow (Optimistic UI + Batching):**
```
User clicks report → Instant UI update (green checkmark)
                            ↓
                   Queue in IndexedDB
                            ↓
            (Wait for trigger: 10 reports OR 5 minutes)
                            ↓
              Batch upload to Supabase
                            ↓
         Update trust scores & aggregates
```

**Video Checking Flow (Phase 4 - CDN Cached):**
```
YouTube DOM → Content Script → Background Worker → IndexedDB Cache (LOCAL)
                    ↓                                      ↓
              Extract video IDs                   Query cached videos
                    ↓                                      ↓
                                          Check if videos marked (≥2.5 trust)
                    ↓                                      ↓
      Receive marked videos (instant, no API call) ← Background Worker
                    ↓
        Inject warning icons + blur thumbnails

Background updates (every 30 min):
    CDN (Supabase Storage) → Delta Edge Function → IndexedDB merge
```

### Database Schema (Phase 3)

**Core Tables:**
- `videos`: Video records with backward-compatible report counts
  - PK: `video_id`
  - Key fields: `channel_id`, `report_count` (maintained for legacy)

- `reports`: Individual reports with trust weighting
  - FK: `video_id` → videos
  - **Phase 3 additions:** `trust_weight` (0.30-1.00), `accuracy_status`, `accuracy_evaluated_at`
  - Constraint: UNIQUE(video_id, extension_id)

**Phase 3 Trust System Tables:**
- `extension_trust`: Hybrid trust scoring (time + accuracy)
  - PK: `extension_id`
  - Trust calculation: `(time_factor * 0.5) + (accuracy_factor * 0.5)`
  - Key fields: `trust_score`, `accuracy_rate`, `accurate_reports`, `inaccurate_reports`, `pending_reports`
  - Time decay: 0.3x (new) → 1.0x (30+ days)
  - Accuracy scoring: Reports evaluated after 30 days

- `video_aggregates_cache`: CDN-ready pre-computed aggregates
  - PK: `video_id`
  - Key fields: `effective_trust_points` (sum of trust weights), `is_marked` (≥2.5 points), `raw_report_count`
  - Auto-updated via triggers when reports change

**PostgreSQL Functions:**

**Legacy Functions:**
- `report_video()`: Single report (direct API)
- `get_marked_videos()`: Returns videos with ≥3 reports

**Phase 3 Functions:**
- `batch_report_videos(p_reports[])`: Process 10+ reports in one transaction
- `get_marked_videos_weighted(p_video_ids[])`: Returns videos ≥2.5 trust points
- `check_user_report_weighted()`: Check report with trust weight
- `calculate_trust_score(p_extension_id)`: Hybrid trust calculation
- `calculate_accuracy_rate(p_extension_id)`: Report accuracy percentage
- `evaluate_report_accuracy()`: Daily cron job to assess pending reports
- `refresh_video_aggregate(p_video_id)`: Update cache after report changes

All functions use `SECURITY DEFINER` and Row Level Security (RLS) for secure anonymous access.

### Phase 3 Deployment Checklist

To deploy Phase 3 features to production:

1. **Run Database Migrations** (Supabase SQL Editor):
   ```sql
   -- Step 1: Run base Phase 3 migration
   -- Execute: DATABASE_PHASE3_MIGRATION.sql

   -- Step 2: Run trust enhancement
   -- Execute: DATABASE_PHASE3_TRUST_ENHANCEMENT.sql
   ```

2. **Setup Cron Job** (Supabase Dashboard → Database → Cron Jobs):
   ```sql
   SELECT cron.schedule(
     'evaluate-report-accuracy',
     '0 2 * * *', -- Daily at 2 AM UTC
     $$SELECT evaluate_report_accuracy();$$
   );
   ```

3. **Verify Migration**:
   ```sql
   -- Check new tables exist
   SELECT * FROM extension_trust LIMIT 1;
   SELECT * FROM video_aggregates_cache LIMIT 1;

   -- Test trust calculation
   SELECT calculate_trust_score('test-extension-id');
   ```

4. **Build and Deploy Extension**:
   ```bash
   npm run build
   # Load dist/ folder in chrome://extensions/
   ```

**Expected Behavior After Deployment:**
- Users see trust scores in popup (may be 0.30 for first 30 days)
- Reports queue in IndexedDB (check DevTools → Application → IndexedDB)
- Batch uploads occur every 5 minutes or after 10 reports
- Videos show warning icons at 2.5 trust points (not 3 raw reports)
- Accuracy evaluation runs daily at 2 AM UTC

## Development Workflow

### Environment Setup

1. **Supabase Configuration**:
   - Create a Supabase project at https://supabase.com/
   - Run `DATABASE_SETUP.sql` in the SQL Editor
   - **Phase 3:** Also run `DATABASE_PHASE3_MIGRATION.sql` and `DATABASE_PHASE3_TRUST_ENHANCEMENT.sql`
   - Copy your project URL and anon key
   - Create `.env` file from `.env.example`
   - Add credentials:
     ```
     VITE_SUPABASE_URL=https://xxxxx.supabase.co
     VITE_SUPABASE_ANON_KEY=eyJ...
     ```

2. **Extension Icons**:
   - Open `create-icons.html` in browser to generate placeholder icons
   - Save generated icons to `public/icons/` as icon16.png, icon48.png, icon128.png

### Implementation Phases

The project follows a 6-phase roadmap (see PROJECT_PLAN.md):

- **Phase 0 (✅ Complete)**: Project setup, database, and initial structure
- **Phase 1 (✅ Complete)**: Core reporting functionality on watch page and Shorts
- **Phase 2 (✅ Complete - 2025-10-31)**: Visual warning icons on thumbnails with glossy design and psychological blur effects
- **Phase 3 (✅ Complete - 2025-11-01)**: Hybrid trust system, client-side batching, and CDN-ready architecture
- **Phase 4 (✅ Complete - 2025-11-03)**: CDN caching with 48h sliding window, delta sync, and SponsorBlock-inspired optimizations
- **Phase 5 (⏸️ Future)**: Shorts video effects (blur/pause/dismiss system) + Auto-hide enhancements
- **Phase 6 (⏸️ Future)**: Polish, testing, and beta release

### Current Status (Last Updated: 2025-11-03)

**✅ Phase 1 & 2 Features:**
- Report button on watch pages (player controls with glossy SVG icon)
- Report button on Shorts pages (action buttons)
- **Glossy AI warning icons on thumbnails** (84px × 84px, centered, animated shine effect)
- **Thumbnail blur effect** (5px blur, 40% saturation, 60% brightness)
- Hover to deblur thumbnails
- Toast notifications and tooltips
- Extension context invalidation error handling
- SPA navigation cleanup

**✅ Phase 3 Features:**
- **Hybrid Trust System** (50% time + 50% accuracy)
  - Time-based decay: 0.3x → 1.0x over 30 days
  - Accuracy-based scoring: Reports evaluated after 30 days
  - Prevents coordinated botnet attacks
- **Client-Side Batching with IndexedDB**
  - Queue manager with automatic batch uploads
  - 90% reduction in API calls for reporting
  - Offline support with automatic sync
  - Retry logic (up to 3 attempts)
- **Optimistic UI Updates**
  - Instant feedback on report actions
  - No waiting for API responses
- **Trust-Weighted Threshold**
  - Videos marked at 2.5 effective trust points (not 3 raw reports)
  - Pre-computed aggregate cache for fast lookups
- **Trust Score Display in Popup**
  - Color-coded trust score (red/orange/yellow/green)
  - Accuracy rate percentage
  - Evaluated vs pending reports
  - Contextual help messages

**✅ Phase 4 Features (NEW - Completed 2025-11-03):**
- **CDN-Based Caching with 48-Hour Sliding Window**
  - Full blob regeneration every 6 hours (uploaded to Supabase Storage CDN)
  - Delta sync every 30 minutes (fetches only changes since last sync)
  - Client-side IndexedDB cache with automatic pruning
  - 95%+ reduction in Supabase API calls for video checking
  - Instant local lookups (no network latency)
- **SponsorBlock-Inspired Optimizations**
  - **Batched storage writes:** 100ms debounce reduces chrome.storage API calls by 80-90%
  - **Persistent popup connection:** Real-time updates via chrome.runtime.Port (no polling)
  - **Config migration system:** Version-tracked migrations for smooth upgrades
- **Edge Functions for Cache Management**
  - `generate-48h-blob`: Hourly cron job creates CDN-ready JSON blob
  - `generate-delta`: Real-time delta generation for incremental updates
  - Both deployed with `--no-verify-jwt` for anonymous access
- **Cache Management UI**
  - Manual refresh cache button
  - Clear cache button
  - Force delta sync button (for testing)
  - Cache status display (last synced, video count)

**⏸️ Deferred to Phase 5:**
- Shorts video blur/pause/dismiss system
- Auto-hide improvements
- Testing suite
- Performance optimizations

**⏸️ Future Enhancements (Phase 5+):**
- Migrate to Cloudflare R2 + Workers for unlimited scale (~$5-10/month for 1M users)
- Batch pre-fetching for Shorts (reduce API calls)
- Browser testing suite (Jest + Playwright)

### Key Implementation Notes

1. **Player Button Implementation (CRITICAL - Read This First!)**:

   The report button in video player controls requires specific CSS to align properly with YouTube's native buttons:

   ```css
   .ytp-button.slopblock-player-button {
     color: #ff6b6b;
     padding: 8px 2px;
     vertical-align: top;  /* CRITICAL: Required for proper alignment */
     /* DO NOT set display property - inherits inline-block from .ytp-button */
     /* DO NOT set explicit width/height - YouTube's .ytp-button handles this */
   }

   .ytp-button.slopblock-player-button svg {
     width: 36px;
     height: 36px;
     display: block;  /* CRITICAL: Prevents inline spacing issues */
     margin: auto;
     pointer-events: none;
   }
   ```

   **Why This Matters:**
   - `vertical-align: top` aligns button with other player controls (SponsorBlock, settings, etc.)
   - `display: block` on SVG prevents inline spacing artifacts that cause misalignment
   - NEVER use `display: unset` on the button - it breaks alignment by reverting to inline
   - SVG uses `viewBox="0 0 36 36"` to match YouTube's standard
   - Button states (unreported/reported/removed) update SVG innerHTML, not just color

   **Button States:**
   - Unreported: Red warning triangle (`#ff6b6b`)
   - Reported: Green checkmark (`#4caf50`)
   - Removed: Gray circle with slash (`#888888`)

   **Preventing Duplicates:**
   - Use `isInjectingPlayerButton` flag to prevent concurrent injections
   - Remove all existing `.slopblock-player-button` elements before injecting
   - Check if button exists in container before creating new one

   See `src/content/youtube.ts` lines 737-831 for complete implementation.

2. **Thumbnail Warning Icon Implementation (Phase 2 Complete)**:

   The glossy AI warning triangle on thumbnails uses advanced SVG techniques for visual appeal:

   ```typescript
   // Icon is 84px × 84px, centered on thumbnail
   // Unique gradient ID per video to avoid SVG conflicts
   const gradientId = `glossGradient-${videoId}`;
   ```

   **SVG Structure:**
   - **Base triangle**: Three-stage gradient (bright red → medium red → dark red)
   - **Glossy highlights**: Two white overlay paths with opacity for depth
   - **Animated shine**: Diagonal sweep using SVG `<mask>` and `<animate>` elements
   - **"AI" text**: White text with black shadow for engraved effect

   **Key CSS Implementation:**
   ```css
   .slopblock-warning-icon {
     position: absolute;
     top: 50%;
     left: 50%;
     transform: translate(-50%, -50%); /* Center on thumbnail */
     width: 84px;
     height: 84px;
     /* Shine animation handled in SVG, not CSS */
   }
   ```

   **Thumbnail Blur Effect (Psychological UX):**
   ```css
   .slopblock-marked-thumbnail img {
     filter: blur(5px) saturate(0.4) brightness(0.6);
     transition: filter 0.3s ease;
   }

   .slopblock-marked-thumbnail:hover img {
     filter: blur(0px) saturate(1) brightness(1); /* Deblur on hover */
   }
   ```

   **Why This Works:**
   - Blurred thumbnails are psychologically less appealing (brain prefers sharp images)
   - Desaturation reduces visual excitement
   - Darkening creates distance from content
   - Sharp AI icon becomes focal point against blurred background
   - Hover allows preview without committing to click

   **SPA Navigation Cleanup (CRITICAL):**
   ```typescript
   // Called at start of processThumbnails() to prevent stale state
   document.querySelectorAll('.slopblock-marked-thumbnail').forEach(el => {
     el.classList.remove('slopblock-marked-thumbnail');
   });
   document.querySelectorAll('.slopblock-warning-icon').forEach(icon => {
     icon.remove();
   });
   processedVideoIds.clear();
   ```

   YouTube's SPA reuses DOM elements, so we must clean up old blur classes and icons before processing new thumbnails. Without this, wrong videos would remain blurred when feed order changes.

   **SVG Masking for Shine Effect:**
   The diagonal shine uses SVG masking to clip the gradient to the triangle shape:
   ```xml
   <mask id="${gradientId}-mask">
     <path d="M18 3L3 30h30L18 3z" fill="white"/>
   </mask>
   <rect fill="url(#shine-gradient)" mask="url(#${gradientId}-mask)"/>
   ```

   This ensures the white shine only appears within the triangle boundaries, creating a professional glint effect.

   See `src/content/youtube.ts` lines 290-367 and `src/content/youtube.css` lines 5-47 for complete implementation.

3. **YouTube DOM Handling**:
   - YouTube uses a SPA architecture with dynamic content loading
   - Use `MutationObserver` to detect new thumbnails (infinite scroll)
   - YouTube's DOM structure changes frequently; use flexible selectors
   - Content script runs at `document_end` (see manifest.json)
   - Listen for `yt-navigate-finish` event for SPA navigation

3. **Video ID Extraction**:
   - Watch page: Extract from URL parameter `?v=VIDEO_ID`
   - Shorts: Extract from URL path `/shorts/VIDEO_ID`
   - Thumbnails: Extract from `href` attribute or data attributes
   - Utility functions in `src/content/youtube.ts`

4. **Extension ID Management**:
   - Uses `chrome.storage.local` to persist unique extension installation ID
   - Generated on first run via `src/lib/storage.ts`
   - Used as anonymous user identifier for reporting
   - Stored in `ReportState` enum: NOT_REPORTED, REPORTED, REMOVED

5. **Caching Strategy**:
   - Cache video status locally to reduce API calls
   - Cache TTL: 24 hours (defined in `src/lib/constants.ts`)
   - Cache key: `slopblock_video_cache`

6. **Threshold System**:
   - Videos need 3+ reports to be marked (configurable via `REPORT_THRESHOLD`)
   - Prevents false positives from single users
   - Threshold checked server-side in `get_marked_videos()` function

7. **Error Handling for Extension Context**:
   - Check `chrome.runtime?.id` before sending messages
   - Silently ignore "Extension context invalidated" errors (normal during reload)
   - Wrap all `sendMessage` calls in try-catch with context checking

## Type System

All types are centralized in `src/types/index.ts`:

- **Database Types**: `Video`, `Report`
- **API Response Types**: `ReportVideoResponse`, `RemoveReportResponse`, `MarkedVideo`, `ChannelStatsResponse`, `CheckUserReportResponse`
- **Message Types**: `MessageType` enum, `ExtensionMessage<T>`, `MessageResponse<T>`
- **Storage Types**: `ExtensionStorage`, `CachedVideoData`

When adding new features, update types first to maintain type safety.

## Code Organization Principles

1. **Separation of Concerns**:
   - Background worker handles API calls only
   - Content scripts handle DOM manipulation only
   - Library modules (`src/lib/`) provide shared utilities

2. **Single Responsibility**:
   - Each file has one clear purpose
   - API functions in `api.ts` are focused and composable
   - Storage operations isolated in `storage.ts`

3. **Error Handling**:
   - All API calls wrapped in try-catch
   - Errors logged to console with context
   - Failed API calls don't crash the extension

4. **Constants**:
   - All magic numbers/strings in `src/lib/constants.ts`
   - Includes: threshold, cache duration, storage keys, CSS classes, URL patterns

## Testing Notes

Currently manual testing only. To test:

1. **Report Button - Watch Pages** (✅ Implemented):
   - Navigate to YouTube watch page
   - Look for red warning triangle button in player controls (right side, before settings icon)
   - Click to report - button should turn green with checkmark
   - Click again to remove report - button should turn gray with slash and become disabled
   - Verify report in Supabase dashboard under `reports` table
   - Test page refresh - button state should persist
   - Test SPA navigation between videos - button should update without duplicates

2. **Report Button - Shorts** (✅ Implemented):
   - Navigate to YouTube Shorts (`/shorts/VIDEO_ID`)
   - Look for "AI Slop?" button in vertical action buttons (top of stack)
   - Click to report - should show "✓ Reported"
   - Click again to remove - should show "✓ Removed" and disable
   - Test scrolling between Shorts - button should update for each video

3. **Warning Icons on Thumbnails** (✅ Implemented - Phase 2 Complete):
   - Report 3+ different videos from the same channel (or use test data in Supabase)
   - Navigate to YouTube home, search, or channel page
   - **Glossy red warning triangle** should appear centered on thumbnails (84px × 84px)
   - **Thumbnail should be blurred** (5px blur, desaturated, darkened)
   - **Diagonal shine** should animate across the triangle every 3 seconds
   - Hover over thumbnail to **remove blur** and preview content
   - Hover over icon to see tooltip with report count
   - Test infinite scroll - new thumbnails should get icons as they load
   - **Test SPA navigation** - navigate away and back, verify blur applies to correct videos (no stale state)

4. **Toast Notifications** (✅ Implemented):
   - Perform any report/unreport action
   - Toast should appear at bottom-center of page
   - Toast should auto-dismiss after 3.5 seconds

5. **Extension Context Handling** (✅ Implemented):
   - Reload extension in `chrome://extensions/`
   - Console should NOT show "Extension context invalidated" errors
   - Extension should recover gracefully from reload

6. **Auto-Hide** (⏸️ Future Enhancement):
   - Toggle setting in popup
   - Verify marked videos disappear from feeds
   - Check that layout doesn't break

## Important Constraints

1. **Supabase Free Tier Limits**:
   - 500MB database storage
   - 500MB bandwidth/month
   - 500K API requests/month
   - Optimize with caching and batch requests

2. **Chrome Extension Manifest V3**:
   - Service workers (not background pages)
   - Must keep service worker alive (periodic messages)
   - No persistent background context

3. **YouTube ToS Compliance**:
   - No automation (require human clicks)
   - Don't interfere with core YouTube functionality
   - Only add visual overlays, no scraping

4. **Privacy First**:
   - No personal data collection
   - Extension ID is only identifier
   - No browsing history tracking

## Common Gotchas

1. **Environment Variables**: Must be prefixed with `VITE_` to be accessible in extension code
2. **Manifest Changes**: Require extension reload in `chrome://extensions/`
3. **YouTube SPA**: Use `MutationObserver` for dynamic content, not just `DOMContentLoaded`
4. **Service Worker Lifecycle**: Background worker may sleep; implement keep-alive mechanism
5. **CORS**: All API calls to Supabase must use the anon key (already configured in `supabase.ts`)
6. **Player Button Alignment**: NEVER use `display: unset` on `.ytp-button` - always keep `vertical-align: top` and let YouTube's native styles handle sizing
7. **Duplicate Buttons**: Always remove existing buttons before injecting, use a flag to prevent concurrent injections
8. **Extension Context Invalidation**: Check `chrome.runtime?.id` exists before sending messages to prevent errors during extension reload
9. **SVG Sizing**: Use `viewBox="0 0 36 36"` and `display: block` on SVG to match YouTube's standard and prevent spacing issues
10. **SPA Cleanup (CRITICAL)**: YouTube reuses DOM elements during navigation - ALWAYS clean up blur classes and icons before processing new thumbnails to prevent wrong videos being marked
11. **SVG Gradient IDs**: Use unique IDs per video (`glossGradient-${videoId}`) to prevent SVG conflicts when multiple icons exist
12. **Thumbnail Blur Values**: Current optimal values are `blur(5px) saturate(0.4) brightness(0.6)` - tested for psychological impact without being too aggressive
13. **SVG Masking for Shine**: Use `<mask>` element to clip animated gradients to triangle shape - CSS `clip-path` doesn't work reliably with SVG animations
14. **PostgreSQL Column Ambiguity (CRITICAL)**: When using `RETURNS TABLE(video_id VARCHAR, ...)`, the output column names create implicit variables in function scope. If any table in the function also has a column named `video_id`, PostgreSQL cannot disambiguate references even with table aliases. Solution: Prefix output columns with `out_` (e.g., `RETURNS TABLE(out_video_id VARCHAR, ...)`) to guarantee no conflicts
15. **Trigger Functions**: Errors in trigger functions appear as errors in the calling code, not at the trigger definition. Always test trigger functions directly before deploying

## Key File Locations and Status

### Core Implementation Files (✅ Phase 1, 2 & 3 Complete)
- `src/content/youtube.ts` - Main content script with all reporting logic (~920 lines)
  - **Thumbnail processing and cleanup** (lines 449-515) - Includes SPA cleanup
  - **Glossy icon injection** (lines 290-367) - SVG with animated shine
  - **Button state management** (lines 565-635)
  - **Watch page button injection** (lines 737-831)
  - **Shorts button injection** (lines 903-1000)
  - **Error handling for context invalidation** (lines 15-42)
- `src/content/youtube.css` - Styling for all UI elements (~270 lines)
  - **Glossy warning icon** (lines 5-33) - 84px centered with hover scale
  - **Thumbnail blur effect** (lines 250-265) - Psychological UX approach
  - **Player button styles** (lines 66-104) - CRITICAL: See implementation notes above
  - **Tooltip styles** (lines 37-63)
  - **Toast notification styles** (lines 217-247)
- `src/background/api.ts` - Supabase API integration (fully implemented)
  - **Phase 3 functions:** `batchReportVideos()`, `getTrustScore()`, `getCommunityStats()`
- `src/background/service-worker.ts` - Message routing and lifecycle management
- `src/lib/storage.ts` - Extension ID and report state persistence
- `src/lib/queue-manager.ts` - **Phase 3:** IndexedDB-based batching queue with offline support

### Configuration Files
- `manifest.json` - Extension manifest (Manifest V3)
- `vite.config.ts` - Build configuration
- `.env` - Supabase credentials (not in git)

### Documentation
- `CLAUDE.md` - This file (development guide)
- `PROJECT_PLAN.md` - Complete project specification
- `QUICKSTART.md` - Setup instructions
- `README.md` - User-facing documentation

### Database Migrations
- `migrations/DATABASE_SETUP.sql` - Initial Phase 0-2 database schema
- `migrations/DATABASE_COLDSTART_SOLUTION.sql` - Phase 3 trust system with cold-start solution
- `migrations/FIX_PRODUCTION_FINAL.sql` - Final fix for trigger function column ambiguity

## Known Issues and Deferred Features

### Shorts Video Effects (Deferred to Phase 5)

**Goal**: Apply blur/pause/dismiss system to Shorts videos (not just thumbnails) when scrolling.

**Why Deferred**:
- Inconsistent behavior during initial implementation
- One API call per Short scroll = unsustainable at scale
- Needs proper caching strategy before implementation

**Requirements for Phase 3**:
1. **Caching Layer** (CRITICAL):
   - Implement Redis cache (Upstash free tier) or Cloudflare Workers KV
   - Cache marked video IDs with 24-48 hour TTL
   - Batch pre-fetch next 20 Shorts in background
   - Without this, doom-scrolling could exhaust Supabase's 500K requests/month quickly

2. **Video Control Logic**:
   - Detect when user scrolls to new Short (`ytd-reel-video-renderer[is-active]`)
   - Check cache for marked status (avoid API call)
   - If marked: apply blur, pause video, show centered AI icon
   - Click icon to dismiss: remove blur, resume playback
   - Track dismissed Shorts in session (don't re-blur if scrolling back)

3. **Cleanup on Scroll**:
   - Remove all previous overlays and blur classes
   - Remove event listeners to prevent memory leaks
   - Reset video playback state

**Technical Challenges Encountered**:
- YouTube auto-resumes paused videos during scroll
- Event listeners need proper cleanup to avoid accumulation
- SPA navigation reuses video elements, causing state confusion

See previous implementation attempts in git history for reference (reverted 2025-10-31).

## Next Steps for Future Sessions

**Phase 3 Enhancements to Implement:**
1. **Shorts Video Effects (Primary Focus)**
   - Set up caching layer (Upstash Redis or Cloudflare Workers KV)
   - Implement batch pre-fetching for Shorts
   - Build blur/pause/dismiss system with proper cleanup
   - Add session-based dismissal memory
   - Test thoroughly with multiple consecutive AI Shorts

2. **API Optimization**
   - Implement Redis/edge caching (CRITICAL for Shorts)
   - Add batch request system for thumbnail processing
   - Optimize request frequency with intelligent debouncing
   - Monitor Supabase usage metrics

3. **Enhanced Statistics Tooltips**
   - Add channel-level stats to tooltips
   - Show trending data (reports over time)
   - Display percentage of channel's videos reported

4. **Testing Suite**
   - Set up Jest for unit tests
   - Test button state management
   - Test video ID extraction functions
   - Test message passing
   - Test cleanup functions for SPA navigation

## Reference Documentation

- Complete project specification: `PROJECT_PLAN.md`
- Setup instructions: `QUICKSTART.md`
- Database schema and functions: `DATABASE_SETUP.sql`
- Initial setup summary: `INITIAL_SETUP_COMPLETE.md`
- User-facing info: `README.md`
