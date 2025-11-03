# SlopBlock

> A browser extension for crowdsourced identification and filtering of AI-generated content on YouTube.

SlopBlock helps YouTube users identify and optionally filter AI-generated "slop" content through community-driven reporting. Inspired by SponsorBlock's crowdsourced approach, SlopBlock allows users to mark videos as AI-generated and displays visual warnings on thumbnails across YouTube's interface.

---

## Current Status

**Status**: Planning/Initial Setup
**Version**: 0.1.0 (MVP in development)
**Platform**: Chromium browsers (Chrome, Edge, Brave, etc.)

This project is currently in the MVP development phase. See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the complete roadmap.

---

## The Problem

YouTube and other video platforms are increasingly flooded with AI-generated content that many users find low-quality, misleading, or undesirable. Current platform algorithms don't distinguish between human-created and AI-generated content, and YouTube provides no native tools for users to filter or identify such content.

SlopBlock solves this by:
- Allowing users to mark videos as AI-generated
- Displaying visual warnings on thumbnails of marked videos
- Providing optional filtering to hide marked content
- Crowdsourcing quality control through threshold-based marking (3+ reports)

---

## Features (MVP)

### Core Functionality

- **Mark Videos as AI Slop**: One-click reporting on YouTube watch pages
- **Visual Warning Icons**: Overlays on thumbnails in feeds, search results, and channel pages
- **Threshold System**: Videos marked by 3+ users display warnings (reduces false positives)
- **Statistics Display**: Hover over warnings to see report counts and channel stats
- **Auto-Hide Option**: Optional setting to completely hide marked videos from feeds
- **Undo Reports**: Remove your own reports if marked by mistake
- **Anonymous Reporting**: No account required; uses extension ID for rate limiting

### Technical Highlights

- **Privacy-First**: No personal data collection, anonymous reporting
- **Free Infrastructure**: Built on Supabase free tier (PostgreSQL + REST API) - ** Pro tier upgrade being considered **
- **Manifest V3**: Modern, secure Chrome extension architecture
- **TypeScript**: Type-safe development with excellent DX
- **Fast Performance**: Client-side caching, efficient batch API calls

---

## Technology Stack

**Frontend (Extension)**:
- TypeScript
- Vite + @crxjs/vite-plugin
- Chrome Extensions Manifest V3

**Backend**:
- Supabase (PostgreSQL + REST API)
- Row Level Security (RLS) for secure anonymous access

**Development**:
- ESLint + Prettier
- Git + GitHub

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Chrome or Chromium-based browser
- Supabase account

### Quick Start

1. **Clone and Install**:
   ```bash
   cd slopblock
   npm install
   ```

2. **Set Up Supabase**:
   - Create a free Supabase project at https://supabase.com/
   - Run the SQL script from `DATABASE_SETUP.sql` in Supabase SQL Editor
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
   npm run dev
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
│   ├── background/          # Service worker and API logic
│   ├── content/             # YouTube page injection scripts
│   ├── popup/               # Extension popup UI
│   ├── lib/                 # Shared utilities
│   ├── types/               # TypeScript type definitions
│   └── manifest.json        # Extension manifest
├── public/
│   └── icons/               # Extension icons
├── DATABASE_SETUP.sql       # Supabase database schema
├── PROJECT_PLAN.md          # Complete MVP specification
├── QUICKSTART.md            # Detailed setup guide
└── README.md                # This file
```

---

## Documentation

- **[PROJECT_PLAN.md](PROJECT_PLAN.md)**: Complete MVP specification, architecture, and roadmap
- **[QUICKSTART.md](QUICKSTART.md)**: Step-by-step setup and development guide
- **[DATABASE_SETUP.sql](DATABASE_SETUP.sql)**: Supabase database schema and functions

---

## Development Roadmap

### Phase 0: Project Setup (Week 1)
- [x] Project structure and tooling
- [x] Supabase database setup
- [x] Development environment ready

### Phase 1: Core Reporting (Week 2-3)
- [x] Report button on watch page
- [x] API integration with Supabase
- [x] Undo functionality

### Phase 2: Visual Warnings (Week 3-4)
- [x] Icon overlays on thumbnails
- [x] Dynamic content handling
- [x] Batch video checking

### Phase 3: Statistics Display (Week 4-5)
- [x] Tooltip with report counts
- [x] Channel statistics
- [x] Hover interactions

### Phase 4: Auto-Hide Feature (Week 5-6)
- [x] Settings UI in popup
- [x] Video hiding logic
- [ ] Cross-tab sync

### Phase 5: Polish & Testing (Week 6-7)
- [ ] Bug fixes and edge cases
- [ ] Performance optimization
- [x] User documentation

### Phase 6: Beta Release (Week 7+)
- [ ] Limited beta testing
- [ ] Feedback collection
- [ ] Iteration based on usage

For detailed phase information, see [PROJECT_PLAN.md](PROJECT_PLAN.md).

---

## Architecture Overview

```
Browser Extension (Frontend)
├── Background Service Worker
│   ├── API communication with Supabase
│   ├── Video status caching
│   └── Extension ID management
│
├── Content Scripts (YouTube)
│   ├── Thumbnail observation (MutationObserver)
│   ├── Warning icon injection
│   ├── Report button on watch page
│   └── Auto-hide functionality
│
└── Popup UI
    ├── Settings (auto-hide toggle)
    └── Statistics display

                    ↓ HTTPS REST API

