/**
 * Application-wide constants
 */

/**
 * Extension version
 * Single source of truth for version number across the application
 */
export const VERSION = '1.0.0';

/**
 * Threshold for marking a video as AI slop
 * Videos need this many unique reports to show warning
 */
export const REPORT_THRESHOLD = 3;

/**
 * Cache duration for video data (in milliseconds)
 * After this time, cached data should be refreshed
 */
export const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Storage keys (now stored in IndexedDB, not chrome.storage)
 * @deprecated These keys are now used in IndexedDB stores, not chrome.storage
 */
export const STORAGE_KEYS = {
  EXTENSION_ID: 'slopblock_extension_id', // Legacy - for migration only
  AUTO_HIDE_ENABLED: 'slopblock_auto_hide', // Legacy - for migration only
  VIDEO_CACHE: 'slopblock_video_cache', // Legacy - for migration only
  REMOVED_REPORTS: 'slopblock_removed_reports', // Legacy - for migration only
} as const;

/**
 * CSS class names used by the extension
 */
export const CSS_CLASSES = {
  WARNING_ICON: 'slopblock-warning-icon',
  TOOLTIP: 'slopblock-tooltip',
  HIDDEN_VIDEO: 'slopblock-hidden',
  REPORT_BUTTON: 'slopblock-report-button',
} as const;

/**
 * YouTube URL patterns
 */
export const YOUTUBE_PATTERNS = {
  WATCH_PAGE: /^https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  VIDEO_ID: /[a-zA-Z0-9_-]{11}/,
  CHANNEL_ID: /UC[a-zA-Z0-9_-]{22}/,
} as const;

/**
 * CDN URLs for 48-hour sliding window cache
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_PROJECT_ID = SUPABASE_URL.replace('https://', '').split('.')[0];

export const CDN_BASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public/cdn-cache`;
export const FULL_BLOB_URL = `${CDN_BASE_URL}/marked-videos-48h.json`;
export const METADATA_URL = `${CDN_BASE_URL}/metadata.json`;
export const DELTA_CDN_URL = `${CDN_BASE_URL}/delta-latest.json`; // Delta from CDN storage (not Edge Function)

/**
 * Cache settings for 48-hour sliding window
 */
export const CACHE_WINDOW_HOURS = 48;
export const DELTA_UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes (more frequent than hourly blob regen)
export const CACHE_PRUNE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Feature flag: Enable CDN caching
 * Set to false during testing, true for production
 */
export const USE_CDN_CACHE = import.meta.env.VITE_USE_CDN_CACHE === 'true';
