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
 * Schedule delta updates and pruning
 * - Delta updates every 2 hours
 * - Pruning every 30 minutes
 */
function schedulePeriodicUpdates(): void {
  // Delta updates every 2 hours
  setInterval(async () => {
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
  }, DELTA_UPDATE_INTERVAL_MS);

  // Prune old entries every 30 minutes
  setInterval(async () => {
    try {
      console.log('[SlopBlock Cache] Pruning old entries...');
      await pruneOldVideos(CACHE_WINDOW_HOURS);
    } catch (error) {
      console.error('[SlopBlock Cache] Cache pruning failed:', error);
    }
  }, CACHE_PRUNE_INTERVAL_MS);

  console.log('[SlopBlock Cache] Periodic updates scheduled');
  console.log(`- Delta updates: every ${DELTA_UPDATE_INTERVAL_MS / 1000 / 60} minutes`);
  console.log(`- Cache pruning: every ${CACHE_PRUNE_INTERVAL_MS / 1000 / 60} minutes`);
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