Supabase Backend
├── PostgreSQL Database
│   ├── videos table
│   ├── reports table
│   └── channel_stats view
│
└── PostgreSQL Functions
    ├── report_video()
    ├── remove_report()
    ├── get_marked_videos()
    └── get_channel_stats()
```

---

## Database Schema

### Tables

**videos**: Stores reported videos with aggregated report counts
- `video_id` (PK): YouTube video ID
- `channel_id`: YouTube channel ID
- `report_count`: Cached count of reports (for performance)
- `first_reported_at`, `last_reported_at`: Timestamps

**reports**: Individual reports from users
- `id` (PK): Auto-increment ID
- `video_id` (FK): References videos table
- `extension_id`: Chrome extension unique installation ID
- `reported_at`: Timestamp
- **Constraint**: UNIQUE(video_id, extension_id) - prevents duplicate reports

### Key Functions

- `report_video(video_id, channel_id, extension_id)`: Report a video
- `remove_report(video_id, extension_id)`: Undo a report
- `get_marked_videos(video_ids[])`: Bulk fetch marked videos (threshold >= 3)
- `get_channel_stats(channel_id)`: Get channel-level statistics

See [DATABASE_SETUP.sql](DATABASE_SETUP.sql) for complete schema.

---

## Security & Privacy

### User Privacy

- **No personal information collected**: No emails, names, or accounts required
- **Anonymous reporting**: Extension ID is the only identifier (semi-anonymous)
- **No browsing history tracking**: Only video IDs and report actions
- **Local settings**: User preferences stored locally, not in cloud

### Security Measures

- **HTTPS only**: All API communication encrypted
- **Row Level Security**: Supabase RLS prevents unauthorized data access
- **Rate limiting**: Extension ID prevents spam from single user
- **Input validation**: All inputs sanitized and validated
- **Manifest V3**: Modern security standards with CSP

### Abuse Prevention

- **Threshold system**: 3+ reports required to mark video
- **Extension ID uniqueness**: One vote per installation per video
- **Future enhancements**: Voting system, user reputation, moderation tools

---

## Contributing

This project is currently in early MVP development. Once we reach beta, we'll welcome contributions!

For now, if you're interested in contributing:
1. Review the [PROJECT_PLAN.md](PROJECT_PLAN.md)
2. Check open issues (coming soon)
3. Follow development progress

### Development Guidelines

- Follow TypeScript best practices
- Use ESLint and Prettier for code formatting
- Write clear commit messages
- Test changes on multiple Chromium browsers
- Update documentation for new features

---

## FAQ

### How does SlopBlock determine if content is AI-generated?

SlopBlock doesn't automatically detect AI content. It relies on crowdsourced reports from users. When 3 or more users mark a video as "AI slop," it displays a warning to all extension users.

### Will this harm legitimate content creators?

The threshold system (3+ reports) helps prevent false positives. Additionally, the extension only shows warnings - it doesn't prevent videos from appearing unless the user explicitly enables auto-hide. Post-MVP, we plan to add voting systems and appeals processes for better accuracy.

### Is my data private?

Yes. SlopBlock collects zero personal information. The only identifier used is your Chrome extension installation ID (randomly generated, not linked to your identity). No browsing history, watch time, or other behavioral data is collected.

### Does this violate YouTube's Terms of Service?

No. SlopBlock is a client-side extension that adds visual overlays to YouTube's interface. It doesn't automate actions, scrape private data, or interfere with YouTube's core functionality. Similar extensions like SponsorBlock operate under the same principles.

### Will this work on mobile?

Not in the MVP. The current version targets desktop Chromium browsers only. Mobile support may be considered post-MVP.

### How much does it cost to run?

The backend runs on Supabase's free tier (500MB database, 500K API requests/month). If adoption grows, we may need to upgrade to a paid tier (~$25/month) or optimize further.

### Can I export my reports?

Not in the MVP, but this is a planned post-MVP feature for data portability.

---

## Inspiration & Similar Projects

- **[SponsorBlock](https://sponsor.block/)**: Crowdsourced sponsor segment skipping (primary inspiration)
- **[Return YouTube Dislike](https://returnyoutubedislike.com/)**: Restores dislike counts
- **[DeArrow](https://dearrow.ajay.app/)**: Crowdsourced clickbait thumbnail/title replacement

---

## License

TBD (will be decided before public release)

---

## Support & Contact

- **Issues**: [GitHub Issues](https://github.com/lydonator/slopblock/issues)
- **Documentation**: See `PROJECT_PLAN.md` and `QUICKSTART.md`

---

## Acknowledgments

- Inspired by the SponsorBlock community and project
- Built with Supabase open-source infrastructure
- Powered by the Chrome Extensions platform

---

**Current Development Status**: Setting up MVP foundation (Phase 0)

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the complete roadmap and implementation details.
