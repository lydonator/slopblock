# SlopBlock

> A browser extension for crowdsourced identification and filtering of AI-generated content on YouTube.

SlopBlock helps YouTube users identify and optionally filter AI-generated "slop" content through community-driven reporting with trust-based consensus. Inspired by SponsorBlock's crowdsourced approach, SlopBlock allows users to mark videos as AI-generated and displays visual warnings on thumbnails across YouTube's interface.

Install from the Chrome Web Store: [SlopBlock Extension](https://chromewebstore.google.com/detail/slopblock/gaaodejmfnmlodlglkcdnaamomlkdbbc)

Instructions: [Documentation](https://slopblock.cc/)

---

## Current Status

**Status**: Phase 4 Complete - Production Ready
**Version**: 1.0.0 (Phase 4: CDN Caching + Trust System)
**Platform**: Chromium browsers (Chrome, Edge, Brave, Opera)

**Latest Milestone (2025-11-03)**: CDN-based caching architecture with 48-hour sliding window, delta sync, and SponsorBlock-inspired optimizations. The extension now scales to millions of users with 95%+ reduction in API calls.

---

## The Problem

YouTube and other video platforms are increasingly flooded with AI-generated content that many users find low-quality, misleading, or undesirable. Current platform algorithms don't distinguish between human-created and AI-generated content, and YouTube provides no native tools for users to filter or identify such content.

SlopBlock solves this by:
- Allowing users to mark videos as AI-generated
- Using a trust-based system to prevent abuse and brigading
- Displaying visual warnings on thumbnails of marked videos
- Providing optional filtering to hide marked content
- Operating at scale with local caching (no waiting for servers - most of the time ;)

---

## Features

### Core Functionality

- **Trust-Based Marking**: Videos reach threshold when community trust points (weighted by reporter credibility) exceed a certain level
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
- **Trust System**: Hybrid scoring (50% time-based + 50% accuracy-based) prevents new account brigade attacks
- **Offline Support**: Queue manager with automatic retry and batch uploads
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
- `generate_48h_blob()`: Generate full cache blob (called 6 hourly by cron)
- `get_delta_updates(since_timestamp)`: Get incremental updates since last sync

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
- **CDN authentication**: Edge Functions use anonymous access (read-only operations)

### Abuse Prevention

- **Trust-based threshold**: 2.5 effective trust points required to mark a video as legit slop!
- **Time decay**: New accounts start at 0.3x trust, building to 1.0x over 30 days
- **Accuracy evaluation**: Reports evaluated after 30 days based on community consensus
- **Brigading resistance**: Coordinated fake accounts have minimal impact due to trust weighting
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
- Reporting: 90% reduction (batch every 10 reports or 10 minutes)
- Video checking: No improvement

**Phase 4 (CDN Caching):**
- Video checking: 95%+ reduction (local IndexedDB lookups)
- Full blob download: Once on install, then 24 hourly in background
- Delta sync: Every 30 minutes (only fetches changes)
- Result: **Checking 100 videos = 0 API calls** (instant local lookups)

### Caching Strategy

**48-Hour Sliding Window:**
- Stores videos marked in last 48 hours
- Automatically prunes older entries
- Typical cache size: <1MB

**Background Updates:**
- Delta sync every 30 minutes (fetches only changes)
- Full blob refresh 24 hourly (in background, user doesn't notice)
- Manual refresh available in popup

**Offline Support:**
- Reports queue in IndexedDB
- Automatic sync when back online

---

## Contributing

This project is currently in Phase 4 (production-ready). Contributions are welcome!

**How to contribute:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with clear commit messages
4. Define clear test case and outcomes
5. Update documentation if needed
6. Submit a pull request

### Development Guidelines

- Follow TypeScript best practices
- Use ESLint and Prettier for code formatting
- Write clear, descriptive commit messages
- Test thoroughly on Chrome, Edge, and Brave
- Update documentation for new features
- Add comments for complex logic
- Preserve backward compatibility when possible

### Areas for Contribution

- **Performance**: Profiling and optimization
- **UI/UX**: Any improvements would be great
- **Features**: Enhanced statistics, trends, insights
- **Documentation**: Tutorials, videos, translations
- **Bug Fixes**: See [GitHub Issues](https://github.com/lydonator/slopblock/issues)

---

## FAQ

### How does SlopBlock determine if content is AI-generated?

SlopBlock doesn't automatically detect AI content. It relies on crowdsourced reports from users. When a video reaches the community trust threshold (2.5 effective trust points weighted by reporter credibility), it displays a warning to all extension users, or filters the videos from feeds if you opted in via popup setting.

### What's the trust system?

New users start with lower trust (30%) that builds to full trust (100%) over 30 days. Additionally, your accuracy rate affects your trust score. This prevents coordinated attacks from fake accounts or brigading while allowing legitimate users to contribute immediately.

### Will this harm legitimate content creators?

The trust-weighted threshold system helps prevent false positives. Additionally, the extension only shows warnings by default - it doesn't hide videos unless the user explicitly enables auto-hide. Creators who disclose AI use in their descriptions/titles shouldn't be reported. We do however have a few measures in place to protect users from false reporting other than the Trust System. Users who feel that they have been unfairly targeted can have their videos reviewed through our custom appeals form. A human moderator will review those appeals and make a decision on whether to uphold or reject that appeal based on the content they review. If a channel is found to be unfairly targeted, they can have their site whitelisted from all further reports. Additionally, if our system receives 10 or more reports that flag a Youtube "Verified Account", it will automatically mark them as "verified" in our database and they will be whitelisted from further reporting. 

### Is my data private?

Yes. SlopBlock collects zero personal information. The only identifier used is your Chrome extension installation ID (randomly generated locally, not linked to your identity). No browsing history, watch time, search queries, or other behavioral data is collected.

### Does this violate YouTube's Terms of Service?

No. SlopBlock is a client-side extension that adds visual overlays to YouTube's interface. It doesn't automate actions, scrape private data, or interfere with YouTube's core functionality. Similar extensions like SponsorBlock operate under the same principles.

### Will this work on mobile?

Not currently. The extension targets desktop Chromium browsers only. Mobile browser extensions have different APIs and limitations. This may be explored in the future.

### How much does it cost to run?

This is difficult to pin down until we have a settled idea of what the userbase will be. But this is one of those strange projects that sort of get cheaper to run the more people are involved. Why? Well, the more reports you have that reach 'consensus', the less videos you might have being reported. And the less videos available to report, the less strain on the infrastructure. What that critical mass looks like, not sure yet, but excited to find out :)

### Can I export my reports?

Please see the **Your Rights & Control** section in the following doc: https://slopblock.cc/privacy

### Why IndexedDB instead of chrome.storage?

IndexedDB allows larger storage, faster queries with indexes, and better performance for caching potentially thousands of video entries.

### How often does the cache update?

- **Background delta sync**: Every 30 minutes (automatic, fetches only changes since the last delta)
- **Full blob refresh**: Every 24 hours (automatic, full cache regeneration) 
- **Manual refresh**: Available in popup at any time
- **After reporting**: Your new reports sync immediately

---

## Inspiration & Similar Projects

- **[SponsorBlock]**: Crowdsourced sponsor segment skipping (primary inspiration for this project)

---

## License

TBD (will be decided before public release - likely MIT or GPL-3.0)

---

## Support & Contact

- **Documentation**: [SlopBlock Help](https://slopblock.cc/)
- **Issues**: [GitHub Issues](https://github.com/lydonator/slopblock/issues)
- **Privacy**: [Privacy Policy](https://slopblock.cc/privacy)
- **Feedback**: [Submit Feedback](https://slopblock.cc/feedback)


---

**Current Development Status**: Phase 4 Complete - Production-ready with CDN caching and trust system --

