/**
 * Content script for YouTube pages
 * Handles DOM observation, icon injection, and user interactions
 */

import { MessageType, type ExtensionMessage, type MessageResponse } from '../types';
import { CSS_CLASSES } from '../lib/constants';
import { getUserReportState, setUserReportState, ReportState, getAutoHideEnabled } from '../lib/storage';
import { ButtonState, ButtonRendererFactory } from './button-renderers';
import { ThumbnailScanner } from './thumbnail-scanner';
import './youtube.css'; // Import CSS to ensure it's bundled

/**
 * Error Boundary Wrapper
 * Wraps async event handlers to prevent unhandled promise rejections
 * Shows user-friendly toast notification on errors and logs details
 */
function withErrorBoundary<T extends any[]>(
  fn: (...args: T) => Promise<void>,
  context: string
): (...args: T) => void {
  return (...args: T): void => {
    fn(...args).catch((error: any) => {
      // Log error with context for debugging
      console.error(`[SlopBlock] Error in ${context}:`, error);

      // Don't show toast for extension context invalidation (normal during reload)
      if (error?.message?.includes('Extension context invalidated')) {
        return;
      }

      // Show user-friendly error message
      showToast(`Operation failed: ${error?.message || 'Unknown error'}. Please try again.`, 4000);
    });
  };
}

/**
 * Send a message to the background service worker
 * Handles extension context invalidation gracefully
 */
