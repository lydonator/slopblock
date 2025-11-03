# SlopBlock

> A browser extension for crowdsourced identification and filtering of AI-generated content on YouTube.

SlopBlock helps YouTube users identify and optionally filter AI-generated "slop" content through community-driven reporting with trust-based consensus. Inspired by SponsorBlock's crowdsourced approach, SlopBlock allows users to mark videos as AI-generated and displays visual warnings on thumbnails across YouTube's interface.

---

## Current Status

**Status**: Phase 4 Complete - Production Ready
**Version**: 1.0.0 (Phase 4: CDN Caching + Trust System)
**Platform**: Chromium browsers (Chrome, Edge, Brave, Opera)

**Latest Milestone (2025-11-03)**: CDN-based caching architecture with 48-hour sliding window, delta sync, and SponsorBlock-inspired optimizations. The extension now scales to millions of users with 95%+ reduction in API calls.

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the complete roadmap.

---

## The Problem

YouTube and other video platforms are increasingly flooded with AI-generated content that many users find low-quality, misleading, or undesirable. Current platform algorithms don't distinguish between human-created and AI-generated content, and YouTube provides no native tools for users to filter or identify such content.

SlopBlock solves this by:
- Allowing users to mark videos as AI-generated
- Using a trust-based system to prevent abuse and brigading
- Displaying visual warnings on thumbnails of marked videos
- Providing optional filtering to hide marked content
- Operating at scale with local caching (no waiting for servers)

---

## Features

### Core Functionality

