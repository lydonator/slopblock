# SlopBlock Help & User Guide

Welcome to SlopBlock! This guide will help you understand how to use the extension effectively.

## Table of Contents

- [What is SlopBlock?](#what-is-slopblock)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Reporting Videos](#reporting-videos)
- [Settings](#settings)
- [Understanding the Interface](#understanding-the-interface)
- [FAQ](#frequently-asked-questions)
- [Troubleshooting](#troubleshooting)

---

## What is SlopBlock?

SlopBlock is a community-driven Chrome extension that helps identify AI-generated ("slop") content on YouTube. Using crowdsourced reporting, it warns users about videos that multiple people have identified as AI-generated, allowing you to make informed viewing decisions.

### Key Features

- **Crowdsourced Detection**: Videos marked by 3+ users show warning indicators
- **Visual Warnings**: Prominent warning icons on video thumbnails
- **Auto-Hide Mode**: Optionally filter out AI-marked videos from your feeds
- **Anonymous Reporting**: No personal data required
- **Community Statistics**: See how many videos have been marked globally

---

## How It Works

### The Reporting Threshold

SlopBlock uses a democratic approach:

1. Any user can report a video as AI-generated
2. When a video receives **3 or more reports**, it's marked
3. Warning indicators appear on thumbnails for marked videos
4. You can toggle between warning mode and auto-hide mode

### Why 3 Reports?

The threshold prevents false positives from individual users while ensuring quick community response to genuine AI content.

---

## Getting Started

### Installation

1. Install SlopBlock from the Chrome Web Store
2. Click the extension icon in your Chrome toolbar
3. The extension is now active on YouTube

### First Time Setup

No setup required! SlopBlock works immediately:

- Browse YouTube normally
- Click the extension icon to see settings and statistics
- Report videos you identify as AI-generated

---

## Reporting Videos

### How to Report a Video

**On Watch Page (while watching a video):**

1. Look for the SlopBlock button in the YouTube player controls (bottom right)
2. Click the triangle warning icon
3. The button will turn green to confirm your report

**Button States:**

- **Red Triangle**: Video not yet reported by you
- **Green Triangle**: You've reported this video
- **Gray Triangle**: Video has been removed from your reports

### What to Report

Report videos when you identify:

- **AI-generated narration** (text-to-speech without disclosure)
- **AI-generated visuals** (synthetic images, animations)
- **AI-written scripts** (generic, repetitive content)
- **Fully automated content** with no human creative input

### What NOT to Report

Don't report:

- Videos that **disclose** AI use in description/title
- Videos using AI as a **tool** (e.g., AI-assisted editing)
- Music videos with lyric visualization
- Educational content **about** AI
- Videos you simply don't like

---

## Settings

Access settings by clicking the extension icon in your toolbar.

### Auto-Hide Marked Videos

**Default: OFF**

When enabled, videos with 3+ reports are completely hidden from:
- Home feed
- Search results
- Recommended videos
- Channel pages

When disabled (default), videos show warning icons and blur effects instead.

**To Toggle:**
1. Click extension icon
2. Toggle "Auto-hide marked videos" switch
3. Changes apply immediately

---

## Understanding the Interface

### Warning Icons on Thumbnails

When a video has 3+ reports, you'll see:

**Visual Indicators:**
- Large red triangle with "AI" text in center of thumbnail
- Blurred and desaturated thumbnail (unless auto-hide is on)

**Hover Effects:**
- Icon scales up slightly
- Thumbnail unblurs to allow preview
- Tooltip shows report count

### Statistics in Popup

**Videos Marked:**
- Total number of videos across YouTube with 3+ reports
- Global community statistic

**Your Reports:**
- Number of videos you've personally reported
- Tracks your contribution to the community

### Player Control Button

Look for the triangle icon in the YouTube player (bottom right area, near other controls).

**Icon Colors:**
- **Red (#ff6b6b)**: Ready to report
- **Green (#4caf50)**: Already reported
- **Gray (#888)**: Report removed

---

## Frequently Asked Questions

### General Questions

**Q: Is SlopBlock free?**
A: Yes, completely free and open-source.

**Q: Do I need to create an account?**
A: No. The extension works anonymously.

**Q: Can other users see my reports?**
A: No. Reports are anonymous and aggregated. Only the count is visible.

**Q: Does it work on YouTube mobile app?**
A: No, only on desktop Chrome browser (youtube.com website).

### Privacy & Data

**Q: What data does SlopBlock collect?**
A: Only:
- A random extension ID (generated locally)
- Video IDs you report
- No browsing history, personal info, or account data

**Q: Where is my data stored?**
A: In a secure Supabase (PostgreSQL) database with encryption and privacy policies.

**Q: Can I delete my reports?**
A: Yes, click the player button again to remove your report.

### Reporting

**Q: How many videos can I report?**
A: Unlimited. Report as many as you identify.

**Q: Can I undo a report?**
A: Yes, click the player button again to remove your report.

**Q: What if I accidentally report a video?**
A: Just click the button again to remove it. The count will decrease.

**Q: What happens if a video is falsely marked?**
A: With a 3-report threshold, false positives are rare. We're exploring a soft trust based system that will prevent 
false-flagging operations as the extension becomes more popular

### Technical

**Q: Why doesn't the icon appear on some videos?**
A: Icons only appear when a video has 3+ reports. If no one has reported it yet, no icon shows.

**Q: The extension isn't working. What should I do?**
A: See the [Troubleshooting](#troubleshooting) section below.

**Q: Does SlopBlock slow down YouTube?**
A: No. The extension is optimized to run efficiently with minimal impact.

**Q: Can I use SlopBlock with other extensions?**
A: Yes. SlopBlock is compatible with most YouTube extensions (SponsorBlock, uBlock Origin, etc.).

---

## Troubleshooting

### Icons Not Appearing

**Possible causes:**
1. **No reports yet**: Video hasn't reached 3-report threshold
2. **Cache issue**: Try refreshing the page (F5)
3. **Extension not loaded**: Check if extension icon is visible in Chrome toolbar

**Solutions:**
- Refresh the YouTube page
- Click extension icon to verify it's installed
- Check Chrome extensions page (`chrome://extensions/`) to ensure SlopBlock is enabled

### Statistics Not Loading

**Solutions:**
1. Open extension popup
2. Wait 5 seconds for API response
3. If still showing "Error", check your internet connection
4. Try closing and reopening the popup

### Auto-Hide Not Working

**Checklist:**
- ✅ Toggle is ON in extension popup
- ✅ Page has been refreshed after enabling
- ✅ Videos actually have 3+ reports (check by disabling auto-hide)

**Solutions:**
- Refresh YouTube page after toggling
- Clear browser cache
- Disable and re-enable the toggle

### Player Button Not Appearing

**Possible causes:**
- YouTube's player hasn't fully loaded
- New YouTube layout not yet supported
- Extension script blocked by another extension

**Solutions:**
- Wait for video page to fully load
- Refresh page (F5)
- Temporarily disable other YouTube extensions to test
- Report issue on GitHub if problem persists

### Extension Completely Not Working

**Step-by-step diagnosis:**

1. **Check extension is enabled:**
   - Go to `chrome://extensions/`
   - Find "SlopBlock"
   - Ensure toggle is ON

2. **Check for errors:**
   - Right-click extension icon → "Inspect popup"
   - Check Console tab for errors
   - Report errors on GitHub

3. **Reload extension:**
   - Go to `chrome://extensions/`
   - Click reload icon (↻) on SlopBlock
   - Refresh YouTube

4. **Reinstall extension:**
   - Uninstall SlopBlock
   - Restart Chrome
   - Reinstall from Chrome Web Store

---

## Still Need Help?

### Get Support

- **GitHub Issues**: [Report a bug or request a feature](https://github.com/lydonator/slopblock/issues)
- **Documentation**: [Read the full docs](https://github.com/lydonator/slopblock)
- **Community**: [Discussions and Q&A](https://github.com/lydonator/slopblock/discussions)

### Provide Feedback

Found a bug? Have a suggestion? Please [submit feedback](https://github.com/lydonator/slopblock/issues/new)!

---

## Version Information

**Current Version**: 0.1.0 (MVP)

**Latest Changes:**
- Initial release
- Core reporting functionality
- Visual warning indicators
- Auto-hide feature
- Statistics tracking

**Roadmap:**
- Mobile support investigation
- Enhanced statistics
- User reputation/ trust system
- Channel-level marking
- API rate limiting / caching improvements

---

*Thank you for using SlopBlock and contributing to a more transparent and human YouTube!*
