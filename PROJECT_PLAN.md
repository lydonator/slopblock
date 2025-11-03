# SlopBlock - MVP Project Plan

> **Implementation Status (2025-11-03):**
> ✅ Phase 0: Complete
> ✅ Phase 1: Complete
> ✅ Phase 2: Complete
> ✅ Phase 3: Complete (Hybrid Trust System + Batching)
> ✅ Phase 4: Complete (CDN Caching + SponsorBlock Optimizations)
> ⏸️ Phase 5-6: Planned for future releases

## Executive Summary

SlopBlock is a Chromium browser extension that helps YouTube users identify and optionally filter AI-generated "slop" content through crowdsourced reporting. Inspired by SponsorBlock's community-driven approach, SlopBlock allows users to mark videos as AI-generated content and displays visual warnings on thumbnails across YouTube's interface. The extension uses a cloud-hosted database to aggregate reports and applies a threshold-based system (3+ reports) to mark videos as "AI Slop".

**Target Launch**: Quality-focused development with flexible timeline
**Primary Platform**: Chromium-based browsers (Chrome, Edge, Brave, etc.)
**Backend**: Supabase (PostgreSQL + REST API) on free tier
**User Model**: Anonymous reporting with extension ID-based identity

---

## Problem Statement

YouTube and other video platforms are increasingly flooded with AI-generated content (often called "slop") that many users find low-quality, misleading, or undesirable. Current platform algorithms don't distinguish between human-created and AI-generated content, and YouTube provides no native tools for users to filter or identify such content.

Users currently have no effective way to:
- Identify AI-generated videos before clicking
- Share knowledge about AI content with the community
- Filter their feed to reduce exposure to unwanted AI-generated content
- Make informed decisions about which videos to watch

The lack of transparency and filtering options leads to wasted time, frustration, and degraded user experience on the platform.

---

## Target Users

**Primary Persona**: YouTube Power Users
- Watches YouTube regularly (daily to weekly)
- Values authentic, human-created content
- Frustrated by increasing AI-generated content
- Willing to install browser extensions to improve experience
- Community-minded (willing to contribute to crowdsourced data)

**Secondary Persona**: Content Quality Advocates
- Concerned about the proliferation of AI-generated content online
- Interested in supporting human creators
- May be content creators themselves
- Values transparency in content creation

---

## MVP Scope

### In-Scope Features

#### 1. Mark Video as AI Slop (Reporting)
- **Description**: Button/icon on the YouTube watch page that allows users to mark the currently playing video as AI-generated content
- **User Value**: Enables community contribution to the database; empowers users to help others
- **Acceptance Criteria**:
  - Report button visible on all YouTube watch pages (youtube.com/watch?v=*)
  - Single click reports the video (video ID) to the backend
  - Visual confirmation of successful report (toast notification or button state change)
  - Prevents duplicate reports from same extension ID
  - Stores video ID and channel ID in database
  - Reports are anonymous but tied to extension ID for rate limiting

#### 2. Visual Warning Indicators on Thumbnails
- **Description**: Overlay icon on video thumbnails in feeds, search results, and channel pages to warn about reported content
- **User Value**: Immediate visual identification of potentially AI-generated content before clicking
- **Acceptance Criteria**:
  - Icon appears in top-right corner of thumbnails for videos meeting threshold (3+ reports)
  - Works on: Home feed, search results, channel pages, watch page recommendations
  - Icon is visible but not overly intrusive
  - Consistent styling across all YouTube page types
  - Does not prevent videos from appearing (warning only, not filtering)
  - Icon persists during infinite scroll and dynamic content loading

