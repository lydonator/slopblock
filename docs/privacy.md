# SlopBlock Privacy Policy

**Last Updated:** November 3, 2025
**Version:** 1.0.0 (Phase 4 Complete)

---

## Our Commitment to Privacy

SlopBlock is designed with **privacy-first** principles. We believe in transparency, minimal data collection, and user control. This privacy policy explains what data we collect, why we collect it, and how it's used.

---

## Summary (TL;DR)

- ✅ **No personal information** collected
- ✅ **No browsing history** tracked
- ✅ **No YouTube account** data accessed
- ✅ **Anonymous reporting** system with trust scoring
- ✅ **Local caching** for privacy (IndexedDB on your device)
- ✅ **Open source** code for full transparency
- ✅ **No third-party** sharing
- ✅ **No advertising** or tracking pixels

---

## What Data We Collect

### 1. Extension Installation ID

**What:** A randomly generated UUID (e.g., `f47ac10b-58cc-4372-a567-0e02b2c3d479`)

**When:** Generated on first run of the extension

**Stored:** Locally in your browser (Chrome storage API)

**Purpose:** Prevents duplicate reports and enables the "remove report" feature

**Sensitive:** No - completely random, not linked to any personal information

**Example:**
```json
{
  "extension_id": "7e8d9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a"
}
```

### 2. Video Report Data

**What:** YouTube video IDs and your extension ID when you report a video

**When:** Only when you click the "Report" button

**Stored:** In our Supabase (PostgreSQL) database

**Purpose:** Track community reports and display warnings when trust threshold is met

**Sensitive:** No - video IDs are public, extension IDs are random

**Phase 3 Addition - Trust Fields:**
- `trust_weight`: Your report's weight (0.30-1.00 based on time + accuracy)
- `accuracy_status`: 'pending', 'accurate', or 'inaccurate' (evaluated after 30 days)
- `accuracy_evaluated_at`: Timestamp when accuracy was determined

**Example:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "extension_id": "7e8d9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
  "channel_id": "UCuAXFkgsw1L7xaCfnd5JJOw",
  "reported_at": "2025-01-31T12:34:56Z",
  "trust_weight": 0.65,
  "accuracy_status": "pending"
}
```

### 3. Trust Score Data (Phase 3)

**What:** Your extension's trust score and accuracy statistics

**When:** Calculated automatically based on your reports over time

**Stored:** In our Supabase (PostgreSQL) database

**Purpose:** Prevent abuse from fake accounts while allowing legitimate users to contribute

**Sensitive:** No - just numerical scores tied to random extension ID

**Example:**
```json
{
  "extension_id": "7e8d9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
  "trust_score": 0.75,
  "accuracy_rate": 0.82,
  "accurate_reports": 14,
  "inaccurate_reports": 3,
  "pending_reports": 8,
  "first_seen_at": "2025-01-01T10:00:00Z"
}
```

### 4. User Settings

**What:** Your preferences (e.g., auto-hide enabled/disabled)

**When:** When you change settings in the popup

**Stored:** Locally in your browser (Chrome storage API)

**Purpose:** Remember your preferences across browsing sessions

**Sensitive:** No - just boolean flags

**Example:**
```json
{
  "auto_hide_enabled": false
}
```

### 5. Local Cache Data (Phase 4)

**What:** Marked video IDs cached locally for instant performance

**When:** Downloaded automatically in background (hourly full blob + 30-min delta syncs)

**Stored:** Locally in your browser (IndexedDB)

**Purpose:** Enable instant video checks without server calls

**Sensitive:** No - just public video IDs and timestamps

**Note:** This data never leaves your device. It's a local performance cache only.

**Example:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "effective_trust_points": 3.2,
  "is_marked": true,
  "cached_at": "2025-11-03T14:22:00Z"
}
```

---

## What Data We DON'T Collect

We explicitly **do not** collect:

- ❌ Your name, email, or YouTube account information
- ❌ Your browsing history or watch history
- ❌ Your search queries
- ❌ Your IP address or location
- ❌ Device information or browser fingerprints
- ❌ Cookies or tracking pixels
- ❌ Any data from videos you didn't report
- ❌ Comments, likes, subscriptions, or other YouTube activity

---

## How We Use Your Data

### Primary Use: Community Reporting with Trust System

1. You report a video as AI-generated
2. We store the video ID + your extension ID + trust weight
3. We calculate effective trust points (sum of all weighted reports)
4. If trust points ≥ 2.5, we show warnings to all users
5. Your individual reports remain anonymous
6. After 30 days, your report's accuracy is evaluated to improve your trust score

### Secondary Use: Trust & Accuracy

- **Trust Score Calculation**: Based on 50% time (0-30 days) + 50% accuracy (correct reports)
- **Accuracy Evaluation**: After 30 days, if video reaches threshold → accurate; if not → inaccurate
- **Abuse Prevention**: New accounts start at 30% trust, building to 100% over 30 days

### Tertiary Use: Statistics

- **Global stats**: Count of marked videos
- **Personal stats**: Your report count and trust score (displayed only to you)
- **No user profiling**: We don't analyze your reporting patterns or predict behavior

### Local Caching (Phase 4)

- **Background downloads**: Full cache blob 24 hourly + delta blobs every 30 minutes
- **Local storage**: Marked videos cached in IndexedDB on your device
- **Privacy benefit**: Video checks happen locally with no server communication

---

## Data Storage & Security

### Infrastructure

**Hosting:** Supabase (secure PostgreSQL database)

