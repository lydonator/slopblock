/**
 * Background service worker
 * Handles extension lifecycle, API communication, and message routing
 */

import { testConnection } from '../lib/supabase';
import { getExtensionId, runMigrations } from '../lib/storage';
import * as api from './api';
import { MessageType, type ExtensionMessage, type MessageResponse } from '../types';
import { initializeCache, refreshCache, performDeltaSync } from './cache-manager';
import { USE_CDN_CACHE } from '../lib/constants';

/**
 * Initialize the extension on installation/startup
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  // Run config migrations first (inspired by SponsorBlock)
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
 * Connected popup ports for real-time updates
 * Inspired by SponsorBlock's persistent popup connection
 */
const popupPorts = new Set<chrome.runtime.Port>();

/**
 * Handle popup port connections for real-time updates
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup-connection') {
    console.log('[SlopBlock] Popup connected');
    popupPorts.add(port);

    port.onDisconnect.addListener(() => {
      console.log('[SlopBlock] Popup disconnected');
      popupPorts.delete(port);
    });

    port.onMessage.addListener(async (message) => {
      // Handle bidirectional messages from popup
      try {
        const data = await handleMessage(message);
        port.postMessage({ success: true, data });
      } catch (error: any) {
        port.postMessage({
          success: false,
          error: error.message || 'Unknown error occurred',
        });
      }
    });
  }
});

/**
 * Broadcast a message to all connected popups
 * Use this to send real-time updates (e.g., new videos marked)
 */
export function broadcastToPopups(message: { type: string; payload: any }): void {
  popupPorts.forEach((port) => {
    try {
      port.postMessage(message);
    } catch (error) {
      console.error('[SlopBlock] Error broadcasting to popup:', error);
      popupPorts.delete(port);
    }
  });
}

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

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(async () => {
  // Run migrations on startup too (in case user upgraded while browser was closed)
  await runMigrations();

  // Test connection on startup
  await testConnection();
});

/**
 * Keep service worker alive (if needed)
 * Chrome may terminate inactive service workers after 30 seconds
 */
let keepAliveInterval: number | undefined;

function keepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  keepAliveInterval = setInterval(() => {
    // Send a simple message to keep the worker active
    chrome.runtime.getPlatformInfo(() => {
      // No-op to prevent worker from being terminated
    });
  }, 20000) as unknown as number; // Every 20 seconds
}

// Initialize keep-alive
keepAlive();
