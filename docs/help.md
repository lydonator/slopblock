# SlopBlock Help & User Guide

Welcome to SlopBlock! This guide will help you understand how to use the extension effectively.

## Table of Contents

- [What is SlopBlock?](#what-is-slopblock)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Reporting Videos](#reporting-videos)
- [Settings](#settings)
- [Understanding the Interface](#understanding-the-interface)
- [Cache & Sync](#cache--sync)
- [FAQ](#frequently-asked-questions)
- [Troubleshooting](#troubleshooting)

---

## What is SlopBlock?

SlopBlock is a community-driven Chrome extension that helps identify AI-generated ("slop") content on YouTube. Using crowdsourced reporting with a trust-based system, it warns users about videos that the community has identified as AI-generated, allowing you to make informed viewing decisions.

### Key Features

- **Trust-Based Community Detection**: Videos marked when community trust threshold is reached
- **Visual Warnings**: Prominent warning icons on video thumbnails with blur effects
- **Instant Feedback**: Reports are processed immediately with offline support
- **Fast Performance**: Lightning-fast checks with local caching (no waiting for servers)
- **Anonymous & Private**: No personal data required, no account needed
- **Auto-Hide Mode**: Optionally filter out AI-marked videos from your feeds

---

## How It Works

### The Trust System

SlopBlock uses a sophisticated trust-based approach that prevents abuse while staying responsive to the community:

1. **You report videos** you identify as AI-generated
2. **Your reports build trust** over time (new users start with lower trust, building to full trust over 30 days)
3. **Your accuracy matters** - correct reports increase your trust score
4. **Videos get marked** when they reach a community trust threshold (weighted by reporter credibility)
5. **Warning indicators appear** on marked videos across YouTube

### Why Trust-Based?

The trust system prevents coordinated attacks (like botnets or brigading) where fake accounts mass-report videos. New accounts have lower influence, while established accounts with good accuracy carry more weight. This keeps the system fair and reliable.

### How Fast Is It?

**Super fast!** The extension caches marked videos locally on your device and syncs updates in the background. Checking videos is instant - no waiting for servers. Updates happen automatically every 30 minutes, so you'll see newly marked videos without doing anything.

---

## Getting Started

### Installation

1. Install SlopBlock from the Chrome Web Store (or load unpacked from source)
2. Click the extension icon in your Chrome toolbar to open settings
3. The extension is now active on YouTube

### First Time Setup

No setup required! SlopBlock works immediately:

- Browse YouTube normally
- Click the extension icon to see your trust score and statistics
- Report videos you identify as AI-generated
- Your reports work offline and sync automatically when you're online

---

## Reporting Videos

### How to Report a Video

**On Watch Page (while watching a video):**

1. Look for the SlopBlock button in the YouTube player controls (bottom right, near settings)
2. Click the triangle icon to report
3. The button instantly changes to a green checkmark

**Button States:**

- 🔴 **Red Triangle** - You haven't reported this video yet (click to report)
- ✅ **Green Checkmark** - You've already reported this video
- ⛔ **Gray Circle** - You removed your report (can't report again)

**Batched Reporting:**

Reports are queued locally and uploaded in batches for better performance. If your connection drops temporarily while reporting, your reports are safely stored and will sync automatically when connection resumes.

### What to Report

Report videos when you identify:

- **AI-generated narration** (text-to-speech, synthetic voices without disclosure)
- **AI-generated visuals** (synthetic images, AI animations, deepfakes)
- **AI-written scripts** (generic, repetitive, low-effort content)
- **Fully automated content** with no human creative input or oversight

### What NOT to Report

Don't report:

- Videos that **disclose** AI use in description/title
- Videos using AI as a **tool** (e.g., AI-assisted editing, AI color grading)
- Music videos with AI-generated visualizations (if disclosed)
- Educational content **about** AI
- Videos you simply disagree with or don't like
- Human content you find low-quality (that's not what "slop" means)

---

## Settings

Access settings by clicking the extension icon in your toolbar.

### Your Trust Score

Your trust score (0-100%) determines how much weight your reports carry. New users start at 30% trust and build to 100% over 30 days based on:

- **Time**: Your trust increases gradually over your first 30 days
- **Accuracy**: Correct reports boost your score, incorrect reports lower it

**Trust Score Colors:**
- 🔴 Red (0-40%): New user or low accuracy
- 🟠 Orange (40-70%): Building trust
- 🟡 Yellow (70-85%): Good standing
- 🟢 Green (85-100%): Trusted contributor

Your accuracy is evaluated after 30 days when the community consensus becomes clear.

### Auto-Hide Marked Videos

**Default: OFF**

When enabled, marked videos are completely hidden from:
- Home feed
- Search results
- Recommended videos
- Channel pages

When disabled (default), videos show warning icons and blur effects instead.

**To Toggle:**
1. Click extension icon
2. Toggle "Auto-hide marked videos" switch
3. Changes apply immediately

### Cache Management

The extension caches marked videos locally for instant performance. You can:

- **View cache status** - See when last synced and how many videos cached
- **Refresh cache** - Manually sync latest marked videos
- **Clear cache** - Reset local cache (will re-download on next sync)

Cache updates automatically every 30 minutes in the background.

---

## Understanding the Interface

### Warning Icons on Thumbnails

When a video reaches the community trust threshold, you'll see:

**Visual Indicators:**
- Large glossy red triangle with "AI" text in center of thumbnail
- Animated shine effect (sweeps diagonally every 3 seconds)
- Blurred and desaturated thumbnail (unless auto-hide is on)

**Hover Effects:**
- Icon scales up slightly
- Thumbnail unblurs to allow preview
- Tooltip shows report information

### Statistics in Popup

**Videos Marked:**
- Total number of videos flagged by the community
- Updated automatically in the background

**Your Reports:**
- Number of videos you've personally reported
- Tracks your contribution to the community

**Trust Score:**
- Your current trust level (0-100%)
- Accuracy rate and report counts
- Help text explaining your status

### Player Control Button

Look for the triangle icon in the YouTube player (bottom right area, near the settings gear).

The button changes based on your report status:
- 🔴 **Red triangle**: Not reported yet
- ✅ **Green checkmark**: You've reported it
- ⛔ **Gray circle**: You removed your report

---

## Cache & Sync

### How Caching Works

SlopBlock uses advanced caching to make everything super fast:

1. **Local Storage**: Marked videos stored on your device in IndexedDB
2. **Background Sync**: Updates every 30 minutes automatically
3. **Instant Checks**: No waiting for servers - lookups are local
4. **Smart Updates**: Only downloads changes, not everything each time

### When Does Sync Happen?

- **On Install**: Downloads current marked videos immediately
- **Every 30 Minutes**: Automatic background sync for new changes
- **Manual Refresh**: Click "Refresh Cache" button in popup
- **After Reporting**: Your new reports sync right away

### What If I'm Offline?

No problem! The extension works offline:

- **Reporting**: Reports queue locally and upload when you're back online
- **Warning Icons**: Cached videos still show warning icons
- **Statistics**: Last known stats displayed until online

### Cache Storage

The cache stores the last 48 hours of marked videos. Older entries are automatically pruned to save space. This keeps your device storage clean while maintaining fast performance.

---

## Frequently Asked Questions

### General Questions

**Q: Is SlopBlock free?**
A: Yes, completely free and open-source.

**Q: Do I need to create an account?**
A: No. The extension works anonymously with no account required.

**Q: Can other users see my reports?**
A: No. Reports are anonymous and aggregated. Only the weighted community consensus is visible.

**Q: Does it work on YouTube mobile app?**
A: No, only on desktop Chrome browser (youtube.com website).

**Q: How is this different from YouTube's dislike count?**
A: SlopBlock specifically identifies AI-generated content, not video quality. It's a specialized tool for transparency about content creation methods.

### Privacy & Data

**Q: What data does SlopBlock collect?**
A: Only:
- A random extension ID (generated locally, never shared with anyone)
- Video IDs you report
- Your report accuracy (evaluated automatically)
- No browsing history, personal info, search queries, or YouTube account data

**Q: Where is my data stored?**
A: In a secure Supabase (PostgreSQL) database with encryption. Plus, marked videos are cached locally on your device for performance.

**Q: Can I delete my reports?**
A: Yes, click the player button again to remove your report. However, once removed, you can't report that video again.

**Q: Does SlopBlock track what videos I watch?**
A: No. We only know about videos you actively report. Your viewing habits are completely private.

### Trust & Accuracy

**Q: How do I increase my trust score?**
A:
1. **Time**: Your trust naturally increases over your first 30 days
2. **Accuracy**: Report correctly - wait 30 days and if the community agrees, your accuracy improves

**Q: How is accuracy measured?**
A: After 30 days, if a video you reported reaches the community threshold, that's marked as accurate. If it never reaches threshold (community disagreed), that's inaccurate.

**Q: What if I accidentally report a video?**
A: Remove your report immediately by clicking the button again. This won't hurt your accuracy since the report is withdrawn.

**Q: Can my trust score go down?**
A: Yes, if many of your reports are found inaccurate over time. But don't worry - everyone makes mistakes occasionally. The system evaluates overall patterns.

**Q: Why do new users have lower trust?**
A: This prevents abuse from fake accounts and bots. As you use the extension legitimately, your trust naturally increases over 30 days.

### Reporting

**Q: How many videos can I report?**
A: Unlimited. Report as many as you identify.

**Q: Can I undo a report?**
A: Yes, click the player button again to remove your report. But note: you can't report that same video again later.

**Q: Why can't I report a video again after removing my report?**
A: This prevents gaming the system by repeatedly adding/removing reports. Each video gets one decision per user.

**Q: Do my reports work offline?**
A: Yes! Reports queue locally and automatically sync when you're back online. You'll get a confirmation toast when they upload.

**Q: How long until my report affects the video's status?**
A: Your report contributes immediately, but whether a video gets marked depends on reaching the community trust threshold (combination of report trust weights).

### Technical

**Q: Why doesn't the icon appear on some videos?**
A: Icons only appear when a video reaches the community trust threshold. If it hasn't reached that yet, no icon shows.

**Q: The extension isn't working. What should I do?**
A: See the [Troubleshooting](#troubleshooting) section below.

**Q: Does SlopBlock slow down YouTube?**
A: No. The extension is heavily optimized with local caching, making it faster than most YouTube extensions.

**Q: Can I use SlopBlock with other extensions?**
A: Yes. SlopBlock is compatible with most YouTube extensions (SponsorBlock, uBlock Origin, Return YouTube Dislike, etc.).

**Q: What's IndexedDB and why does SlopBlock use it?**
A: IndexedDB is a browser storage system. SlopBlock uses it to cache marked videos locally on your device, making checks instant without hitting servers.

**Q: How much storage does the cache use?**
A: Very little - typically under 1MB. The cache is pruned automatically to keep only the last 48 hours of data.

---

## Troubleshooting

### Icons Not Appearing

**Possible causes:**
1. **Not marked yet**: Video hasn't reached community trust threshold
2. **Cache not synced**: Wait for automatic sync or manually refresh cache
3. **Extension not loaded**: Check if extension icon is visible in Chrome toolbar

**Solutions:**
- Refresh the YouTube page (F5)
- Open extension popup and click "Refresh Cache"
- Check Chrome extensions page (`chrome://extensions/`) to ensure SlopBlock is enabled
- Wait 30 seconds for cache to load on first install

### Statistics Not Loading

**Solutions:**
1. Open extension popup
2. Wait 5 seconds for data to load
3. Check "Last Synced" time - if it's old, click "Refresh Cache"
4. Check your internet connection
5. Try closing and reopening the popup

### Trust Score Shows 0%

**This is normal if:**
- You just installed the extension (new users start at 30% trust)
- You haven't made any reports yet
- Your reports are still pending evaluation (takes 30 days)

**Solution:** Keep using the extension normally. Your trust will build over time.

### Auto-Hide Not Working

**Checklist:**
- ✅ Toggle is ON in extension popup
- ✅ Page has been refreshed after enabling
- ✅ Videos are actually marked (check by disabling auto-hide to see if icons appear)

**Solutions:**
- Refresh YouTube page after toggling
- Clear browser cache and refresh
- Disable and re-enable the toggle
- Click "Refresh Cache" to ensure you have latest data

### Player Button Not Appearing

**Possible causes:**
- YouTube's player hasn't fully loaded yet
- New YouTube layout change (rare)
- Another extension is interfering

**Solutions:**
- Wait for video page to fully load (3-5 seconds)
- Refresh page (F5)
- Temporarily disable other YouTube extensions to test
- Report issue on GitHub if problem persists

### Reports Not Syncing

**Symptoms:**
- Made reports offline, but they're not showing as synced when back online

**Solutions:**
- Check your internet connection
- Wait 2-3 minutes for automatic retry
- Open extension popup to trigger manual sync
- Check browser console for errors (right-click popup → Inspect → Console tab)

### Cache Issues

**Problem:** Cache seems stuck or showing wrong videos

**Solutions:**
1. Open extension popup
2. Click "Clear Cache" button
3. Click "Refresh Cache" button
4. Refresh YouTube page

### Extension Completely Not Working

**Step-by-step diagnosis:**

1. **Check extension is enabled:**
   - Go to `chrome://extensions/`
   - Find "SlopBlock"
   - Ensure toggle is ON

2. **Check for errors:**
   - Right-click extension icon → "Inspect popup"
   - Check Console tab for red errors
   - Screenshot errors and report on GitHub

3. **Reload extension:**
   - Go to `chrome://extensions/`
   - Click reload icon (↻) on SlopBlock
   - Refresh YouTube

4. **Clear all data and reinstall:**
   - Open extension popup → Click "Clear Cache"
   - Go to `chrome://extensions/`
   - Remove SlopBlock
   - Restart Chrome
   - Reinstall from Chrome Web Store

5. **Check browser compatibility:**
   - SlopBlock requires Chrome or Chromium-based browsers (Edge, Brave, Opera)
   - Firefox is not supported (different extension API)

---

## Still Need Help?

### Get Support

- **GitHub Issues**: [Report a bug or ask a question](https://github.com/lydonator/slopblock/issues)
- **Documentation**: [Full project documentation](https://github.com/lydonator/slopblock)
- **Privacy Policy**: [How we handle data](https://lydonator.github.io/slopblock/privacy)
- **Submit Feedback**: [Feature requests and suggestions](https://lydonator.github.io/slopblock/feedback)

### Provide Feedback

Found a bug? Have a suggestion? [Open an issue on GitHub](https://github.com/lydonator/slopblock/issues/new)!

---

## Version Information

**Current Version**: 1.0.0 (Phase 4 Complete)

**Latest Changes:**
- Trust-based community consensus system
- Local caching with 48-hour sliding window
- Offline reporting with automatic sync
- Background delta updates every 30 minutes
- Instant performance (no server wait times)
- Enhanced statistics with trust scores
- Cache management UI

**Completed Phases:**
- ✅ Phase 1: Core reporting (watch pages, Shorts)
- ✅ Phase 2: Visual warnings on thumbnails
- ✅ Phase 3: Trust system, offline batching, accuracy evaluation
- ✅ Phase 4: CDN caching, delta sync, optimized performance

**Future Roadmap:**
- Phase 5: Enhanced Shorts integration, improved auto-hide
- Mobile browser investigation
- Channel-level statistics
- Community trends and insights

---

*Thank you for using SlopBlock and contributing to a more transparent YouTube experience!*