- **Trust-Based Marking**: Videos reach threshold when community trust points (weighted by reporter credibility) exceed 2.5
- **Instant Performance**: Lightning-fast checks with local IndexedDB caching, no server wait times
- **Visual Warning Icons**: Glossy animated icons with blur effects on thumbnails
- **Offline Reporting**: Reports queue locally and sync automatically when online
- **Trust Score System**: Build credibility over time (30-day time decay + accuracy-based scoring)
- **Auto-Hide Option**: Optional setting to completely hide marked videos from feeds
- **Undo Reports**: Remove your own reports (but can't report same video again)
- **Anonymous & Private**: No account required, no personal data collected

### Technical Highlights

- **CDN-Based Caching**: 48-hour sliding window with hourly regeneration and 30-minute delta syncs
- **95%+ API Reduction**: Client-side IndexedDB cache makes video checks instant and local
- **Trust System**: Hybrid scoring (50% time-based + 50% accuracy-based) prevents botnet attacks
- **Offline Support**: Queue manager with automatic retry and batch uploads
- **SponsorBlock-Inspired**: Batched storage writes, persistent popup connections, config migrations
- **Privacy-First**: No personal data collection, anonymous reporting
- **Manifest V3**: Modern, secure Chrome extension architecture
- **TypeScript**: Type-safe development with excellent DX

---

## Technology Stack

**Frontend (Extension)**:
- TypeScript
- Vite + @crxjs/vite-plugin
- Chrome Extensions Manifest V3
- IndexedDB for client-side caching

**Backend**:
- Supabase (PostgreSQL + Edge Functions + Storage CDN)
- Row Level Security (RLS) for secure anonymous access
- Edge Functions for cache generation (hourly blob + delta)
- Supabase Storage for CDN delivery

**Development**:
- ESLint + Prettier
- Git + GitHub + GitHub Pages

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Chrome or Chromium-based browser
- Supabase account (free tier)

### Quick Start

1. **Clone and Install**:
   ```bash
   git clone https://github.com/lydonator/slopblock.git
   cd slopblock
   npm install
   ```

2. **Set Up Supabase**:
   - Create a free Supabase project at https://supabase.com/
   - Run the following SQL migrations in order:
     - `migrations/DATABASE_SETUP.sql` (base schema)
     - `migrations/DATABASE_PHASE3_MIGRATION.sql` (trust system)
     - `migrations/DATABASE_PHASE3_TRUST_ENHANCEMENT.sql` (hybrid scoring)
     - `migrations/DATABASE_PHASE4_CDN_MIGRATION.sql` (caching tables)
   - Deploy Edge Functions:
     ```bash
     supabase functions deploy generate-48h-blob --no-verify-jwt
     supabase functions deploy generate-delta --no-verify-jwt
     ```
   - Set up cron job for hourly cache regeneration (Supabase Dashboard → Database → Cron Jobs):
     ```sql
     SELECT cron.schedule(
       'regenerate-48h-blob',
       '0 * * * *',
       $$SELECT generate_48h_blob();$$
     );
     ```
   - Copy your project URL and anon key

3. **Configure Environment**:
   ```bash
   # Create .env file
   cp .env.example .env

   # Add your Supabase credentials
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

4. **Build Extension**:
   ```bash
   # Development build with hot reload
   npm run dev

   # Production build
   npm run build
   ```

5. **Load in Chrome**:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

For detailed setup instructions, see [QUICKSTART.md](QUICKSTART.md).

---

## Project Structure

```
slopblock/
├── src/
│   ├── background/
│   │   ├── service-worker.ts    # Extension lifecycle + message routing
│   │   ├── api.ts               # Supabase API integration
│   │   └── cache-manager.ts     # CDN cache with delta sync (Phase 4)
│   ├── content/
│   │   ├── youtube.ts           # YouTube page injection
│   │   └── youtube.css          # Styles for icons, buttons, blur effects
│   ├── popup/
│   │   ├── popup.ts             # Extension popup logic
│   │   ├── popup.html           # Popup UI
│   │   └── popup.css            # Popup styles
│   ├── lib/
│   │   ├── storage.ts           # Chrome storage utilities
│   │   ├── queue-manager.ts     # IndexedDB batching (Phase 3)
│   │   ├── indexeddb.ts         # IndexedDB cache layer (Phase 4)
│   │   ├── constants.ts         # Configuration constants
│   │   └── supabase.ts          # Supabase client setup
│   ├── types/
│   │   └── index.ts             # TypeScript type definitions
│   └── manifest.json            # Extension manifest
├── public/
│   └── icons/                   # Extension icons
├── migrations/
│   ├── DATABASE_SETUP.sql                      # Phase 0-2: Base schema
│   ├── DATABASE_PHASE3_MIGRATION.sql           # Phase 3: Trust tables
│   ├── DATABASE_PHASE3_TRUST_ENHANCEMENT.sql   # Phase 3: Hybrid scoring
│   └── DATABASE_PHASE4_CDN_MIGRATION.sql       # Phase 4: Cache tables
├── supabase/functions/
│   ├── generate-48h-blob/       # Edge function: hourly blob generation
│   └── generate-delta/          # Edge function: real-time delta sync
├── docs/                        # GitHub Pages documentation
│   ├── index.md                 # Documentation homepage
│   ├── help.md                  # User guide
│   ├── privacy.md               # Privacy policy
│   └── feedback.md              # Feedback and support
├── PROJECT_PLAN.md              # Complete specification
├── QUICKSTART.md                # Setup guide
├── CLAUDE.md                    # Claude Code development guide
└── README.md                    # This file
```

---

## Documentation

- **[User Guide](https://lydonator.github.io/slopblock/help)**: How to use SlopBlock (GitHub Pages)
- **[Privacy Policy](https://lydonator.github.io/slopblock/privacy)**: Data handling and privacy (GitHub Pages)
- **[Feedback & Support](https://lydonator.github.io/slopblock/feedback)**: Bug reports and feature requests (GitHub Pages)
- **[PROJECT_PLAN.md](PROJECT_PLAN.md)**: Complete technical specification, architecture, and roadmap
- **[QUICKSTART.md](QUICKSTART.md)**: Step-by-step setup and development guide
- **[CLAUDE.md](CLAUDE.md)**: Claude Code development guide with implementation notes

---

## Development Roadmap

### ✅ Phase 0: Project Setup (Complete - 2025-10-28)
- [x] Project structure and tooling
- [x] Supabase database setup
- [x] Development environment ready

### ✅ Phase 1: Core Reporting (Complete - 2025-10-29)
- [x] Report button on watch page player controls
- [x] Report button on Shorts pages
- [x] API integration with Supabase
- [x] Undo functionality with state management

### ✅ Phase 2: Visual Warnings (Complete - 2025-10-31)
- [x] Glossy animated icon overlays on thumbnails
- [x] Thumbnail blur effects with hover-to-preview
- [x] Dynamic content handling with MutationObserver
- [x] SPA navigation cleanup (prevent stale state)
- [x] Batch video checking

### ✅ Phase 3: Trust System (Complete - 2025-11-01)
- [x] Hybrid trust scoring (50% time + 50% accuracy)
- [x] Time-based decay (0.3x → 1.0x over 30 days)
- [x] Accuracy evaluation (30-day delayed consensus)
- [x] Trust-weighted threshold (2.5 effective trust points)
- [x] Client-side batching with IndexedDB queue
- [x] Offline reporting with automatic retry
- [x] Pre-computed aggregate cache for fast lookups
- [x] Trust score display in popup
- [x] Daily cron job for accuracy evaluation

### ✅ Phase 4: CDN Caching (Complete - 2025-11-03)
- [x] 48-hour sliding window cache architecture
- [x] Hourly blob regeneration (Supabase Storage CDN)
- [x] 30-minute delta sync for real-time updates
- [x] Client-side IndexedDB cache with automatic pruning
- [x] Edge Functions for cache generation
- [x] SponsorBlock-inspired optimizations:
  - [x] Batched storage writes (100ms debounce)
  - [x] Persistent popup connection (chrome.runtime.Port)
  - [x] Config migration system (version-tracked)
- [x] Cache management UI (refresh, clear, force delta)
- [x] 95%+ reduction in API calls

### ⏸️ Phase 5: Enhanced Features (Future)
- [ ] Shorts video blur/pause/dismiss system
- [ ] Auto-hide improvements
- [ ] Enhanced statistics and insights
- [ ] Testing suite (Jest + Playwright)
- [ ] Performance profiling

### ⏸️ Phase 6: Scaling & Migration (Future)
- [ ] Migrate to Cloudflare R2 + Workers (~$5-10/month for 1M users)
- [ ] Multi-region CDN optimization
- [ ] Advanced abuse prevention
- [ ] Community moderation tools
- [ ] Public beta release

For detailed phase information, see [PROJECT_PLAN.md](PROJECT_PLAN.md).

---

## Architecture Overview

```
Browser Extension (Frontend)
├── Background Service Worker
│   ├── Cache Manager (Phase 4)
│   │   ├── Download 48h blob on install/update
│   │   ├── Delta sync every 30 minutes
│   │   ├── Automatic cache pruning
│   │   └── Force refresh + manual sync
│   ├── Queue Manager (Phase 3)
│   │   ├── IndexedDB persistent queue
│   │   ├── Batch uploads (10 reports or 5 min)
│   │   └── Automatic retry (up to 3 attempts)
│   ├── API communication with Supabase
│   │   ├── Batch report uploads
│   │   ├── Trust score queries
│   │   └── Community statistics
│   └── Extension ID management

├── Content Scripts (YouTube)
│   ├── Thumbnail observation (MutationObserver)
│   ├── Warning icon injection (glossy SVG with shine)
│   ├── Thumbnail blur effects (psychological UX)
│   ├── Report button on watch page (player controls)
│   ├── Report button on Shorts (action buttons)
│   ├── Toast notifications
│   └── SPA navigation cleanup

├── IndexedDB Layer (Phase 4)
│   ├── Marked videos cache (48h window)
│   ├── Video metadata with timestamps
│   ├── Efficient queries by video ID
│   └── Delta merge support

└── Popup UI
    ├── Settings (auto-hide toggle)
    ├── Trust score display (color-coded)
    ├── Statistics (user reports + global marked)
    ├── Cache management (refresh, clear, force delta)
    └── Persistent connection to background worker

                    ↓ HTTPS REST API / CDN

Supabase Backend
├── PostgreSQL Database
│   ├── Core Tables
│   │   ├── videos (backward-compatible report_count)
│   │   └── reports (trust_weight, accuracy_status)
│   ├── Phase 3 Trust Tables
│   │   ├── extension_trust (hybrid trust scoring)
│   │   └── video_aggregates_cache (CDN-ready)
│   └── Phase 4 Cache Tables
│       ├── cache_48h_blob (full cache metadata)
│       └── cache_delta_log (incremental updates)
│
├── Edge Functions (Phase 4)
│   ├── generate-48h-blob (hourly cron)
│   └── generate-delta (real-time sync)
│
├── Storage CDN (Phase 4)
│   ├── 48h-cache.json (full blob, regenerated hourly)
│   └── delta-{timestamp}.json (incremental updates)
│
└── PostgreSQL Functions
    ├── Legacy Functions
    │   ├── report_video()
    │   ├── remove_report()
    │   └── get_marked_videos()
    ├── Phase 3 Functions
    │   ├── batch_report_videos()
    │   ├── get_marked_videos_weighted()
    │   ├── check_user_report_weighted()
    │   ├── calculate_trust_score()
    │   ├── calculate_accuracy_rate()
    │   └── evaluate_report_accuracy()
    └── Phase 4 Functions
        ├── generate_48h_blob()
        └── get_delta_updates()
```

---

## Database Schema

### Core Tables (Phase 0-2)

**videos**: Stores reported videos with aggregated report counts
- `video_id` (PK): YouTube video ID
- `channel_id`: YouTube channel ID
- `report_count`: Cached count of reports (maintained for backward compatibility)
- `first_reported_at`, `last_reported_at`: Timestamps

**reports**: Individual reports from users
- `id` (PK): Auto-increment ID
- `video_id` (FK): References videos table
- `extension_id`: Chrome extension unique installation ID
- `trust_weight` (Phase 3): 0.30-1.00 (time + accuracy factors)
- `accuracy_status` (Phase 3): 'pending', 'accurate', 'inaccurate'
- `accuracy_evaluated_at` (Phase 3): Timestamp of evaluation
- `reported_at`: Timestamp
- **Constraint**: UNIQUE(video_id, extension_id) - prevents duplicate reports

### Trust System Tables (Phase 3)

**extension_trust**: Hybrid trust scoring for each extension
- `extension_id` (PK): Unique extension installation ID
- `trust_score`: 0.0-1.0 (hybrid: 50% time + 50% accuracy)
- `accuracy_rate`: Percentage of accurate reports
- `accurate_reports`: Count of accurate reports
- `inaccurate_reports`: Count of inaccurate reports
- `pending_reports`: Count of pending reports (< 30 days)
- `first_seen_at`: Installation timestamp (for time decay calculation)
- `last_report_at`: Most recent report timestamp

**video_aggregates_cache**: Pre-computed aggregates for fast lookups
- `video_id` (PK): YouTube video ID
- `effective_trust_points`: Sum of trust weights from all reports
- `is_marked`: Boolean (≥2.5 trust points)
- `raw_report_count`: Total number of reports
- `last_updated_at`: Timestamp

### Caching Tables (Phase 4)

**cache_48h_blob**: Metadata for full cache blob
- `id` (PK): Always 1 (single row)
- `blob_url`: Supabase Storage URL for JSON blob
- `generated_at`: Timestamp of last regeneration
- `video_count`: Number of videos in blob
- `blob_size_bytes`: Size for monitoring

**cache_delta_log**: Incremental update log
- `id` (PK): Auto-increment ID
- `video_id`: YouTube video ID
- `change_type`: 'added', 'updated', 'removed'
- `effective_trust_points`: New trust value
- `is_marked`: New marked status
- `changed_at`: Timestamp

### Key Functions

**Legacy Functions:**
- `report_video(video_id, channel_id, extension_id)`: Report a video (single API call)
- `remove_report(video_id, extension_id)`: Undo a report
- `get_marked_videos(video_ids[])`: Bulk fetch marked videos (≥3 raw reports)

**Phase 3 Functions:**
- `batch_report_videos(p_reports[])`: Process 10+ reports in one transaction
- `get_marked_videos_weighted(video_ids[])`: Bulk fetch marked videos (≥2.5 trust points)
- `check_user_report_weighted(video_id, extension_id)`: Check report status with trust weight
- `calculate_trust_score(extension_id)`: Hybrid trust calculation (time + accuracy)
- `calculate_accuracy_rate(extension_id)`: Report accuracy percentage
- `evaluate_report_accuracy()`: Daily cron job to assess pending reports (30 days elapsed)
- `refresh_video_aggregate(video_id)`: Update cache after report changes

**Phase 4 Functions:**
- `generate_48h_blob()`: Generate full cache blob (called hourly by cron)
- `get_delta_updates(since_timestamp)`: Get incremental updates since last sync

See migration files in `migrations/` for complete schema.

---

## Security & Privacy

### User Privacy

- **No personal information collected**: No emails, names, YouTube accounts, or login required
- **Anonymous reporting**: Extension ID is the only identifier (randomly generated locally)
- **No browsing history tracking**: Only video IDs you actively report
- **Local settings**: User preferences stored in chrome.storage.local, never uploaded
- **Local caching**: Marked videos cached in IndexedDB on your device
- **Open source**: All code is public and auditable

### Security Measures

- **HTTPS only**: All API communication encrypted
- **Row Level Security**: Supabase RLS prevents unauthorized data access
- **Rate limiting**: Extension ID prevents spam from single user
- **Input validation**: All inputs sanitized and validated
- **Manifest V3**: Modern security standards with Content Security Policy
- **No eval()**: No dynamic code execution
- **CDN authentication**: Edge Functions use `--no-verify-jwt` for anonymous access (read-only operations)

### Abuse Prevention

- **Trust-based threshold**: 2.5 effective trust points required (not 3 raw reports)
- **Time decay**: New accounts start at 0.3x trust, building to 1.0x over 30 days
- **Accuracy evaluation**: Reports evaluated after 30 days based on community consensus
- **Botnet resistance**: Coordinated fake accounts have minimal impact due to trust weighting
- **Report finality**: Can't re-report a video after removing report (prevents gaming)
- **Batch validation**: All batch uploads validated server-side

### Trust System Details

**Time-Based Factor (50% weight):**
- Days 0-7: 0.3x trust multiplier
- Days 8-14: 0.5x trust multiplier
- Days 15-21: 0.7x trust multiplier
- Days 22-29: 0.85x trust multiplier
- Days 30+: 1.0x trust multiplier (full trust)

**Accuracy-Based Factor (50% weight):**
- Calculated as: `accurate_reports / (accurate_reports + inaccurate_reports)`
- Reports evaluated after 30 days
- If video reaches threshold later → accurate
- If video never reaches threshold → inaccurate
- Pending reports don't affect score

**Final Trust Score:**
```
trust_score = (time_factor * 0.5) + (accuracy_factor * 0.5)
trust_weight = trust_score (0.30-1.00 range)
```

---

## Performance

### API Call Reduction

**Phase 2 (Baseline):**
- Every video check: 1 API call
- 100 thumbnails = 100 API calls

**Phase 3 (Batching):**
- Reporting: 90% reduction (batch every 10 reports or 5 minutes)
- Video checking: No improvement

**Phase 4 (CDN Caching):**
- Video checking: 95%+ reduction (local IndexedDB lookups)
- Full blob download: Once on install, then hourly in background
- Delta sync: Every 30 minutes (only fetches changes)
- Result: **Checking 100 videos = 0 API calls** (instant local lookups)

### Caching Strategy

**48-Hour Sliding Window:**
- Stores videos marked in last 48 hours
- Automatically prunes older entries
- Typical cache size: <1MB

**Background Updates:**
- Delta sync every 30 minutes (fetches only changes)
- Full blob refresh hourly (in background, user doesn't notice)
- Manual refresh available in popup

**Offline Support:**
- Reports queue in IndexedDB
- Video checks use stale cache (better than nothing)
- Automatic sync when back online

---

## Contributing

This project is currently in Phase 4 (production-ready). Contributions are welcome!

**How to contribute:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Review [CLAUDE.md](CLAUDE.md) for development guidelines
4. Make your changes with clear commit messages
5. Test changes on multiple Chromium browsers
6. Update documentation if needed
7. Submit a pull request

### Development Guidelines

- Follow TypeScript best practices
- Use ESLint and Prettier for code formatting
- Write clear, descriptive commit messages
- Test thoroughly on Chrome, Edge, and Brave
- Update documentation for new features
- Add comments for complex logic
- Preserve backward compatibility when possible

### Areas for Contribution

- **Testing**: Browser testing suite (Jest + Playwright)
- **Performance**: Profiling and optimization
- **UI/UX**: Popup redesign, new themes
- **Features**: Enhanced statistics, trends, insights
- **Documentation**: Tutorials, videos, translations
- **Bug Fixes**: See [GitHub Issues](https://github.com/lydonator/slopblock/issues)

---

## FAQ

### How does SlopBlock determine if content is AI-generated?

SlopBlock doesn't automatically detect AI content. It relies on crowdsourced reports from users. When a video reaches the community trust threshold (2.5 effective trust points weighted by reporter credibility), it displays a warning to all extension users.

### What's the trust system?

New users start with lower trust (30%) that builds to full trust (100%) over 30 days. Additionally, your accuracy rate affects your trust score. This prevents coordinated attacks from fake accounts or botnets while allowing legitimate users to contribute immediately.

### Will this harm legitimate content creators?

The trust-weighted threshold system helps prevent false positives. Additionally, the extension only shows warnings by default - it doesn't hide videos unless the user explicitly enables auto-hide. Creators who disclose AI use in their descriptions/titles shouldn't be reported.

### Is my data private?

Yes. SlopBlock collects zero personal information. The only identifier used is your Chrome extension installation ID (randomly generated locally, not linked to your identity). No browsing history, watch time, search queries, or other behavioral data is collected.

### Does this violate YouTube's Terms of Service?

No. SlopBlock is a client-side extension that adds visual overlays to YouTube's interface. It doesn't automate actions, scrape private data, or interfere with YouTube's core functionality. Similar extensions like SponsorBlock and Return YouTube Dislike operate under the same principles.

### Will this work on mobile?

Not currently. The extension targets desktop Chromium browsers only. Mobile browser extensions have different APIs and limitations. This may be explored in the future.

### How much does it cost to run?

Currently running on Supabase free tier with CDN caching architecture. With Phase 4 optimizations, the free tier can support ~10,000 active users. For larger scale (100K+ users), a paid Supabase tier (~$25/month) or migration to Cloudflare R2 + Workers (~$5-10/month) would be needed.

### Can I export my reports?

Not yet, but this is planned for a future version for data portability.

### Why IndexedDB instead of chrome.storage?

IndexedDB allows larger storage (gigabytes vs. ~5MB for chrome.storage), faster queries with indexes, and better performance for caching thousands of video entries. It's the same approach SponsorBlock uses.

### How often does the cache update?

- **Background delta sync**: Every 30 minutes (automatic, fetches only changes)
- **Full blob refresh**: Every hour (automatic, full cache regeneration)
- **Manual refresh**: Available in popup at any time
- **After reporting**: Your new reports sync immediately

---

## Inspiration & Similar Projects

- **[SponsorBlock](https://sponsor.block/)**: Crowdsourced sponsor segment skipping (primary inspiration for architecture)
- **[Return YouTube Dislike](https://returnyoutubedislike.com/)**: Restores YouTube dislike counts
- **[DeArrow](https://dearrow.ajay.app/)**: Crowdsourced clickbait thumbnail/title replacement

---

## License

TBD (will be decided before public release - likely MIT or GPL-3.0)

---

## Support & Contact

- **Documentation**: [SlopBlock Help](https://lydonator.github.io/slopblock/help)
- **Issues**: [GitHub Issues](https://github.com/lydonator/slopblock/issues)
- **Privacy**: [Privacy Policy](https://lydonator.github.io/slopblock/privacy)
- **Feedback**: [Submit Feedback](https://lydonator.github.io/slopblock/feedback)

---

## Acknowledgments

- Inspired by the SponsorBlock community and project architecture
- Built with Supabase open-source infrastructure
- Powered by the Chrome Extensions platform
- Thanks to all early testers and contributors

---

**Current Development Status**: Phase 4 Complete - Production-ready with CDN caching and trust system

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the complete roadmap and implementation details.

See [CLAUDE.md](CLAUDE.md) for detailed development guide and implementation notes.