async function sendMessage<T>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      reject(new Error('Extension context invalidated'));
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response: MessageResponse<T>) => {
        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError;
          // Don't log context invalidation errors (normal during extension reload)
          if (!error.message?.includes('Extension context invalidated')) {
            console.error('[SlopBlock] Message error:', error);
          }
          reject(error);
        } else if (response?.success) {
          resolve(response.data as T);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Extract channel ID from Shorts page (active video only)
 * @returns Channel ID or null if not found
 */
function extractChannelIdFromShorts(): string | null {
  // For Shorts, we need to scope to the ACTIVE video renderer only
  // This prevents grabbing channel info from recommended videos
  const activeRenderer = document.querySelector('ytd-reel-video-renderer[is-active]');
  if (!activeRenderer) {
    return null;
  }

  // Method 1: Look for channel link within the active Shorts renderer
  const channelLinkSelectors = [
    'a[href*="/@"]',
    'a[href*="/channel/"]',
    'yt-formatted-string.ytd-channel-name a',
    '#channel-name a'
  ];

  for (const selector of channelLinkSelectors) {
    const channelLink = activeRenderer.querySelector(selector) as HTMLAnchorElement;
    if (channelLink && channelLink.href) {
      // Try to extract channel ID (format: UC...)
      const channelMatch = channelLink.href.match(/\/channel\/(UC[\w-]+)/);
      if (channelMatch) {
        return channelMatch[1];
      }

      // Try to extract from handle (format: @username)
      const handleMatch = channelLink.href.match(/\/@([\w-]+)/);
      if (handleMatch) {
        const handleId = '@' + handleMatch[1];
        return handleId;
      }
    }
  }

  // Method 2: Try ytInitialData for Shorts structure
  try {
    const ytInitialData = (window as any).ytInitialData;
    if (ytInitialData) {
      // Shorts structure in ytInitialData
      const reelItems = ytInitialData?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.richGridRenderer?.contents;
      if (reelItems) {
        // Could extract more info here if needed
      }
    }
  } catch (error) {
    console.error('[SlopBlock] Error extracting from ytInitialData:', error);
  }

  return null;
}

/**
 * Extract channel ID from watch page
 * @returns Channel ID or null if not found
 */
function extractChannelId(): string | null {
  // If on Shorts, use Shorts-specific extraction
  if (isShortsPage()) {
    return extractChannelIdFromShorts();
  }

  // Method 1: Try to get from meta tags
  const metaTag = document.querySelector('meta[itemprop="channelId"]');
  if (metaTag) {
    const channelId = metaTag.getAttribute('content');
    return channelId;
  }

  // Method 2: Try to get from channel link in page (multiple selectors)
  const channelLinkSelectors = [
    'ytd-channel-name a[href*="/@"]',
    'ytd-channel-name a[href*="/channel/"]',
    '#owner a[href*="/@"]',
    '#owner a[href*="/channel/"]',
    'ytd-video-owner-renderer a[href*="/@"]',
    'ytd-video-owner-renderer a[href*="/channel/"]',
    'a.yt-simple-endpoint[href*="/@"]',
    'a.yt-simple-endpoint[href*="/channel/"]'
  ];

  for (const selector of channelLinkSelectors) {
    const channelLink = document.querySelector(selector) as HTMLAnchorElement;
    if (channelLink && channelLink.href) {
      // Try to extract channel ID (format: UC...)
      const channelMatch = channelLink.href.match(/\/channel\/(UC[\w-]+)/);
      if (channelMatch) {
        return channelMatch[1];
      }

      // Try to extract from handle (format: @username)
      const handleMatch = channelLink.href.match(/\/@([\w-]+)/);
      if (handleMatch) {
        // For now, we'll use the handle as the channel ID
        // Note: This isn't ideal, but it's better than nothing
        const handleId = '@' + handleMatch[1];
        return handleId;
      }
    }
  }

  // Method 3: Try to get from ytInitialData (YouTube's page data)
  try {
    const ytInitialData = (window as any).ytInitialData;
    if (ytInitialData) {
      // Try primary owner renderer path
      const videoDetails = ytInitialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
      if (videoDetails) {
        for (const content of videoDetails) {
          const videoOwner = content?.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer;
          if (videoOwner?.navigationEndpoint?.browseEndpoint?.browseId) {
            const channelId = videoOwner.navigationEndpoint.browseEndpoint.browseId;
            return channelId;
          }
        }
      }
    }
  } catch (error) {
    console.error('[SlopBlock] Error extracting channel ID from ytInitialData:', error);
  }

  return null;
}

/**
 * Extract video ID from current page URL (watch page or Shorts)
 * @returns Video ID or null if not on a video page
 */
function getVideoId(): string | null {
  const url = new URL(window.location.href);

  // Regular watch page: /watch?v=VIDEO_ID
  if (url.pathname === '/watch') {
    return url.searchParams.get('v');
  }

  // Shorts: /shorts/VIDEO_ID
  if (url.pathname.startsWith('/shorts/')) {
    const match = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  return null;
}

/**
 * Check if current page is a Shorts page
 */
function isShortsPage(): boolean {
  return window.location.pathname.startsWith('/shorts/');
}

/**
 * Check if current page is a regular watch page
 */
function isWatchPage(): boolean {
  return window.location.pathname === '/watch';
}

/**
 * Hide a video element completely (auto-hide mode)
 * @param thumbnail - Thumbnail or video element to hide
 */
function hideVideoElement(thumbnail: Element): void {
  // Find the parent container that should be hidden
  // Different YouTube layouts use different container elements
  const hideCandidates = [
    thumbnail.closest('ytd-video-renderer'),
    thumbnail.closest('ytd-grid-video-renderer'),
    thumbnail.closest('ytd-compact-video-renderer'),
    thumbnail.closest('ytd-rich-item-renderer'),
    thumbnail.closest('ytd-playlist-video-renderer'),
    thumbnail.closest('ytd-movie-renderer'),
    thumbnail.closest('ytd-reel-item-renderer'),
    thumbnail.closest('yt-lockup-view-model'),
    thumbnail.closest('ytm-compact-video-renderer'),
  ];

  // Hide the first valid container we find
  for (const container of hideCandidates) {
    if (container) {
      container.classList.add(CSS_CLASSES.HIDDEN_VIDEO);
      return;
    }
  }

  // Fallback: hide the thumbnail itself if no container found
  thumbnail.classList.add(CSS_CLASSES.HIDDEN_VIDEO);
}

/**
 * Add warning icon to a thumbnail element
 * @param thumbnail - Thumbnail element to add icon to
 * @param videoId - Video ID for this thumbnail
 * @param reportCount - Number of reports for this video
 */
function addWarningIcon(thumbnail: Element, videoId: string, reportCount: number): void {
  // Check if icon already exists
  if (thumbnail.querySelector(`.${CSS_CLASSES.WARNING_ICON}`)) {
    return;
  }

  // Find the actual thumbnail image container inside the element
  // Try multiple selectors for different YouTube layouts
  let container: HTMLElement | null = null;

  const containerSelectors = [
    'ytd-thumbnail',                      // Standard thumbnail wrapper
    '#thumbnail',                         // Thumbnail by ID
    'yt-image',                           // Image wrapper
    '.yt-core-image',                     // Core image class
    'a#thumbnail',                        // Link thumbnail
    'yt-thumbnail-view-model',            // New layout
    '.yt-lockup__thumbnail',              // Lockup layout
    'a[href*="/watch"]',                  // Fallback to video link
  ];

  for (const selector of containerSelectors) {
    container = thumbnail.querySelector(selector) as HTMLElement;
    if (container) {
      break;
    }
  }

  if (!container) {
    console.warn('[SlopBlock] Could not find thumbnail container for video:', videoId);
    return;
  }

  // Ensure container has relative positioning for absolute icon placement
  const computedStyle = window.getComputedStyle(container);
  if (computedStyle.position === 'static') {
    container.style.position = 'relative';
  }

  // Create warning icon element with glossy SVG triangle
  const icon = document.createElement('div');
  icon.className = CSS_CLASSES.WARNING_ICON;
  icon.setAttribute('data-video-id', videoId);
  icon.setAttribute('data-report-count', reportCount.toString());
  icon.title = `Reported as AI slop by ${reportCount} user${reportCount > 1 ? 's' : ''}`;

  // Use unique gradient ID to avoid conflicts with multiple icons
  const gradientId = `glossGradient-${videoId}`;

  // Insert glossy triangle SVG with animated shine clipped to triangle shape
  icon.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#ff5252;stop-opacity:0.95" />
          <stop offset="40%" style="stop-color:#d32f2f;stop-opacity:0.75" />
          <stop offset="100%" style="stop-color:#8b1a1a;stop-opacity:0.7" />
        </linearGradient>

        <!-- Mask to clip shine to triangle shape -->
        <mask id="${gradientId}-mask">
          <path d="M18 3L3 30h30L18 3z" fill="white"/>
        </mask>

        <!-- Animated shine gradient (subtle transparency) -->
        <linearGradient id="${gradientId}-shine" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:rgba(255,255,255,0);stop-opacity:0">
            <animate attributeName="offset" values="-0.5;1.5" dur="3s" repeatCount="indefinite"/>
          </stop>
          <stop offset="0%" style="stop-color:rgba(255,255,255,0.65);stop-opacity:1">
            <animate attributeName="offset" values="-0.4;1.6" dur="3s" repeatCount="indefinite"/>
          </stop>
          <stop offset="10%" style="stop-color:rgba(255,255,255,0.65);stop-opacity:1">
            <animate attributeName="offset" values="-0.3;1.7" dur="3s" repeatCount="indefinite"/>
          </stop>
          <stop offset="10%" style="stop-color:rgba(255,255,255,0);stop-opacity:0">
            <animate attributeName="offset" values="-0.2;1.8" dur="3s" repeatCount="indefinite"/>
          </stop>
        </linearGradient>
      </defs>

      <!-- Triangle base -->
      <path d="M18 3L3 30h30L18 3z" fill="url(#${gradientId})"/>
      <path d="M18 3L10 18L26 18Z" fill="white" opacity="0.3"/>
      <path d="M18 6L13 16L23 16Z" fill="white" opacity="0.2"/>

      <!-- Animated shine overlay (masked to triangle) -->
      <rect x="0" y="0" width="36" height="36" fill="url(#${gradientId}-shine)" mask="url(#${gradientId}-mask)"/>

      <!-- Text -->
      <text x="18" y="25.5" fill="#000" font-size="12" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif" opacity="0.6">AI</text>
      <text x="17.5" y="25" fill="white" font-size="12" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif" letter-spacing="0.5">AI</text>
    </svg>
  `;

  // Add hover tooltip functionality (wrapped with error boundary)
  icon.addEventListener('mouseenter', withErrorBoundary(
    async (e) => showTooltip(e.target as HTMLElement, videoId, reportCount),
    'tooltip:mouseenter'
  ));
  icon.addEventListener('mouseleave', () => hideTooltip());

  // Add class to thumbnail container to trigger blur effect
  const thumbnailContainer = thumbnail.closest('ytd-thumbnail, ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-reel-item-renderer');
  if (thumbnailContainer) {
    thumbnailContainer.classList.add('slopblock-marked-thumbnail');
  }

  container.appendChild(icon);
}

/**
 * Show tooltip with video statistics
 * @param iconElement - The warning icon element
 * @param videoId - Video ID
 * @param reportCount - Number of reports
 */
function showTooltip(iconElement: HTMLElement, videoId: string, reportCount: number): void {
  // Remove any existing tooltip
  hideTooltip();

  const tooltip = document.createElement('div');
  tooltip.className = CSS_CLASSES.TOOLTIP;
  tooltip.innerHTML = `
    <strong>AI Slop Warning</strong><br>
    Reports: ${reportCount}<br>
    <small>Video ID: ${videoId}</small>
  `;

  // Position tooltip above the icon
  const rect = iconElement.getBoundingClientRect();
  tooltip.style.position = 'fixed';
  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top - 10}px`;
  tooltip.style.transform = 'translateX(-50%) translateY(-100%)';

  document.body.appendChild(tooltip);
}

/**
 * Hide and remove the tooltip
 */
function hideTooltip(): void {
  const existingTooltip = document.querySelector(`.${CSS_CLASSES.TOOLTIP}`);
  if (existingTooltip) {
    existingTooltip.remove();
  }
}

/**
 * Set to track which videos we've already processed (to avoid duplicate checks)
 */
const processedVideoIds = new Set<string>();

/**
 * Global thumbnail scanner instance (with caching)
 */
const thumbnailScanner = new ThumbnailScanner();

/**
 * Process all visible thumbnails on the page
 * @param overrideAutoHide - Optional override for auto-hide setting (used when responding to toggle changes)
 */
async function processThumbnails(overrideAutoHide?: boolean): Promise<void> {
  // Check auto-hide setting (use override if provided to avoid race condition with batched writes)
  const autoHideEnabled = overrideAutoHide !== undefined ? overrideAutoHide : await getAutoHideEnabled();

  // CRITICAL: Clean up ALL blur classes, icons, and hidden state to prevent stale state
  // YouTube's SPA may reorder/reuse DOM elements, so we start completely fresh
  document.querySelectorAll('.slopblock-marked-thumbnail').forEach(el => {
    el.classList.remove('slopblock-marked-thumbnail');
  });

  // Remove ALL warning icons - we'll re-add them for currently marked videos
  document.querySelectorAll('.slopblock-warning-icon').forEach(icon => {
    icon.remove();
  });

  // Remove ALL hidden state - we'll re-apply based on current auto-hide setting
  document.querySelectorAll('.slopblock-hidden').forEach(el => {
    el.classList.remove('slopblock-hidden');
  });

  // Clear processed video IDs and scanner cache so we recheck everything
  processedVideoIds.clear();
  thumbnailScanner.clearCache();

  // OPTIMIZATION: Use ThumbnailScanner for single-pass DOM query
  // Old approach: 12 separate querySelectorAll calls + 6 querySelector per thumbnail
  // New approach: 1 querySelectorAll call + cached extraction
  const thumbnailMap = thumbnailScanner.scanPage();

  // Extract video IDs from scan results
  const videoIds: string[] = [];

  for (const [videoId, _thumbnail] of thumbnailMap) {
    if (!processedVideoIds.has(videoId)) {
      videoIds.push(videoId);
      processedVideoIds.add(videoId);
    }
  }

  if (videoIds.length === 0) {
    return;
  }

  // Check videos from cache or API (Phase 4 - CDN cache with fallback)
  try {
    const markedVideos = await checkVideosWithFallback(videoIds);

    // Process marked videos based on auto-hide setting
    for (const video of markedVideos) {
      const thumbnail = thumbnailMap.get(video.video_id);
      if (thumbnail) {
        // Use raw_report_count for display (shows actual number of reports)
        // effective_trust_points is used server-side for threshold (2.5 points)
        const displayCount = video.raw_report_count;

        if (autoHideEnabled) {
          // Hide the entire video element when auto-hide is enabled
          hideVideoElement(thumbnail);
        } else {
          // Show warning icon with blur effect when auto-hide is disabled
          addWarningIcon(thumbnail, video.video_id, displayCount);
        }
      }
    }
  } catch (error: any) {
    // Silently ignore context invalidation errors (normal during extension reload)
    if (!error?.message?.includes('Extension context invalidated')) {
      console.error('[SlopBlock] Error checking videos:', error);
    }
  }
}

/**
 * Check videos from IndexedDB cache or fallback to API
 * Phase 4: CDN cache strategy with graceful fallback
 */
async function checkVideosWithFallback(videoIds: string[]): Promise<Array<{
  video_id: string;
  effective_trust_points: number;
  raw_report_count: number;
}>> {
  // IMPORTANT: Content scripts cannot access service worker IndexedDB directly
  // We must use message passing to ask the service worker to check the cache

  // Service worker will check its IndexedDB cache first, then fall back to API if needed
  const markedVideos = await sendMessage<Array<{
    video_id: string;
    effective_trust_points: number;
    raw_report_count: number;
  }>>({
    type: MessageType.CHECK_VIDEOS_WEIGHTED,
    payload: { video_ids: videoIds }
  });

  console.log(`[SlopBlock] Checked ${videoIds.length} videos, found ${markedVideos.length} marked`);
  return markedVideos;
}

/**
 * ThumbnailObserver - Lifecycle-managed MutationObserver
 * Prevents memory leaks by properly disconnecting observer on cleanup
 */
class ThumbnailObserver {
  private observer: MutationObserver | null = null;
  private isObserving: boolean = false;
  private debounceTimer: number | null = null;
  private readonly DEBOUNCE_MS = 500;

  /**
   * Start observing for thumbnail changes
   */
  start(): void {
    if (this.isObserving) {
      console.warn('[SlopBlock] ThumbnailObserver already running');
      return;
    }

    console.log('[SlopBlock] Starting ThumbnailObserver');
    this.isObserving = true;

    // Create observer with debounced processing
    this.observer = new MutationObserver((mutations) => {
      // Check if any mutations added thumbnail-related elements
      let foundNewThumbnails = false;

      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node instanceof Element) {
              // Check if the added node is or contains a thumbnail
              if (
                node.tagName === 'YTD-THUMBNAIL' ||
                node.tagName === 'YTD-VIDEO-RENDERER' ||
                node.tagName === 'YTD-GRID-VIDEO-RENDERER' ||
                node.tagName === 'YTD-RICH-ITEM-RENDERER' ||
                node.querySelector('ytd-thumbnail')
              ) {
                foundNewThumbnails = true;
                break;
              }
            }
          }
        }
        if (foundNewThumbnails) break;
      }

      if (foundNewThumbnails) {
        this.scheduleProcessing();
      }
    });

    // Observe the entire page for changes
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Process any existing thumbnails on start
    this.scheduleProcessing();
  }

  /**
   * Schedule debounced thumbnail processing
   */
  private scheduleProcessing(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      processThumbnails();
      this.debounceTimer = null;
    }, this.DEBOUNCE_MS);
  }

  /**
   * Stop observing and clean up resources
   */
  stop(): void {
    if (!this.isObserving) {
      return;
    }

    console.log('[SlopBlock] Stopping ThumbnailObserver');
    this.isObserving = false;

    // Disconnect observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Clear debounce timer
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Check if observer is currently active
   */
  isActive(): boolean {
    return this.isObserving;
  }
}

