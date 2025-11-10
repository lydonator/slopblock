/**
 * Background service worker
 * Handles extension lifecycle, API communication, and message routing
 */

// CRITICAL: Polyfill for Vite's module preload code
// Service workers don't have 'window', so we alias it to 'self'
// This prevents "window is not defined" errors from bundled code
if (typeof window === 'undefined') {
  // @ts-ignore - Polyfill for service worker context
  globalThis.window = self;
}

import { testConnection } from '../lib/supabase';
import { getExtensionId, runMigrations, getAutoHideEnabled, setAutoHideEnabled } from '../lib/storage';
import * as api from './api';
import { MessageType, type ExtensionMessage, type MessageResponse } from '../types';
import { initializeCache, refreshCache, performDeltaSync, handleCacheAlarm } from './cache-manager';
import { USE_CDN_CACHE } from '../lib/constants';
import { getDB, runStorageMigration, getCacheMetadata, getCachedVideoCount, clearCache } from '../lib/indexeddb';
import { getQueueManager } from '../lib/queue-manager';

/**
 * Initialize the extension on installation/startup
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  // CRITICAL: Run chrome.storage → IndexedDB migration FIRST
  // This must happen before any other storage operations
  await runStorageMigration();

  // Run config migrations (after storage migration)
  await runMigrations();

  // Generate or retrieve extension ID
  await getExtensionId();

  // Test Supabase connection
  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to Supabase. Check your .env configuration.');
  }

  // Initialize CDN cache if enabled
  if (USE_CDN_CACHE) {
    if (details.reason === 'install' || details.reason === 'update') {
      console.log('[SlopBlock] Extension installed/updated, initializing cache...');
      await initializeCache();
    }
  }

  // Initialize queue manager (runs in background worker context)
  await getQueueManager();
  console.log('[SlopBlock] Queue manager initialized in background worker');
});

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((
  message: ExtensionMessage,
  _sender,
  sendResponse: (response: MessageResponse) => void
) => {
  // Handle async operations
  handleMessage(message)
    .then((data) => {
      sendResponse({ success: true, data });
    })
    .catch((error) => {
      console.error('Error handling message:', error);
      sendResponse({
        success: false,
        error: error.message || 'Unknown error occurred',
      });
    });

  // Return true to indicate we will send a response asynchronously
  return true;
});

/**
 * REMOVED: Broadcast system (popup ports and real-time updates)
 * Popup now queries queue + Supabase on open for accurate stats
 * Simpler architecture without timing dependencies
 */

/**
 * Route messages to appropriate handlers
 */