**Encryption:**
- Data encrypted in transit (HTTPS/TLS)
- Data encrypted at rest (AES-256)

**Access Control:**
- Row Level Security (RLS) policies enforced
- Anonymous users can only read aggregated data
- Writes only through secure database functions

### Data Retention

**Reports:** Retained indefinitely for community accuracy and trust evaluation

**Trust Scores:** Retained indefinitely (tied to anonymous extension ID)

**Extension IDs:** Retained indefinitely (but anonymous)

**Deleted Reports:** If you remove a report, the report is deleted but trust history remains

**Local Cache:** Automatically pruned to 48-hour window (older entries deleted from your device)

### No Data Selling

We **never** sell, rent, or share your data with third parties. Period.

---

## Your Rights & Control

### You Can:

1. **View your trust score**: Check your trust level and accuracy in the extension popup
2. **View your reports**: See your report count and statistics
3. **Remove reports**: Click the report button again to undo (but can't report same video again)
4. **Control visibility**: Toggle auto-hide mode on/off
5. **Clear local cache**: Use "Clear Cache" button in popup to delete cached data
6. **Delete all data**: Uninstall the extension (local data cleared automatically)

### Data Deletion

To delete all your data:

1. **Local data**: Uninstall the extension
2. **Server data**: Reports are anonymous, but you can request full deletion by opening an issue on GitHub with your extension ID

---

## Third-Party Services

### Supabase

We use Supabase for database hosting.

**Privacy Policy:** https://supabase.com/privacy

**Data Location:** USA (configurable region)

**Certification:** SOC 2 Type II compliant

### No Analytics

We do **not** use:
- Google Analytics
- Mixpanel
- Amplitude
- Or any other tracking service

---

## Permissions Explained

SlopBlock requests these Chrome permissions:

### `alarms`
**Why:** Schedule periodic background tasks for batch uploading
**Access:** Local browser

Why this is necessary:
- User reports are batched locally for 10 minutes to reduce server load
- The alarms API schedules these batch uploads in the background
- Without this permission, reports would be lost when YouTube pages are closed
- This ensures data persistence and reliable community reporting

### `host_permissions: *://*.youtube.com/*`
**Why:** Inject scripts on YouTube pages to show warnings and report button (Youtube Player)
**Access:** Only YouTube domain, no access to other sites

### No Other Permissions

We don't request:
- ❌ `tabs` - Can't see your open tabs
- ❌ `history` - Can't see browsing history
- ❌ `webRequest` - Can't intercept network traffic
- ❌ `cookies` - Can't read your cookies

No user data is collected beyond anonymous video reports. _No personal information, browsing history, or YouTube account data is accessed_.

---

## Children's Privacy (COPPA Compliance)

SlopBlock does not knowingly collect data from children under 13. Since we collect no personal information, COPPA restrictions are not applicable. Parents: SlopBlock is safe for children to use.

---

## International Users (GDPR)

### European Union Users

Under GDPR, you have the right to:

- **Access:** View your reports (contact us with extension ID)
- **Rectification:** Correct your reports (remove and re-report)
- **Erasure:** Request deletion (contact us with extension ID)
- **Data Portability:** Export your reports (contact us)
- **Object:** Stop using the extension (uninstall)

**Data Controller:** SlopBlock Project

**Legal Basis:** Legitimate interest (crowdsourced content identification)

**Data Protection Officer:** N/A (small project, no DPO required)

### California Users (CCPA)

Under CCPA, you have the right to:

- Know what data is collected (see "What Data We Collect")
- Delete your data (see "Your Rights & Control")
- Opt-out of "sale" (we don't sell data, so N/A)

---

## Changes to This Policy

We may update this privacy policy as the extension evolves.

**Notification:** Major changes will be announced via extension update notes

**Version History:** All versions tracked on GitHub

**Your Consent:** Continued use implies acceptance of updates

---

## Open Source Transparency

SlopBlock is **100% open source**:

**GitHub Repository:** https://github.com/lydonator/slopblock

You can:
- Review the code
- Verify data collection claims
- Audit security practices
- Contribute improvements

---

## Contact & Data Requests

### General Questions

**GitHub Issues:** https://github.com/lydonator/slopblock/issues

**Email:** support@slopblock.cc

### Data Requests

To request data access or deletion:

1. Open a GitHub issue with the title "Data Request"
2. Include your extension ID (found in console: `chrome.storage.local.get()`)
3. Specify request type (access, deletion, export)
4. We'll respond within 30 days

---

## Legal Compliance

**Jurisdiction:** United States

**Governing Law:** California law (or your jurisdiction)

**Dispute Resolution:** Informal resolution preferred; binding arbitration if necessary

---

## Trust & Transparency

### Our Principles

1. **Privacy by Design:** Minimal data collection built into architecture
2. **Transparency:** Open source code, public database schema
3. **User Control:** You decide what to report and what to hide
4. **Community First:** Serving users, not advertisers

### Security Best Practices

- Regular dependency updates
- Secure API design (Supabase RLS policies)
- No client-side secrets
- HTTPS-only communication
- CSP (Content Security Policy) headers

---

## Questions?

If you have any questions about this privacy policy or how your data is handled, please:

1. Check the [Help & FAQ page](https://slopblock.cc/help)
2. Open a [GitHub Discussion](https://github.com/lydonator/slopblock/discussions)
3. File an [Issue](https://github.com/lydonator/slopblock/issues)

---

*We take your privacy seriously. Thank you for trusting SlopBlock.*