// Global instance of ThumbnailObserver
let thumbnailObserver: ThumbnailObserver | null = null;

/**
 * Observe the page for new thumbnails and add icons as needed
 * DEPRECATED: Use ThumbnailObserver class instead
 * Kept for backward compatibility during migration
 */
function observeThumbnails(): void {
  if (!thumbnailObserver) {
    thumbnailObserver = new ThumbnailObserver();
  }

  if (!thumbnailObserver.isActive()) {
    thumbnailObserver.start();
  }
}

/**
 * Show a toast notification to the user
 * @param message - Message to display
 * @param duration - Duration in milliseconds (default: 3500ms)
 */
function showToast(message: string, duration: number = 3500): void {
  // Remove any existing toast
  const existingToast = document.querySelector('.slopblock-toast');
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'slopblock-toast';
  toast.textContent = message;

  document.body.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Current button state tracker
 * Note: Used by Shorts buttons and for backward compatibility
 */
let currentVideoId: string | null = null;
let currentButton: HTMLButtonElement | null = null;
let isReported: boolean = false;
let hasRemovedReport: boolean = false;

/**
 * Flag to prevent duplicate player button injection
 */
let isInjectingPlayerButton: boolean = false;

/**
 * Update report button state using Strategy pattern
 * @param button - Button element to update
 * @param reported - Whether video is reported
 * @param removed - Whether report was removed (prevents re-reporting)
 */
function updateButtonState(button: HTMLButtonElement, reported: boolean, removed: boolean = false): void {
  // Update global state trackers
  isReported = reported;
  hasRemovedReport = removed;

  // Determine button state
  let state: ButtonState;
  if (removed) {
    state = ButtonState.REMOVED;
  } else if (reported) {
    state = ButtonState.REPORTED;
  } else {
    state = ButtonState.NOT_REPORTED;
  }

  // Get appropriate renderer and apply state
  const renderer = ButtonRendererFactory.create(button);
  renderer.render(button, state);
}

/**
 * Handle report button click
 * @param videoId - Video ID to report/unreport
 * @param button - Button element
 */
async function handleReportClick(videoId: string, button: HTMLButtonElement): Promise<void> {
  // Prevent action if report was already removed
  if (hasRemovedReport) {
    return;
  }

  try {
    button.disabled = true;
    button.style.opacity = '0.6';

    if (isReported) {
      // Remove report (undo) - check queue first, then database if already uploaded
      await sendMessage({
        type: MessageType.REMOVE_QUEUED_REPORT,
        payload: { video_id: videoId }
      });

      // Update local storage to mark as removed
      await setUserReportState(videoId, ReportState.REMOVED);

      updateButtonState(button, false, true); // Mark as removed
      showToast('Report removed');
    } else {
      // Add report using queue manager (Phase 3 - optimistic UI)
      const channelId = extractChannelId();
      if (!channelId) {
        showToast('Failed to identify channel. Please try again.');
        button.disabled = false;
        button.style.opacity = '1';
        return;
      }

      // Optimistic UI update - immediate feedback
      await setUserReportState(videoId, ReportState.REPORTED);
      updateButtonState(button, true, false);
      showToast('Video reported as AI slop');

      // Send message to background worker to queue report
      // Background worker handles extension ID and queue management
      try {
        await sendMessage({
          type: MessageType.QUEUE_REPORT,
          payload: { video_id: videoId, channel_id: channelId }
        });
        console.log(`[SlopBlock] Report queued for video ${videoId}`);
      } catch (error) {
        console.error('[SlopBlock] Failed to queue report:', error);
        // Don't revert UI - report is still in local storage
        // Will retry on next batch or manual flush
      }
    }
  } catch (error: any) {
    // Silently ignore context invalidation errors (normal during extension reload)
    if (error?.message?.includes('Extension context invalidated')) {
      return;
    }
    console.error('[SlopBlock] Error handling report:', error);
    showToast('Failed to update report. Please try again.');
  } finally {
    // Only re-enable if not in removed state
    if (!hasRemovedReport) {
      button.disabled = false;
      button.style.opacity = '1';
    }
  }
}

/**
 * Common logic to set up report button state
 */
async function setupReportButton(videoId: string, button: HTMLButtonElement): Promise<void> {
  // Store reference
  currentButton = button;

  // Add click handler (wrapped with error boundary)
  button.addEventListener('click', withErrorBoundary(
    async () => handleReportClick(videoId, button),
    'button:reportClick'
  ));

  // Check button state from local storage only (no database call needed)
  try {
    const reportState = await getUserReportState(videoId);

    switch (reportState) {
      case ReportState.REMOVED:
        // User previously removed their report - show as disabled
        updateButtonState(button, false, true);
        break;
      case ReportState.REPORTED:
        // User has reported this video - show as reported (green, clickable to undo)
        updateButtonState(button, true, false);
        break;
      case ReportState.NOT_REPORTED:
      default:
        // User has not reported - show as unreported (red, clickable)
        updateButtonState(button, false, false);
        break;
    }
  } catch (error) {
    console.error('Error checking report status:', error);
    // On error, default to unreported state
    updateButtonState(button, false, false);
  }
}

/**
 * Add report button to watch page player controls
 * Injects into .ytp-right-controls for alignment with other control buttons
 */
function addReportButtonToWatchPage(): void {
  const videoId = getVideoId();
  if (!videoId) {
    return;
  }

  // Prevent concurrent injections
  if (isInjectingPlayerButton) {
    return;
  }

  isInjectingPlayerButton = true;

  // Remove ALL existing SlopBlock buttons (prevents duplicates)
  document.querySelectorAll('.slopblock-player-button').forEach(btn => btn.remove());

  // Wait for player controls to be ready, then inject
  const controlBar = document.querySelector('.ytp-right-controls') as HTMLElement;
  if (controlBar) {
    injectPlayerButton(videoId, controlBar);
    isInjectingPlayerButton = false;
  } else {
    // If controls not ready, wait for them
    waitForPlayerControls(videoId);
  }
}

/**
 * Wait for player controls to appear
 */
function waitForPlayerControls(videoId: string): void {
  const observer = new MutationObserver(() => {
    const controlBar = document.querySelector('.ytp-right-controls') as HTMLElement;
    if (controlBar) {
      observer.disconnect();
      injectPlayerButton(videoId, controlBar);
      isInjectingPlayerButton = false;
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Safety timeout: disconnect after 10 seconds
  setTimeout(() => {
    observer.disconnect();
    isInjectingPlayerButton = false;
  }, 10000);
}

/**
 * Inject the player button into controls
 */
function injectPlayerButton(videoId: string, controlBar: HTMLElement): void {
  // Double-check no button exists
  if (controlBar.querySelector('.slopblock-player-button')) {
    return;
  }

  // Create button matching YouTube's player button structure
  const button = document.createElement('button');
  button.className = 'ytp-button slopblock-player-button';
  button.setAttribute('data-video-id', videoId);
  button.setAttribute('aria-label', 'Report as AI Slop');
  button.title = 'Report as AI Slop';

  // Create SVG icon for crisp display (viewBox matches YouTube standard)
  button.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="glossGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#ff5252;stop-opacity:0.95" />
          <stop offset="40%" style="stop-color:#d32f2f;stop-opacity:0.75" />
          <stop offset="100%" style="stop-color:#8b1a1a;stop-opacity:0.7" />
        </linearGradient>
      </defs>
      <path d="M18 3L3 30h30L18 3z" fill="url(#glossGradient)"/>
      <path d="M18 3L10 18L26 18Z" fill="white" opacity="0.3"/>
      <path d="M18 6L13 16L23 16Z" fill="white" opacity="0.2"/>
      <text x="18" y="25.5" fill="#000" font-size="12" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif" opacity="0.6">AI</text>
      <text x="17.5" y="25" fill="white" font-size="12" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif" letter-spacing="0.5">AI</text>
    </svg>
  `;

  // Insert at beginning of right controls (leftmost position)
  controlBar.insertBefore(button, controlBar.firstChild);

  // Setup button state and handlers (wrapped with error boundary)
  withErrorBoundary(
    async () => setupReportButton(videoId, button),
    'button:setupReportButton'
  )();
}


/**
 * Add report button to Shorts page
 */
async function addReportButtonToShorts(): Promise<void> {
  const videoId = getVideoId();
  if (!videoId) {
    return;
  }

  // Don't re-inject if same video
  if (currentVideoId === videoId && currentButton && document.body.contains(currentButton)) {
    return;
  }

  currentVideoId = videoId;
  // Reset state for new video
  isReported = false;
  hasRemovedReport = false;

  // Remove old button if exists (including wrapper)
  if (currentButton) {
    // Remove wrapper parent if it exists
    const wrapper = currentButton.parentElement;
    if (wrapper && (wrapper.classList.contains('slopblock-button-wrapper') || wrapper.childNodes.length === 1)) {
      wrapper.remove();
    } else {
      currentButton.remove();
    }
    currentButton = null;
  }

  // Also check for any orphaned buttons in the DOM
  const orphanedButtons = document.querySelectorAll('.slopblock-shorts-button');
  orphanedButtons.forEach(btn => {
    const wrapper = btn.parentElement;
    if (wrapper && wrapper.classList.contains('slopblock-button-wrapper')) {
      wrapper.remove();
    } else {
      btn.remove();
    }
  });

  // PRIMARY APPROACH: Try actions container first (fastest and most reliable)
  const actionsContainerSelectors = [
    'ytd-reel-video-renderer[is-active] #actions',
    '#shorts-player #actions',
    'ytd-shorts #actions'
  ];

  // First, try to find the container immediately (no wait)
  for (const selector of actionsContainerSelectors) {
    const container = document.querySelector(selector) as HTMLElement;
    if (container) {
      // Check if button already exists to prevent duplicates
      const existingButton = container.querySelector('.slopblock-shorts-button');
      if (existingButton) {
        return;
      }

      // Create button styled for Shorts
      const reportButton = document.createElement('button');
      reportButton.className = CSS_CLASSES.REPORT_BUTTON + ' slopblock-shorts-button';
      reportButton.innerHTML = '<div style="font-size: 10px; line-height: 1.2;">AI<br>Slop?</div>';
      reportButton.title = 'Report as AI Slop';

      // Create wrapper to match YouTube's button structure
      const buttonWrapper = document.createElement('div');
      buttonWrapper.className = 'slopblock-button-wrapper';
      buttonWrapper.style.display = 'flex';
      buttonWrapper.style.flexDirection = 'column';
      buttonWrapper.style.alignItems = 'center';
      buttonWrapper.style.marginBottom = '8px';
      buttonWrapper.appendChild(reportButton);

      // Insert at the beginning of the actions container
      container.insertBefore(buttonWrapper, container.firstChild);

      await setupReportButton(videoId, reportButton);
      return;
    }
  }

  // If not found immediately, wait for it to appear
  try {
    await waitForElement('ytd-reel-video-renderer[is-active] #actions', 5000);

    const container = document.querySelector('ytd-reel-video-renderer[is-active] #actions') as HTMLElement;
    if (container) {
      // Check if button already exists
      const existingButton = container.querySelector('.slopblock-shorts-button');
      if (existingButton) {
        return;
      }

      const reportButton = document.createElement('button');
      reportButton.className = CSS_CLASSES.REPORT_BUTTON + ' slopblock-shorts-button';
      reportButton.innerHTML = '<div style="font-size: 10px; line-height: 1.2;">AI<br>Slop?</div>';
      reportButton.title = 'Report as AI Slop';

      const buttonWrapper = document.createElement('div');
      buttonWrapper.className = 'slopblock-button-wrapper';
      buttonWrapper.style.display = 'flex';
      buttonWrapper.style.flexDirection = 'column';
      buttonWrapper.style.alignItems = 'center';
      buttonWrapper.style.marginBottom = '8px';
      buttonWrapper.appendChild(reportButton);

      container.insertBefore(buttonWrapper, container.firstChild);
      await setupReportButton(videoId, reportButton);
      return;
    }
  } catch (error) {
    console.warn('[SlopBlock] Timed out waiting for Shorts UI elements');
  }
}

/**
 * Wait for an element to appear in the DOM
 * @param selector - CSS selector to wait for
 * @param timeout - Maximum time to wait in milliseconds
 * @returns Promise that resolves when element is found
 */
function waitForElement(selector: string, timeout: number = 5000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);
  });
}

/**
 * Initialize the content script
 */
function init(): void {
  // Check if on watch page or Shorts page
  if (isWatchPage()) {
    addReportButtonToWatchPage();
  } else if (isShortsPage()) {
    // Wrap async initialization with error boundary
    withErrorBoundary(
      async () => addReportButtonToShorts(),
      'init:addReportButtonToShorts'
    )();
  }

  // Start observing thumbnails on all pages
  observeThumbnails();
}

/**
 * Debounce timer for navigation
 */
let navigationDebounceTimer: number | null = null;
let lastNavigationUrl: string = '';

/**
 * Handle YouTube navigation events
 * YouTube uses custom events for SPA navigation
 */
function handleYouTubeNavigation(): void {
  const currentUrl = window.location.href;

  // Debounce rapid navigation events to the same URL
  if (currentUrl === lastNavigationUrl && navigationDebounceTimer !== null) {
    return;
  }

  lastNavigationUrl = currentUrl;

  // Clear any pending navigation
  if (navigationDebounceTimer !== null) {
    clearTimeout(navigationDebounceTimer);
  }

  // Debounce to prevent multiple rapid calls
  navigationDebounceTimer = window.setTimeout(() => {
    navigationDebounceTimer = null;

    if (isWatchPage()) {
      addReportButtonToWatchPage();
    } else if (isShortsPage()) {
      // Wrap async navigation handler with error boundary
      withErrorBoundary(
        async () => addReportButtonToShorts(),
        'navigation:addReportButtonToShorts'
      )();
    }
  }, 0);
}

/**
 * Setup navigation listeners
 */
function setupNavigationListeners(): void {
  // Listen for YouTube's custom navigation event
  document.addEventListener('yt-navigate-finish', handleYouTubeNavigation);

  // Fallback: also listen for URL changes via pushState/replaceState
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    handleYouTubeNavigation();
  };

  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    handleYouTubeNavigation();
  };

  // Also listen for popstate (back/forward buttons)
  window.addEventListener('popstate', handleYouTubeNavigation);
}

/**
 * Setup cleanup listeners for observer lifecycle
 * Prevents memory leaks on page unload and SPA navigation
 */
function setupCleanupListeners(): void {
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (thumbnailObserver) {
      thumbnailObserver.stop();
    }
  });

  // Cleanup on SPA navigation start (before new page loads)
  document.addEventListener('yt-navigate-start', () => {
    if (thumbnailObserver) {
      thumbnailObserver.stop();
    }
  });

  // Restart observer on navigation finish (after new page loads)
  document.addEventListener('yt-navigate-finish', () => {
    if (thumbnailObserver && !thumbnailObserver.isActive()) {
      thumbnailObserver.start();
    }
  });
}

/**
 * Listen for messages from popup (e.g., auto-hide setting changes)
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'AUTO_HIDE_CHANGED') {
    // Reprocess all thumbnails when auto-hide setting changes
    // Use payload value to avoid race condition with batched storage writes
    const enabled = message.payload?.enabled ?? false;
    console.log(`[SlopBlock] Auto-hide setting changed to ${enabled}, reprocessing thumbnails...`);

    // Wrap async thumbnail processing with error boundary
    withErrorBoundary(
      async () => processThumbnails(enabled),
      'message:processThumbnails'
    )();
  }
});

/**
 * Start the extension when page is ready
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
    setupNavigationListeners();
    setupCleanupListeners();
  });
} else {
  init();
  setupNavigationListeners();
  setupCleanupListeners();
}
