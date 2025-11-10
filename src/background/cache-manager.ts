import {
  syncFullBlob,
  syncDelta,
  pruneOldVideos,
  getCacheMetadata,
} from '../lib/indexeddb';
import {
  FULL_BLOB_URL,
  DELTA_FUNCTION_URL,
  CACHE_WINDOW_HOURS,
  DELTA_UPDATE_INTERVAL_MS,
  CACHE_PRUNE_INTERVAL_MS,
} from '../lib/constants';

/**
 * Initialize cache on extension install/update
 * Downloads full 48-hour blob and sets up periodic updates
 */
export async function initializeCache(): Promise<void> {
  try {
    console.log('[SlopBlock Cache] Initializing cache...');
    await syncFullBlob(FULL_BLOB_URL);
    console.log('[SlopBlock Cache] Cache initialized successfully');

    // Schedule periodic updates
    schedulePeriodicUpdates();
  } catch (error) {
    console.error('[SlopBlock Cache] Cache initialization failed:', error);
    // Fallback: Extension will use direct API queries
  }
}

/**
 * Schedule periodic cache updates using Chrome Alarms API
 * Three-tier refresh strategy:
 * 1. Full blob refresh (24 hours): Downloads entire 48h marked videos blob from CDN
 * 2. Delta sync (30 minutes): Incremental updates for new/changed videos
 * 3. Cache pruning (30 minutes): Removes entries older than 48h window
 *
 * Alarms survive service worker termination (unlike setInterval)
 */
function schedulePeriodicUpdates(): void {
  // Full blob refresh alarm (daily)
  const fullRefreshPeriodMinutes = 24 * 60; // 1440 minutes = 24 hours
  chrome.alarms.create('cache-full-refresh', {
    periodInMinutes: fullRefreshPeriodMinutes,
  });

  // Delta updates alarm (incremental)
  const deltaPeriodMinutes = Math.max(1, DELTA_UPDATE_INTERVAL_MS / 1000 / 60);
  chrome.alarms.create('cache-delta-sync', {
    periodInMinutes: deltaPeriodMinutes,
  });

  // Cache pruning alarm
  const prunePeriodMinutes = Math.max(1, CACHE_PRUNE_INTERVAL_MS / 1000 / 60);
  chrome.alarms.create('cache-pruning', {
    periodInMinutes: prunePeriodMinutes,
  });

  console.log('[SlopBlock Cache] Periodic updates scheduled (three-tier strategy):');
  console.log(`- Full blob refresh: every ${fullRefreshPeriodMinutes} minutes (24 hours)`);
  console.log(`- Delta updates: every ${deltaPeriodMinutes} minutes`);
  console.log(`- Cache pruning: every ${prunePeriodMinutes} minutes`);
}

/**
 * Force refresh cache (user-triggered or after network recovery)
 * Downloads fresh 48-hour blob and replaces existing cache
 */
export async function refreshCache(): Promise<void> {
  try {
    console.log('[SlopBlock Cache] Forcing cache refresh...');
    await syncFullBlob(FULL_BLOB_URL);
    console.log('[SlopBlock Cache] Cache refreshed successfully');
  } catch (error) {
    console.error('[SlopBlock Cache] Cache refresh failed:', error);
    throw error;
  }
}

/**
 * Perform a delta sync immediately (for testing or user-triggered)
 */
export async function performDeltaSync(): Promise<void> {
  try {
    const metadata = await getCacheMetadata();
    if (!metadata) {
      console.warn('[SlopBlock Cache] No metadata found, performing full sync instead');
      await syncFullBlob(FULL_BLOB_URL);
      return;
    }

    console.log('[SlopBlock Cache] Performing delta sync...');
    await syncDelta(DELTA_FUNCTION_URL, metadata.last_sync_timestamp);
    console.log('[SlopBlock Cache] Delta sync completed');
  } catch (error) {
    console.error('[SlopBlock Cache] Delta sync failed:', error);
    throw error;
  }
}

/**
 * Manually trigger cache pruning (for testing)
 */
export async function performPruning(): Promise<void> {
  try {
    console.log('[SlopBlock Cache] Performing manual pruning...');
    await pruneOldVideos(CACHE_WINDOW_HOURS);
    console.log('[SlopBlock Cache] Pruning completed');
  } catch (error) {
    console.error('[SlopBlock Cache] Pruning failed:', error);
    throw error;
  }
}

/**
 * Handle cache-related alarms
 * Called by service worker when alarms fire
 */
export async function handleCacheAlarm(alarmName: string): Promise<void> {
  if (alarmName === 'cache-full-refresh') {
    try {
      console.log('[SlopBlock Cache] Running daily full blob refresh...');
      await syncFullBlob(FULL_BLOB_URL);
    } catch (error) {
      console.error('[SlopBlock Cache] Full blob refresh failed:', error);
    }
  } else if (alarmName === 'cache-delta-sync') {
    try {
      const metadata = await getCacheMetadata();
      if (metadata) {
        console.log('[SlopBlock Cache] Running delta sync...');
        await syncDelta(DELTA_FUNCTION_URL, metadata.last_sync_timestamp);
      } else {
        console.warn('[SlopBlock Cache] No metadata found, skipping delta sync');
      }
    } catch (error) {
      console.error('[SlopBlock Cache] Delta sync failed:', error);
    }
  } else if (alarmName === 'cache-pruning') {
    try {
      console.log('[SlopBlock Cache] Pruning old entries...');
      await pruneOldVideos(CACHE_WINDOW_HOURS);
    } catch (error) {
      console.error('[SlopBlock Cache] Cache pruning failed:', error);
    }
  }
}