async function handleMessage(message: ExtensionMessage): Promise<any> {
  switch (message.type) {
    case MessageType.REPORT_VIDEO:
      return await api.reportVideo(
        message.payload.video_id,
        message.payload.channel_id
      );

    case MessageType.REMOVE_REPORT:
      return await api.removeReport(message.payload.video_id);

    case MessageType.CHECK_VIDEOS:
      return await api.getMarkedVideos(message.payload.video_ids);

    case MessageType.GET_CHANNEL_STATS:
      return await api.getChannelStats(message.payload.channel_id);

    case MessageType.CHECK_USER_REPORT:
      return await api.checkUserReport(message.payload.video_id);

    case MessageType.GET_USER_STATS:
      return await api.getUserStats();

    // Phase 3: Trust-weighted message types
    case MessageType.BATCH_REPORT_VIDEOS:
      return await api.batchReportVideos(message.payload.reports);

    case MessageType.CHECK_VIDEOS_WEIGHTED:
      // Phase 4: Check IndexedDB cache first, fall back to API
      if (USE_CDN_CACHE) {
        try {
          const db = await getDB();

          // CRITICAL FIX: Check if cache has ANY data before trusting empty results
          // An empty cache could mean:
          // 1. Initial install (no sync yet)
          // 2. Blob sync failed
          // 3. Blob was empty at last sync (but DB has new data now)
          const cacheSize = await db.count('marked-videos');

          if (cacheSize === 0) {
            console.warn('[SlopBlock Service Worker] Cache is empty, falling back to API');
            return await api.getMarkedVideosWeighted(message.payload.video_ids);
          }

          // Cache has data - trust it for queries
          const videoIds = message.payload.video_ids;
          const markedVideos: Array<{
            video_id: string;
            effective_trust_points: number;
            raw_report_count: number;
          }> = [];

          // Query each video from cache
          for (const videoId of videoIds) {
            const video = await db.get('marked-videos', videoId);
            if (video && video.is_marked) {
              markedVideos.push({
                video_id: video.video_id,
                effective_trust_points: video.effective_trust_points,
                raw_report_count: video.raw_report_count,
              });
            }
          }

          console.log(`[SlopBlock Service Worker] Checked ${videoIds.length} videos from cache (${cacheSize} total cached), found ${markedVideos.length} marked`);
          return markedVideos;
        } catch (error) {
          console.warn('[SlopBlock Service Worker] Cache query failed, falling back to API:', error);
          // Fall through to API
        }
      }
      // Fallback to API if cache disabled or failed
      return await api.getMarkedVideosWeighted(message.payload.video_ids);

    case MessageType.CHECK_USER_REPORT_WEIGHTED:
      return await api.checkUserReportWeighted(message.payload.video_id);

    case MessageType.GET_TRUST_SCORE:
      return await api.getTrustScore();

    // Phase 3: Cold-start solution
    case MessageType.GET_COMMUNITY_STATS:
      return await api.getCommunityStats();

    // Phase 4: CDN Cache management
    case MessageType.REFRESH_CACHE:
      await refreshCache();
      return { success: true };

    case MessageType.DELTA_SYNC:
      await performDeltaSync();
      return { success: true };

    case MessageType.GET_CACHE_METADATA:
      const metadata = await getCacheMetadata();
      return metadata;

    case MessageType.GET_CACHED_VIDEO_COUNT:
      const count = await getCachedVideoCount();
      return count;

    case MessageType.CLEAR_CACHE:
      await clearCache();
      return { success: true };

    case MessageType.GET_AUTO_HIDE_SETTING:
      const autoHideEnabled = await getAutoHideEnabled();
      return autoHideEnabled;

    case MessageType.SET_AUTO_HIDE_SETTING:
      await setAutoHideEnabled(message.payload.enabled);
      return { success: true };

    // Queue a report (Phase 3 - runs in background worker context)
    case MessageType.QUEUE_REPORT:
      const queueManager = await getQueueManager();
      const extensionId = await getExtensionId();
      await queueManager.queueReport(
        message.payload.video_id,
        message.payload.channel_id,
        extensionId
      );
      return { success: true };

    // Remove a queued report (Phase 3 - undo functionality)
    case MessageType.REMOVE_QUEUED_REPORT:
      const queueMgrRemove = await getQueueManager();
      const extensionIdRemove = await getExtensionId();
      const wasInQueue = await queueMgrRemove.removeQueuedReport(
        message.payload.video_id,
        extensionIdRemove
      );

      // If report was not in queue, it must have been uploaded already
      // In that case, call the API to remove it from the database
      if (!wasInQueue) {
        console.log(`Report for ${message.payload.video_id} not in queue, removing from database`);
        return await api.removeReport(message.payload.video_id);
      }

      console.log(`Report for ${message.payload.video_id} removed from queue`);
      return { success: true };

    // Get queue size for statistics display
    case MessageType.GET_QUEUE_SIZE:
      const queueMgr = await getQueueManager();
      const queueSize = await queueMgr.getQueueSize();
      return { queueSize };

    // Set upload interval (testing only - recreates alarm)
    case MessageType.SET_UPLOAD_INTERVAL:
      const intervalSeconds = message.payload.seconds;
      const periodInMinutes = Math.max(1, intervalSeconds / 60);

      chrome.alarms.create('queue-upload', {
        periodInMinutes,
      });

      console.log(`[SlopBlock Service Worker] Upload interval updated to ${intervalSeconds}s (${periodInMinutes} minutes)`);
      return { success: true };

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(async () => {
  // Run storage migration first (in case user upgraded while browser was closed)
  await runStorageMigration();

  // Run migrations on startup too
  await runMigrations();

  // Test connection on startup
  await testConnection();
});

/**
 * Handle Chrome Alarms for queue processing and cache management
 * Alarms survive service worker termination (unlike setInterval)
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'queue-upload') {
    console.log('[SlopBlock Service Worker] Alarm triggered: processing queue');
    const queueManager = await getQueueManager();
    await queueManager.processQueue();
  } else if (alarm.name === 'cache-full-refresh' || alarm.name === 'cache-delta-sync' || alarm.name === 'cache-pruning') {
    console.log(`[SlopBlock Service Worker] Alarm triggered: ${alarm.name}`);
    await handleCacheAlarm(alarm.name);
  }
});

/**
 * REMOVED: Keep-alive mechanism
 * No longer needed - Chrome Alarms API keeps service worker active when needed
 */