#### 3. Threshold-Based Marking System
- **Description**: Videos require 3 or more unique reports (by extension ID) before being marked as "AI Slop"
- **User Value**: Reduces false positives while keeping barrier low enough for community reporting to be effective
- **Acceptance Criteria**:
  - Database tracks count of unique extension IDs that reported each video
  - Videos only show warning icon when count >= 3
  - Threshold value is configurable in backend for future adjustment
  - Reports are cumulative (don't expire)

#### 4. Statistics Tooltip/Popup
- **Description**: Hovering over or clicking the warning icon displays detailed information about the reports
- **User Value**: Transparency about community consensus; helps users make informed decisions
- **Acceptance Criteria**:
  - Displays total number of reports: "47 users marked this as AI slop"
  - Shows channel-level statistics: "This channel has 12 videos marked as slop"
  - Clean, readable UI that doesn't interfere with YouTube's interface
  - Loads quickly without blocking thumbnail rendering

#### 5. Auto-Hide Marked Videos (Optional)
- **Description**: User setting to completely hide videos marked as slop from feeds instead of just showing warnings
- **User Value**: Stronger filtering for users who want to avoid AI content entirely
- **Acceptance Criteria**:
  - Toggle setting in extension options/popup (OFF by default)
  - When enabled, removes marked video thumbnails from DOM
  - Handles dynamic content loading (videos hidden as they're added)
  - Graceful degradation if hiding causes layout issues
  - Can be toggled on/off without page reload

#### 6. Undo Report Mechanism
- **Description**: Users can remove their own report if marked by mistake
- **User Value**: Reduces anxiety about false reports; improves data quality
- **Acceptance Criteria**:
  - Report button changes to "Undo Report" if user has already reported current video
  - Clicking undo removes extension ID from video's report list in database
  - Decrements report count (may drop below threshold)
  - Visual confirmation of undo action
  - Can re-report after undoing (toggle functionality)

#### 7. Extension Popup/Options Interface
- **Description**: Basic UI accessible via extension icon in browser toolbar
- **User Value**: Control over extension behavior and access to information
- **Acceptance Criteria**:
  - Popup shows current status (number of videos marked in database, etc.)
  - Toggle for auto-hide feature
  - Link to report issues or provide feedback
  - Basic instructions/help text
  - Privacy policy link

### Explicitly Out-of-Scope (Post-MVP Features)

- **User accounts and authentication**: Anonymous reporting only for MVP
- **Voting system** (upvote/downvote report accuracy): Simple counting only
- **Manual moderation queue**: No human review process initially
- **Content creator appeals process**: No mechanism for creators to challenge marks
- **Browser-specific versions beyond Chromium**: No Firefox, Safari versions yet
- **Mobile app or mobile browser support**: Desktop only
- **AI detection algorithms**: Purely crowdsourced, no automated detection
- **Detailed reporting reasons**: No categorization (clickbait, low-quality, etc.) - binary slop/not-slop
- **User reputation/trust scores**: All reports weighted equally
- **Analytics dashboard**: No public stats on most-reported channels/videos
- **Export/import of personal reports**: No data portability features
- **Integration with other platforms**: YouTube only
- **Comments or discussion about reports**: No social features
- **Notification system**: No alerts about newly marked videos from subscribed channels
- **Chrome Web Store initial submission**: Will develop and test first before publishing

---

## Technical Architecture

### Technology Stack

#### Frontend (Browser Extension)
- **Language**: TypeScript (for type safety and better developer experience)
- **Build Tool**: Vite with @crxjs/vite-plugin (modern, fast builds for Chrome extensions)
- **UI Framework**: Vanilla JS/TS with minimal dependencies for performance
  - Consider Preact if component framework becomes necessary
- **Styling**: CSS Modules or plain CSS (keep lightweight)
- **State Management**: Simple context/state management without heavy libraries
- **Extension APIs**:
  - Chrome Extensions Manifest V3
  - chrome.storage for local settings
  - chrome.runtime for messaging
  - Content scripts for YouTube page injection

#### Backend (API + Database)
- **Platform**: Supabase (free tier)
- **Database**: PostgreSQL (via Supabase)
- **API**: Supabase auto-generated REST API + PostgreSQL functions
- **Authentication**: Anonymous access with Row Level Security (RLS) policies
- **Real-time**: Optional Supabase real-time subscriptions for live updates (post-MVP)

#### Development Tools
- **Version Control**: Git + GitHub
- **Package Manager**: npm or pnpm
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier
- **Testing**:
  - Jest or Vitest for unit tests (initial setup, comprehensive testing post-MVP)
  - Manual testing on YouTube during development

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         User's Browser                       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │           SlopBlock Extension                       │    │
│  │                                                     │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────┐ │    │
│  │  │  Background │  │    Content   │  │  Popup   │ │    │
│  │  │   Service   │  │    Scripts   │  │    UI    │ │    │
│  │  │   Worker    │  │              │  │          │ │    │
│  │  └──────┬──────┘  └──────┬───────┘  └────┬─────┘ │    │
│  │         │                │                │        │    │
│  │         │   chrome.runtime messaging      │        │    │
│  │         └────────────────┼────────────────┘        │    │
│  │                          │                          │    │
│  │                          │ DOM Manipulation        │    │
│  │                          │ (inject icons, hide)    │    │
│  └──────────────────────────┼──────────────────────────┘    │
│                             │                               │
│                    ┌────────▼─────────┐                     │
│                    │   YouTube DOM    │                     │
│                    └──────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
                             │
                             │ HTTPS REST API calls
                             │
                   ┌─────────▼──────────┐
                   │     Supabase       │
                   │                    │
                   │  ┌──────────────┐  │
                   │  │  PostgreSQL  │  │
                   │  │   Database   │  │
                   │  │              │  │
                   │  │  - reports   │  │
                   │  │  - videos    │  │
                   │  │  - stats     │  │
                   │  └──────────────┘  │
                   │                    │
                   │  ┌──────────────┐  │
                   │  │   REST API   │  │
                   │  │   + RLS      │  │
                   │  └──────────────┘  │
                   └────────────────────┘
```

### Component Responsibilities

#### Background Service Worker
- Manages extension lifecycle
- Handles API communication with Supabase
- Caches video slop status (video IDs and report counts)
- Periodically refreshes cache
- Provides API interface to content scripts
- Manages extension ID for user identity
- Rate limiting logic

#### Content Scripts
- Injects on YouTube pages (watch page, home, search, channels)
- Observes DOM for video thumbnails (MutationObserver for dynamic content)
- Adds warning icons to thumbnails based on cached data
- Handles auto-hide functionality
- Injects "Report" button on watch page
- Shows statistics tooltips
- Communicates with background worker for data

#### Popup UI
- Extension settings interface
- Toggle auto-hide feature
- Display stats (total videos marked, etc.)
- Links and information
- Simple HTML + CSS + JS

---

## Database Schema

### Supabase PostgreSQL Tables

#### Table: `videos`
```sql
CREATE TABLE videos (
    video_id VARCHAR(20) PRIMARY KEY,  -- YouTube video ID (e.g., "dQw4w9WgXcQ")
    channel_id VARCHAR(30),             -- YouTube channel ID
    report_count INTEGER DEFAULT 0,     -- Cached count of reports
    first_reported_at TIMESTAMP DEFAULT NOW(),
    last_reported_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_videos_report_count ON videos(report_count);
CREATE INDEX idx_videos_channel_id ON videos(channel_id);
```

#### Table: `reports`
```sql
CREATE TABLE reports (
    id BIGSERIAL PRIMARY KEY,
    video_id VARCHAR(20) NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    extension_id VARCHAR(100) NOT NULL,  -- Chrome extension unique ID
    reported_at TIMESTAMP DEFAULT NOW(),

    -- Prevent duplicate reports from same extension
    UNIQUE(video_id, extension_id)
);

-- Indexes for performance
CREATE INDEX idx_reports_video_id ON reports(video_id);
CREATE INDEX idx_reports_extension_id ON reports(extension_id);
CREATE INDEX idx_reports_reported_at ON reports(reported_at);
```

#### Materialized View: `channel_stats` (Optional - for performance)
```sql
CREATE MATERIALIZED VIEW channel_stats AS
SELECT
    channel_id,
    COUNT(DISTINCT video_id) as marked_video_count,
    MAX(last_reported_at) as last_report_date
FROM videos
WHERE report_count >= 3  -- Only count videos above threshold
GROUP BY channel_id;

-- Refresh periodically via cron job or manually
CREATE INDEX idx_channel_stats_channel_id ON channel_stats(channel_id);
```

### Supabase Functions (PostgreSQL)

#### Function: `report_video`
```sql
CREATE OR REPLACE FUNCTION report_video(
    p_video_id VARCHAR(20),
    p_channel_id VARCHAR(30),
    p_extension_id VARCHAR(100)
)
RETURNS JSON AS $$
DECLARE
    v_report_count INTEGER;
BEGIN
    -- Insert or get video record
    INSERT INTO videos (video_id, channel_id, first_reported_at, last_reported_at)
    VALUES (p_video_id, p_channel_id, NOW(), NOW())
    ON CONFLICT (video_id)
    DO UPDATE SET
        last_reported_at = NOW(),
        channel_id = COALESCE(videos.channel_id, p_channel_id);

    -- Insert report (will fail silently if duplicate due to UNIQUE constraint)
    INSERT INTO reports (video_id, extension_id, reported_at)
    VALUES (p_video_id, p_extension_id, NOW())
    ON CONFLICT (video_id, extension_id) DO NOTHING;

    -- Update cached count
    UPDATE videos
    SET report_count = (SELECT COUNT(*) FROM reports WHERE video_id = p_video_id),
        updated_at = NOW()
    WHERE video_id = p_video_id
    RETURNING report_count INTO v_report_count;

    RETURN json_build_object(
        'success', true,
        'video_id', p_video_id,
        'report_count', v_report_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Function: `remove_report`
```sql
CREATE OR REPLACE FUNCTION remove_report(
    p_video_id VARCHAR(20),
    p_extension_id VARCHAR(100)
)
RETURNS JSON AS $$
DECLARE
    v_report_count INTEGER;
    v_deleted_count INTEGER;
BEGIN
    -- Delete the report
    DELETE FROM reports
    WHERE video_id = p_video_id AND extension_id = p_extension_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count > 0 THEN
        -- Update cached count
        UPDATE videos
        SET report_count = (SELECT COUNT(*) FROM reports WHERE video_id = p_video_id),
            updated_at = NOW()
        WHERE video_id = p_video_id
        RETURNING report_count INTO v_report_count;

        RETURN json_build_object(
            'success', true,
            'video_id', p_video_id,
            'report_count', v_report_count
        );
    ELSE
        RETURN json_build_object(
            'success', false,
            'error', 'Report not found'
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Function: `get_marked_videos`
```sql
CREATE OR REPLACE FUNCTION get_marked_videos(p_video_ids VARCHAR(20)[])
RETURNS TABLE(video_id VARCHAR(20), report_count INTEGER, channel_id VARCHAR(30)) AS $$
BEGIN
    RETURN QUERY
    SELECT v.video_id, v.report_count, v.channel_id
    FROM videos v
    WHERE v.video_id = ANY(p_video_ids)
      AND v.report_count >= 3;  -- Only return videos above threshold
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Function: `get_channel_stats`
```sql
CREATE OR REPLACE FUNCTION get_channel_stats(p_channel_id VARCHAR(30))
RETURNS JSON AS $$
DECLARE
    v_marked_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_marked_count
    FROM videos
    WHERE channel_id = p_channel_id
      AND report_count >= 3;

    RETURN json_build_object(
        'channel_id', p_channel_id,
        'marked_video_count', v_marked_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Row Level Security (RLS) Policies

```sql
-- Enable RLS on tables
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access to videos (public data)
CREATE POLICY "Allow public read access to videos"
ON videos FOR SELECT
TO anon
USING (true);

-- Allow anonymous read to reports for stats (but not extension_ids)
CREATE POLICY "Allow public read access to reports"
ON reports FOR SELECT
TO anon
USING (true);

-- Functions are already SECURITY DEFINER, so they bypass RLS
-- No direct INSERT/UPDATE/DELETE allowed to anon users - must use functions
```

### API Endpoints (via Supabase)

The extension will interact with these Supabase endpoints:

1. **POST** `/rest/v1/rpc/report_video`
   - Report a video as AI slop
   - Payload: `{ p_video_id, p_channel_id, p_extension_id }`
   - Returns: `{ success, video_id, report_count }`

2. **POST** `/rest/v1/rpc/remove_report`
   - Remove user's report
   - Payload: `{ p_video_id, p_extension_id }`
   - Returns: `{ success, video_id, report_count }`

3. **POST** `/rest/v1/rpc/get_marked_videos`
   - Bulk fetch marked videos (for current page)
   - Payload: `{ p_video_ids: ["vid1", "vid2", ...] }`
   - Returns: Array of `{ video_id, report_count, channel_id }`

4. **POST** `/rest/v1/rpc/get_channel_stats`
   - Get statistics for a channel
   - Payload: `{ p_channel_id }`
   - Returns: `{ channel_id, marked_video_count }`

---

## Implementation Phases

### Phase 0: Project Setup (Week 1)

**Objectives**:
- Initialize project structure
- Set up development environment
- Configure Supabase backend

**Tasks**:
1. Initialize Git repository
2. Set up TypeScript + Vite + @crxjs/vite-plugin
3. Configure ESLint and Prettier
4. Create basic Manifest V3 configuration
5. Set up Supabase project (free tier)
6. Create database schema (tables, functions, RLS policies)
7. Test Supabase connection and functions
8. Create basic project documentation (README, contributing guide)

**Deliverables**:
- Working development environment
- Extension loads in Chrome (empty/skeleton)
- Supabase database operational
- Git repository with initial commit

**Acceptance Criteria**:
- `npm run dev` successfully builds extension
- Extension can be loaded in Chrome via "Load unpacked"
- Supabase API calls work from test script
- All database functions execute correctly

---

### Phase 1: Core Reporting Functionality (Week 2-3)

**Objectives**:
- Implement video reporting on watch page
- Set up backend communication
- Handle extension ID generation and storage

**Tasks**:

1. **Background Service Worker**:
   - Generate and store unique extension ID (or use Chrome's)
   - Create API service module for Supabase calls
   - Implement `reportVideo()` function
   - Implement `removeReport()` function
   - Set up basic error handling and retry logic

2. **Content Script (Watch Page)**:
   - Inject "Report as AI Slop" button on watch page
   - Extract video ID and channel ID from URL/page
   - Handle button click to trigger report
   - Show confirmation toast/notification
   - Handle undo functionality (button state change)
   - Store local state (has user reported this video?)

3. **Storage**:
   - Use chrome.storage.local for extension ID
   - Cache user's reported video IDs locally

**Deliverables**:
- Functional report button on YouTube watch pages
- Successful API calls to Supabase
- Confirmation feedback to user
- Undo functionality working

**Acceptance Criteria**:
- Clicking "Report" adds entry to database with correct video ID, channel ID, and extension ID
- Duplicate reports from same extension ID are prevented
- Button changes to "Undo Report" after reporting
- Clicking undo removes report and updates count
- Toast notifications confirm actions
- Works consistently across different YouTube watch pages

---

### Phase 2: Visual Warning System (Week 3-4)

**Objectives**:
- Display warning icons on thumbnails
- Handle dynamic content loading
- Implement efficient batch fetching

**Tasks**:

1. **Background Service Worker Enhancement**:
   - Implement video status cache (Map of video_id -> report_count)
   - Create `checkVideos(videoIds)` function for batch API calls
   - Implement cache refresh strategy (TTL or periodic)
   - Handle cache persistence (chrome.storage)

2. **Content Scripts (All Pages)**:
   - Detect YouTube page type (home, search, channel, watch)
   - Observe DOM for video thumbnails (MutationObserver)
   - Extract video IDs from thumbnail elements
   - Request video status from background worker
   - Inject warning icon overlay on marked videos (report_count >= 3)
   - Position icon in top-right corner
   - Handle infinite scroll and dynamic content

3. **UI/CSS**:
   - Design warning icon (SVG or icon font)
   - Create CSS for overlay positioning
   - Ensure icon is visible but not too intrusive
   - Test on different YouTube layouts and themes

**Deliverables**:
- Warning icons appear on marked video thumbnails
- Icons show on: home feed, search results, channel pages, recommended videos
- Efficient batching of API requests
- No performance degradation on YouTube

**Acceptance Criteria**:
- Icons appear within 1 second of thumbnails loading
- Icons correctly positioned on all thumbnail types
- Works with infinite scroll (new thumbnails get icons)
- No duplicate icons on same thumbnail
- Page performance remains smooth (no lag)
- Icons persist when YouTube dynamically updates content

---

### Phase 3: Statistics and Information Display (Week 4-5)

**Objectives**:
- Show report statistics on hover/click
- Display channel-level information
- Create informative tooltip UI

**Tasks**:

1. **Tooltip Component**:
   - Create tooltip HTML/CSS component
   - Position tooltip near warning icon
   - Lazy load detailed stats (not fetched until hover)

2. **API Enhancement**:
   - Call `get_channel_stats` when tooltip opens
   - Cache channel stats temporarily
   - Handle loading states and errors

3. **Content Script Enhancement**:
   - Add hover event listener to warning icons
   - Display tooltip with:
     - "X users marked this as AI slop"
     - "This channel has Y videos marked as slop"
   - Implement tooltip positioning logic (avoid off-screen)
   - Add close button or auto-hide on mouse leave

**Deliverables**:
- Working tooltip system on warning icons
- Real-time stat fetching
- Clean, readable tooltip UI

**Acceptance Criteria**:
- Hovering icon shows tooltip within 500ms
- Tooltip shows correct report count and channel stats
- Tooltip doesn't break YouTube's layout
- Tooltip closes when mouse leaves or user clicks away
- Stats are accurate and up-to-date

---

### Phase 4: Auto-Hide Feature (Week 5-6)

**Objectives**:
- Implement optional video hiding
- Create settings interface
- Handle edge cases in YouTube's dynamic UI

**Tasks**:

1. **Popup UI**:
   - Create extension popup HTML/CSS
   - Add toggle switch for auto-hide feature
   - Save setting to chrome.storage
   - Show basic stats (total marked videos, etc.)

2. **Content Script Enhancement**:
   - Check auto-hide setting on page load
   - Hide marked video elements from DOM when enabled
   - Handle YouTube's complex DOM structure (nested elements)
   - Test on all supported page types
   - Gracefully handle layout edge cases

3. **Background Worker**:
   - Manage setting sync across tabs
   - Notify content scripts when setting changes

**Deliverables**:
- Working popup with settings
- Auto-hide functionality on all YouTube pages
- Setting persists across browser sessions

**Acceptance Criteria**:
- Toggle switch in popup works immediately (no page reload needed)
- When enabled, marked videos are hidden from view
- YouTube's layout adjusts gracefully (no empty gaps)
- Works on home feed, search, and channel pages
- Setting change applies to all open YouTube tabs
- Videos hidden as they load (infinite scroll)
- Auto-hide is OFF by default for new installs

---

### Phase 5: Polish, Testing, and Optimization (Week 6-7)

**Objectives**:
- Fix bugs and edge cases
- Optimize performance
- Improve UX and visual design
- Prepare for user testing

**Tasks**:

1. **Bug Fixes and Edge Cases**:
   - Test on various YouTube layouts (grid, list, etc.)
   - Handle YouTube UI updates and experiments
   - Test with different browser sizes and zoom levels
   - Fix any icon positioning issues
   - Handle API errors gracefully
   - Test rate limiting and abuse scenarios

2. **Performance Optimization**:
   - Minimize API calls (efficient caching)
   - Debounce thumbnail observers
   - Optimize DOM manipulation
   - Reduce extension memory footprint
   - Lazy load non-critical features

3. **UX Improvements**:
   - Smooth animations for icon appearance
   - Better loading states
   - Clearer error messages
   - Improve tooltip styling
   - Add keyboard shortcuts (optional)

4. **Documentation**:
   - User guide (how to use extension)
   - Privacy policy
   - FAQ
   - Troubleshooting guide

5. **Testing**:
   - Manual testing on multiple Chromium browsers
   - Test with slow network connections
   - Test with large numbers of marked videos
   - Verify all features work together
   - Test with ad blockers and other extensions

**Deliverables**:
- Polished, bug-free extension
- Complete documentation
- Performance benchmarks
- Ready for initial user testing

**Acceptance Criteria**:
- No critical bugs
- Extension performs well on low-end hardware
- All features work reliably
- User documentation is clear and complete
- Extension handles errors gracefully without crashing
- Works alongside common YouTube extensions (ad blockers, etc.)

---

### Phase 6: Initial Release and Feedback (Week 7+)

**Objectives**:
- Release to small group of testers
- Gather feedback
- Iterate based on real-world usage

**Tasks**:

1. **Beta Release**:
   - Package extension for distribution
   - Create GitHub releases page
   - Share with small testing group (friends, Reddit community, etc.)
   - Set up feedback channels (GitHub issues, Discord, etc.)

2. **Monitoring and Analytics**:
   - Monitor Supabase usage and database performance
   - Track error logs
   - Watch for abuse patterns

3. **Iteration**:
   - Fix bugs reported by users
   - Adjust threshold if needed based on data
   - Implement critical missing features
   - Improve based on user feedback

4. **Chrome Web Store Preparation** (Post-MVP):
   - Prepare store listing (screenshots, description)
   - Create promotional materials
   - Review Chrome Web Store policies
   - Submit for review

**Deliverables**:
- Beta version in the wild
- Feedback collection process
- Refined roadmap for v1.0

**Acceptance Criteria**:
- At least 10-20 active testers using extension
- Feedback collection mechanism working
- Database handling real-world load
- No critical bugs reported
- Clear plan for official release

---

## Security and Privacy Considerations

### User Privacy

1. **Anonymous Reporting**:
   - No personal information collected (no emails, names, etc.)
   - Extension ID is the only identifier (semi-anonymous)
   - Extension ID is generated by Chrome, not controllable by user
   - Cannot link reports to real-world identities

2. **Data Collection Minimization**:
   - Only collect: video ID, channel ID, extension ID, timestamps
   - No browsing history, watch time, or other behavioral data
   - No tracking across websites (YouTube only)

3. **Local Storage**:
   - User settings stored locally (chrome.storage.local)
   - Reported video IDs cached locally for undo functionality
   - No cloud sync of personal data

4. **Transparency**:
   - Clear privacy policy explaining data collection
   - Open source code (consider making repo public)
   - User can inspect extension source code

### Security Measures

1. **API Security**:
   - Use HTTPS only for all API calls
   - Supabase RLS policies prevent unauthorized data modification
   - PostgreSQL functions use SECURITY DEFINER to control access
   - Rate limiting on functions to prevent abuse

2. **Input Validation**:
   - Validate video IDs and channel IDs format
   - Sanitize all user inputs
   - Prevent SQL injection via parameterized queries

3. **Extension Security**:
   - Manifest V3 compliance (more secure than V2)
   - Content Security Policy (CSP) configured
   - Minimal permissions requested
   - No eval() or inline scripts

4. **Abuse Prevention**:
   - Extension ID prevents single user from mass reporting
   - Threshold system (3+ reports) reduces impact of malicious reports
   - Can implement IP-based rate limiting in Supabase Edge Functions if needed
   - Monitor for abuse patterns (mass reports from single extension)

5. **Data Integrity**:
   - UNIQUE constraints prevent duplicate reports
   - Referential integrity with foreign keys
   - Cached counts synchronized with actual report counts
   - Database transactions ensure consistency

### Compliance

1. **Chrome Web Store Policies**:
   - Follow all Chrome extension policies
   - Clearly disclose data collection in store listing
   - Provide privacy policy link
   - Single purpose description

2. **GDPR/Privacy Regulations**:
   - Minimal data collection (privacy by design)
   - No PII collected
   - Users can "delete" their data by uninstalling (extension ID becomes inactive)
   - Consider providing data export mechanism in future

3. **Terms of Service**:
   - YouTube ToS compliance (no ToS violations)
   - No automated bot reporting (human action required)
   - Don't interfere with YouTube's core functionality
   - Respect YouTube's API usage if needed in future

---

## Deployment Strategy

### Development Environment

1. **Local Development**:
   - Run `npm run dev` to build extension in watch mode
   - Load unpacked extension in Chrome for testing
   - Supabase project accessed via API key (stored in .env file)
   - Use Supabase local development environment (optional, for advanced users)

2. **Version Control**:
   - Git branching strategy: main (stable) + develop (active development)
   - Feature branches for major new features
   - Tag releases (v0.1.0, v0.2.0, etc.)

### Supabase Deployment

1. **Free Tier Limits**:
   - Database: 500MB storage
   - API: 500MB bandwidth/month, 500K API requests/month
   - Row Level Security: Included
   - Auto-pause after 1 week inactivity (pro: doesn't pause)

2. **Monitoring**:
   - Use Supabase dashboard to monitor usage
   - Set up alerts for approaching limits
   - Plan for scaling if adoption grows (paid tier or optimization)

3. **Database Backups**:
   - Supabase free tier includes daily backups (7 day retention)
   - Consider periodic manual exports of critical data

### Extension Distribution

1. **Beta Testing Phase**:
   - Distribute via GitHub releases (download .zip, load unpacked)
   - Or use Chrome Web Store private listing for easier updates
   - Limit distribution to controlled group

2. **Public Release** (Post-MVP):
   - Submit to Chrome Web Store
   - Create store listing with screenshots, description, privacy policy
   - Set up automatic updates
   - Monitor reviews and ratings

3. **Update Strategy**:
   - Semantic versioning (MAJOR.MINOR.PATCH)
   - Chrome auto-updates extensions for users
   - Include changelog in updates
   - Test updates before publishing

### Rollback Plan

1. **Version Management**:
   - Keep previous stable versions available
   - Can revert Chrome Web Store listing if critical bug
   - Tag all releases in Git for easy rollback

2. **Database Migrations**:
   - Test schema changes on development database first
   - Use SQL migration files (version controlled)
   - Backward compatible changes when possible
   - Plan rollback scripts for each migration

---

## Success Metrics

### MVP Success Criteria

**Definition of Done for MVP**: The extension is feature-complete, tested, and ready for initial user testing with all planned MVP features working reliably.

**Key Metrics**:

1. **Functionality**:
   - All 7 core features implemented and working
   - Zero critical bugs
   - Performance: Page load impact < 100ms

2. **Database**:
   - Database schema deployed and operational
   - All PostgreSQL functions tested and working
   - At least 100 videos in database (from testing)

3. **User Testing**:
   - 10+ beta testers actively using extension
   - Report button clicked successfully 50+ times
   - Visual warnings appearing correctly 100% of time
   - Auto-hide feature working as expected

4. **Technical Health**:
   - Extension loads without errors in Chrome
   - No JavaScript console errors during normal usage
   - API calls succeed > 99% of time
   - Supabase free tier limits not exceeded

### Post-MVP Growth Metrics (Future)

- Number of active installations
- Number of videos marked (database growth)
- User engagement (reports per active user)
- User retention (active after 1 week, 1 month)
- Extension rating on Chrome Web Store
- Community feedback sentiment

---

## Risks and Mitigation Strategies

### Risk 1: False Positives / Abuse

**Risk**: Malicious users mass-report legitimate content, harming creators.

**Mitigation**:
- Threshold system (3+ reports) reduces single-user impact
- Extension ID limits one user to one report per video
- Monitor for abuse patterns in database
- Can increase threshold dynamically if abuse detected
- Post-MVP: Implement voting/verification system
- Post-MVP: Add appeals process for creators

**Impact**: Medium | **Likelihood**: Medium

---

### Risk 2: YouTube DOM Changes

**Risk**: YouTube frequently updates its UI, breaking extension's thumbnail detection and icon injection.

**Mitigation**:
- Use flexible selectors (data attributes, classes with wildcards)
- Implement fallback detection methods
- MutationObserver adapts to dynamic changes
- Regular testing after YouTube updates
- Monitor user reports of broken features
- Quick-release hotfixes for critical breaks

**Impact**: High | **Likelihood**: High

---

### Risk 3: Supabase Free Tier Limits

**Risk**: Rapid adoption exceeds 500K API requests/month or 500MB bandwidth.

**Mitigation**:
- Aggressive client-side caching (reduce redundant API calls)
- Batch requests (check multiple videos per API call)
- Cache video status for 24 hours
- Monitor Supabase usage dashboard regularly
- Optimize database queries for efficiency
- Plan for paid tier upgrade ($25/month Pro) if needed
- Consider optimization: serve cached data via CDN

**Impact**: Medium | **Likelihood**: Medium

---

### Risk 4: Low Adoption / Network Effects

**Risk**: Extension requires critical mass of users to be useful (cold start problem).

**Mitigation**:
- Focus on quality over quantity for early adopters
- Target communities concerned about AI content (Reddit, HN, forums)
- Seed database with manually curated AI slop videos
- Make reporting very easy (one-click)
- Show user they're contributing to community (feedback on report)
- Transparent stats to show growing database
- Post-MVP: Partnerships with content quality advocates

**Impact**: High | **Likelihood**: Medium

---

### Risk 5: YouTube ToS Violations

**Risk**: Extension violates YouTube's Terms of Service, leading to issues or countermeasures.

**Mitigation**:
- Review YouTube ToS carefully
- Don't automate any actions (require human clicks)
- Don't interfere with YouTube's core functionality (just add overlay)
- Don't scrape data or use private APIs
- Extension is fully client-side except for own backend
- Consult with legal advisor if needed before wide release
- Monitor for YouTube's response to extension

**Impact**: High | **Likelihood**: Low

---

### Risk 6: Performance Impact

**Risk**: Extension slows down YouTube or causes lag, leading to user churn.

**Mitigation**:
- Minimize DOM manipulation
- Debounce/throttle expensive operations
- Use efficient selectors and caching
- Lazy load non-critical features
- Performance testing on low-end hardware
- Profile extension with Chrome DevTools
- Optimize critical path (icon injection)
- Monitor user complaints about performance

**Impact**: High | **Likelihood**: Low

---

### Risk 7: Data Quality Issues

**Risk**: Database fills with incorrect reports, making extension unreliable.

**Mitigation**:
- Threshold system filters out most false reports
- Undo mechanism allows correction of mistakes
- Post-MVP: Add voting system to verify reports
- Post-MVP: Implement user reputation system
- Monitor report patterns for anomalies
- Can manually review/clean database if needed
- Clear user education about what "AI Slop" means

**Impact**: Medium | **Likelihood**: Medium

---

## Next Steps: Getting Started

### Immediate Action Items (Week 1)

1. **Create project repository**:
   ```bash
   mkdir slopblock
   cd slopblock
   git init
   npm init -y
   ```

2. **Install core dependencies**:
   ```bash
   npm install -D typescript vite @crxjs/vite-plugin
   npm install -D @types/chrome
   npm install @supabase/supabase-js
   ```

3. **Set up Supabase**:
   - Go to https://supabase.com/
   - Create new project (free tier)
   - Save API URL and anon key
   - Run SQL schema script to create tables and functions

4. **Create basic file structure**:
   ```
   slopblock/
   ├── src/
   │   ├── background/
   │   │   └── service-worker.ts
   │   ├── content/
   │   │   └── youtube.ts
   │   ├── popup/
   │   │   ├── popup.html
   │   │   ├── popup.ts
   │   │   └── popup.css
   │   ├── lib/
   │   │   └── supabase.ts
   │   └── manifest.json
   ├── public/
   │   └── icons/
   ├── .env
   ├── vite.config.ts
   ├── tsconfig.json
   ├── package.json
   └── README.md
   ```

5. **Configure Vite and manifest**:
   - Set up vite.config.ts with @crxjs/vite-plugin
   - Create manifest.json (Manifest V3)
   - Configure content scripts for YouTube

6. **Test basic setup**:
   - Run `npm run dev`
   - Load unpacked extension in Chrome
   - Verify extension appears and loads on YouTube

### Key Questions Before Starting

1. **Do you want to proceed with the plan as outlined?**
2. **Any changes or additional requirements?**
3. **Do you want assistance setting up the initial project structure?**
4. **Should we start with Supabase setup or extension scaffolding first?**

---

## Appendix: Reference Materials

### Useful Documentation Links

- **Chrome Extensions**: https://developer.chrome.com/docs/extensions/
- **Manifest V3**: https://developer.chrome.com/docs/extensions/mv3/intro/
- **Supabase Docs**: https://supabase.com/docs
- **@crxjs/vite-plugin**: https://crxjs.dev/vite-plugin/
- **YouTube DOM Structure**: (Reverse engineer via DevTools)

### Similar Extensions for Inspiration

- **SponsorBlock**: https://github.com/ajayyy/SponsorBlock
- **Return YouTube Dislike**: https://github.com/Anarios/return-youtube-dislike
- **DeArrow**: https://github.com/ajayyy/DeArrow

### Development Tools

- **Chrome Extension Reloader**: For faster development iteration
- **Supabase Local Development**: https://supabase.com/docs/guides/cli/local-development
- **Postman**: For testing API endpoints

---

## Document Version

**Version**: 1.0
**Date**: 2025-10-29
**Status**: Draft MVP Plan - Awaiting Approval
**Author**: Claude (Product Strategy Architect)

---

## Approval and Sign-off

Before proceeding to development, please review this document and confirm:

- [ ] The problem statement accurately reflects the issue we're solving
- [ ] The MVP scope includes all must-have features and excludes nice-to-haves
- [ ] The technical architecture is appropriate for the requirements
- [ ] The timeline aligns with expectations
- [ ] Security and privacy considerations are adequate
- [ ] All risks are identified and mitigation strategies are acceptable
- [ ] The success criteria are clear and measurable

**Approved By**: ________________
**Date**: ________________
**Notes**: ________________

---

*Once approved, this document becomes the source of truth for MVP development. All development should align with this specification. Changes to scope require explicit discussion and documentation.*
