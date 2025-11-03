/**
 * Content script for YouTube pages
 * Handles DOM observation, icon injection, and user interactions
 */

import { MessageType, type ExtensionMessage, type MessageResponse } from '../types';
import { CSS_CLASSES, USE_CDN_CACHE } from '../lib/constants';
import { getUserReportState, setUserReportState, ReportState, getAutoHideEnabled, getExtensionId } from '../lib/storage';
import { getQueueManager } from '../lib/queue-manager';
import { getDB } from '../lib/indexeddb';
import './youtube.css'; // Import CSS to ensure it's bundled

// Initialize queue manager
let queueManager: Awaited<ReturnType<typeof getQueueManager>> | null = null;
getQueueManager().then(manager => {
  queueManager = manager;
  console.log('[SlopBlock] Queue manager initialized');
}).catch(error => {
  console.error('[SlopBlock] Failed to initialize queue manager:', error);
});

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
 * Extract video ID from various YouTube page elements (thumbnails)
 * @param element - DOM element that might contain a video ID
 * @returns Video ID or null if not found
 */
function extractVideoIdFromThumbnail(element: Element): string | null {
  // Method 1: Look for link INSIDE the element (not parent)
  const link = element.querySelector('a[href*="/watch?v="]') as HTMLAnchorElement;
  if (link) {
    try {
      const url = new URL(link.href);
      const videoId = url.searchParams.get('v');
      if (videoId && videoId.length === 11) {
        return videoId;
      }
    } catch (e) {
      // Invalid URL, continue to next method
    }
  }

  // Method 2: Try Shorts URLs inside the element
  const shortsLink = element.querySelector('a[href*="/shorts/"]') as HTMLAnchorElement;
  if (shortsLink) {
    const match = shortsLink.href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (match) {
      return match[1];
    }
  }

  // Method 3: Check if element itself is a link
  if (element.tagName === 'A') {
    const href = (element as HTMLAnchorElement).href;
    if (href.includes('/watch?v=')) {
      try {
        const url = new URL(href);
        const videoId = url.searchParams.get('v');
        if (videoId && videoId.length === 11) {
          return videoId;
        }
      } catch (e) {
        // Invalid URL
      }
    }
    if (href.includes('/shorts/')) {
      const match = href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (match) {
        return match[1];
      }
    }
  }

  // Method 4: Try to get from data attributes
  const videoId = element.getAttribute('data-video-id');
  if (videoId && videoId.length === 11) {
    return videoId;
  }

  // Method 5: Check child elements for data-video-id
  const childWithId = element.querySelector('[data-video-id]');
  if (childWithId) {
    const id = childWithId.getAttribute('data-video-id');
    if (id && id.length === 11) {
      return id;
    }
  }

  // Method 6: Check parent elements for data-video-id (as last resort)
  const parentWithId = element.closest('[data-video-id]');
  if (parentWithId) {
    const id = parentWithId.getAttribute('data-video-id');
    if (id && id.length === 11) {
      return id;
    }
  }

  return null;
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

  // Add hover tooltip functionality
  icon.addEventListener('mouseenter', (e) => showTooltip(e.target as HTMLElement, videoId, reportCount));
  icon.addEventListener('mouseleave', hideTooltip);

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
 * Debounce timer for batch processing
 */
let thumbnailProcessTimer: number | null = null;

/**
 * Process all visible thumbnails on the page
 */
async function processThumbnails(): Promise<void> {
  // Check auto-hide setting
  const autoHideEnabled = await getAutoHideEnabled();

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

  // Clear processed video IDs so we recheck everything
  processedVideoIds.clear();

  // Find all thumbnail elements on the page
  // YouTube's DOM structure includes multiple container types
  const thumbnailSelectors = [
    'ytd-thumbnail',                    // Standard thumbnails
    'ytd-video-renderer',               // Video list items
    'ytd-grid-video-renderer',          // Grid layout
    'ytd-compact-video-renderer',       // Sidebar recommendations
    'ytd-rich-item-renderer',           // Home feed items
    'ytd-playlist-video-renderer',      // Playlist videos
    'ytd-movie-renderer',               // Movie results
    'ytd-reel-item-renderer',           // Shorts in grid
    'yt-lockup-view-model',             // New YouTube layout
    'ytm-compact-video-renderer',       // Mobile web
    '#contents ytd-video-renderer',     // Specific path for feed
    '#contents ytd-grid-video-renderer' // Specific path for grid
  ];

  const thumbnails: Element[] = [];
  for (const selector of thumbnailSelectors) {
    const elements = document.querySelectorAll(selector);
    thumbnails.push(...Array.from(elements));
  }

  // Extract video IDs from thumbnails
  const videoIds: string[] = [];
  const thumbnailMap = new Map<string, Element>(); // Map video ID to thumbnail element

  for (const thumbnail of thumbnails) {
    const videoId = extractVideoIdFromThumbnail(thumbnail);
    if (videoId) {
      if (!processedVideoIds.has(videoId)) {
        videoIds.push(videoId);
        thumbnailMap.set(videoId, thumbnail);
        processedVideoIds.add(videoId);
      }
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
  // If CDN cache is enabled, try IndexedDB first
  if (USE_CDN_CACHE) {
    try {
      const db = await getDB();
      const markedVideos: Array<{
        video_id: string;
        effective_trust_points: number;
        raw_report_count: number;
      }> = [];

      // Query each video from IndexedDB
      // Cache only contains marked videos (filtered server-side), so presence = marked
      for (const videoId of videoIds) {
        const video = await db.get('marked-videos', videoId);
        if (video) {
          markedVideos.push({
            video_id: video.video_id,
            effective_trust_points: video.effective_trust_points,
            raw_report_count: video.raw_report_count,
          });
        }
      }

      console.log(`[SlopBlock] Checked ${videoIds.length} videos from cache, found ${markedVideos.length} marked`);
      return markedVideos;
    } catch (cacheError) {
      console.warn('[SlopBlock] Cache query failed, falling back to API:', cacheError);
      // Fall through to API query
    }
  }

  // Fallback: Direct API query (legacy or if cache fails)
  const markedVideos = await sendMessage<Array<{
    video_id: string;
    effective_trust_points: number;
    raw_report_count: number;
  }>>({
    type: MessageType.CHECK_VIDEOS_WEIGHTED,
    payload: { video_ids: videoIds }
  });

  console.log(`[SlopBlock] Checked ${videoIds.length} videos from API, found ${markedVideos.length} marked`);
  return markedVideos;
}

/**
 * Debounced thumbnail processing (waits 500ms after last change)
 */
function scheduleProcessThumbnails(): void {
  if (thumbnailProcessTimer !== null) {
    clearTimeout(thumbnailProcessTimer);
  }

  thumbnailProcessTimer = window.setTimeout(() => {
    processThumbnails();
    thumbnailProcessTimer = null;
  }, 500);
}

/**
 * Observe the page for new thumbnails and add icons as needed
 */
function observeThumbnails(): void {
  // Set up MutationObserver to catch any dynamically loaded content
  const observer = new MutationObserver((mutations) => {
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
      scheduleProcessThumbnails();
    }
  });

  // Observe the entire page for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Process any existing thumbnails
  processThumbnails();
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
 * Update report button state
 * @param button - Button element to update
 * @param reported - Whether video is reported
 * @param removed - Whether report was removed (prevents re-reporting)
 */
function updateButtonState(button: HTMLButtonElement, reported: boolean, removed: boolean = false): void {
  isReported = reported;
  hasRemovedReport = removed;

  // Check if this is a Shorts button (contains the compact text)
  const isShortsButton = button.classList.contains('slopblock-shorts-button');
  // Check if this is a player button (in video controls)
  const isPlayerButton = button.classList.contains('slopblock-player-button');

  if (removed) {
    // Report was removed - disable permanently to prevent spam
    if (isShortsButton) {
      button.innerHTML = '<div style="font-size: 10px; line-height: 1.2;">✓<br>Removed</div>';
    } else if (isPlayerButton) {
      button.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="18" cy="18" r="15" stroke="currentColor" stroke-width="3"/>
          <line x1="10.5" y1="10.5" x2="25.5" y2="25.5" stroke="currentColor" stroke-width="3"/>
        </svg>
      `;
      button.title = 'Report removed';
    } else {
      button.textContent = 'Report Removed';
    }
    button.classList.remove('reported');
    button.classList.add('removed');
    button.disabled = true;
    button.title = 'You have removed your report for this video';
  } else if (reported) {
    if (isShortsButton) {
      button.innerHTML = '<div style="font-size: 10px; line-height: 1.2;">✓<br>Reported</div>';
    } else if (isPlayerButton) {
      button.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M30 9L13.5 25.5l-7.5-7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      button.title = 'Reported as AI Slop - Click to undo';
    } else {
      button.textContent = '✓ Slop Reported';
    }
    button.classList.add('reported');
    button.title = 'Click to undo report';
  } else {
    if (isShortsButton) {
      button.innerHTML = '<div style="font-size: 10px; line-height: 1.2;">AI<br>Slop?</div>';
    } else if (isPlayerButton) {
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
      button.title = 'Report as AI Slop';
    } else {
      button.textContent = '⚠ Report as AI Slop';
    }
    button.classList.remove('reported');
    button.title = 'Mark this video as AI-generated content';
  }
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
      // Remove report (undo) - this will be permanent
      await sendMessage({
        type: MessageType.REMOVE_REPORT,
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

      // Queue report for batch upload
      if (queueManager) {
        try {
          const extensionId = await getExtensionId();
          await queueManager.queueReport(videoId, channelId, extensionId);
          console.log(`[SlopBlock] Report queued for video ${videoId}`);
        } catch (error) {
          console.error('[SlopBlock] Failed to queue report:', error);
          // Don't revert UI - report is still in local storage
          // Will retry on next batch or manual flush
        }
      } else {
        // Fallback to direct API call if queue manager not ready
        console.warn('[SlopBlock] Queue manager not initialized, using direct API');
        await sendMessage({
          type: MessageType.REPORT_VIDEO,
          payload: { video_id: videoId, channel_id: channelId }
        });
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

  // Add click handler
  button.addEventListener('click', () => handleReportClick(videoId, button));

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

  // Setup button state and handlers
  setupReportButton(videoId, button).catch(error => {
    console.error('[SlopBlock] Error setting up button:', error);
  });
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
    addReportButtonToShorts().catch(error => {
      console.error('[SlopBlock] Error during initialization on Shorts page:', error);
    });
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
      addReportButtonToShorts().catch(error => {
        console.error('[SlopBlock] Error adding report button to Shorts:', error);
      });
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
 * Listen for messages from popup (e.g., auto-hide setting changes)
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'AUTO_HIDE_CHANGED') {
    // Reprocess all thumbnails when auto-hide setting changes
    console.log('[SlopBlock] Auto-hide setting changed, reprocessing thumbnails...');
    processThumbnails();
  }
});

/**
 * Start the extension when page is ready
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
    setupNavigationListeners();
  });
} else {
  init();
  setupNavigationListeners();
}
