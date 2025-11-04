import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface MarkedVideo {
  video_id: string;
  channel_id: string;
  effective_trust_points: number;
  raw_report_count: number;
  is_marked: boolean;
  first_reported_at: string;
  last_updated_at: string;
  cache_version: number;
}

export interface CacheMetadata {
  key: string;
  last_sync_timestamp: string;
  last_prune_timestamp: string;
  blob_version: string;
}

interface SlopBlockDB extends DBSchema {
  'marked-videos': {
    key: string; // video_id
    value: MarkedVideo;
    indexes: {
      'by-last-updated': string; // last_updated_at for pruning
      'by-channel': string; // channel_id for queries
    };
  };
  'cache-metadata': {
    key: string;
    value: CacheMetadata;
  };
}

let dbInstance: IDBPDatabase<SlopBlockDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<SlopBlockDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<SlopBlockDB>('slopblock-cache', 2, {
    upgrade(db) {
      // Create marked-videos store
      if (!db.objectStoreNames.contains('marked-videos')) {
        const videoStore = db.createObjectStore('marked-videos', {
          keyPath: 'video_id',
        });
        videoStore.createIndex('by-last-updated', 'last_updated_at');
        videoStore.createIndex('by-channel', 'channel_id');
      }

      // Create cache-metadata store
      if (!db.objectStoreNames.contains('cache-metadata')) {
        db.createObjectStore('cache-metadata', {
          keyPath: 'key',
        });
      }
    },
  });

  return dbInstance;
}

/**
 * Fetch and store full 48-hour blob from CDN
 */
export async function syncFullBlob(blobUrl: string): Promise<void> {
  console.log(`[SlopBlock] Fetching blob from: ${blobUrl}`);

  // Fetch data BEFORE opening any transactions
  const response = await fetch(blobUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch blob: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`[SlopBlock] Blob data received:`, data);
  const { metadata, videos } = data;
  console.log(`[SlopBlock] Processing ${videos.length} videos from blob`);

  // Get DB connection after all async fetching is complete
  const db = await getDB();

  // Clear existing cache in a single transaction
  const clearTx = db.transaction('marked-videos', 'readwrite');
  await clearTx.store.clear();
  await clearTx.done;
  console.log(`[SlopBlock] Cleared existing cache`);

  // CRITICAL FIX: Insert all videos WITHOUT awaiting inside the loop
  // This prevents the transaction from auto-closing due to microtask gaps
  const writeTx = db.transaction('marked-videos', 'readwrite');
  const store = writeTx.store;

  // Queue all put operations synchronously (no await in loop)
  const putPromises: Promise<string>[] = [];
  for (const video of videos) {
    putPromises.push(store.put(video));
  }

  // Now await the transaction completion (all puts are already queued)
  await writeTx.done;
  console.log(`[SlopBlock] Transaction committed, inserted ${videos.length} videos`);

  // Update metadata in a separate transaction
  await db.put('cache-metadata', {
    key: 'sync',
    last_sync_timestamp: metadata.generated_at,
    last_prune_timestamp: new Date().toISOString(),
    blob_version: metadata.blob_version,
  });

  // Verify insertion by reading back from the database
  const finalCount = await db.count('marked-videos');
  console.log(`[SlopBlock] Synced ${videos.length} videos from CDN (verified count: ${finalCount})`);

  if (finalCount !== videos.length) {
    console.error(`[SlopBlock] CRITICAL: Count mismatch! Expected ${videos.length}, got ${finalCount}`);
    throw new Error(`IndexedDB sync verification failed: expected ${videos.length} videos, but found ${finalCount}`);
  }
}

/**
 * Fetch delta and merge into existing cache
 */
export async function syncDelta(deltaUrl: string, since: string): Promise<void> {
  try {
    const fullUrl = `${deltaUrl}?since=${encodeURIComponent(since)}`;
    console.log(`[SlopBlock] Fetching delta from: ${fullUrl}`);

    // Fetch data BEFORE opening database connection
    const response = await fetch(fullUrl);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch delta: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const { metadata, videos } = data;

    // Get DB connection after all async fetching is complete
    const db = await getDB();

    // CRITICAL FIX: Merge videos WITHOUT awaiting inside the loop
    const tx = db.transaction('marked-videos', 'readwrite');
    const store = tx.store;

    // Queue all put operations synchronously (no await in loop)
    const putPromises: Promise<string>[] = [];
    for (const video of videos) {
      putPromises.push(store.put(video)); // put() will update if exists
    }

    // Now await the transaction completion (all puts are already queued)
    await tx.done;

    // Update last sync timestamp in a separate transaction
    const metadataEntry = await db.get('cache-metadata', 'sync');
    if (metadataEntry) {
      await db.put('cache-metadata', {
        ...metadataEntry,
        last_sync_timestamp: metadata.generated_at,
      });
    }

    console.log(`[SlopBlock] Delta sync: ${videos.length} updates merged successfully`);
  } catch (error: any) {
    console.error('[SlopBlock] Delta sync error details:', {
      message: error.message,
      stack: error.stack,
      deltaUrl,
      since
    });
    throw error;
  }
}

/**
 * Prune entries older than specified hours
 */
export async function pruneOldVideos(windowHours: number): Promise<void> {
  const db = await getDB();
  const cutoffDate = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  // CRITICAL FIX: Collect keys to delete first, then delete in batch
  // This prevents transaction auto-close issues from await inside cursor loop
  const keysToDelete: string[] = [];

  // Read-only transaction to find old entries
  const readTx = db.transaction('marked-videos', 'readonly');
  const index = readTx.store.index('by-last-updated');

  let cursor = await index.openCursor();
  while (cursor) {
    if (cursor.value.last_updated_at < cutoffDate) {
      keysToDelete.push(cursor.value.video_id);
    }
    cursor = await cursor.continue();
  }

  await readTx.done;

  // Now delete all old entries in a single write transaction
  if (keysToDelete.length > 0) {
    const writeTx = db.transaction('marked-videos', 'readwrite');
    const store = writeTx.store;

    // Queue all delete operations synchronously (no await in loop)
    const deletePromises: Promise<void>[] = [];
    for (const key of keysToDelete) {
      deletePromises.push(store.delete(key));
    }

    await writeTx.done;
  }

  // Update prune timestamp in a separate transaction
  const metadataEntry = await db.get('cache-metadata', 'sync');
  if (metadataEntry) {
    await db.put('cache-metadata', {
      ...metadataEntry,
      last_prune_timestamp: new Date().toISOString(),
    });
  }

  console.log(`[SlopBlock] Pruned ${keysToDelete.length} old videos`);
}

/**
 * Check if a specific video is marked
 */
export async function isVideoMarked(videoId: string): Promise<boolean> {
  const db = await getDB();
  const video = await db.get('marked-videos', videoId);
  return video?.is_marked ?? false;
}

/**
 * Get all marked videos for a specific channel
 */
export async function getMarkedVideosForChannel(channelId: string): Promise<MarkedVideo[]> {
  const db = await getDB();
  const index = db.transaction('marked-videos').store.index('by-channel');
  return await index.getAll(channelId);
}

/**
 * Get cache metadata (last sync, version, etc.)
 */
export async function getCacheMetadata(): Promise<CacheMetadata | undefined> {
  const db = await getDB();
  return await db.get('cache-metadata', 'sync');
}

/**
 * Get total count of cached videos
 */
export async function getCachedVideoCount(): Promise<number> {
  const db = await getDB();
  return await db.count('marked-videos');
}

/**
 * Clear all cache data (for testing/debugging)
 */
export async function clearCache(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['marked-videos', 'cache-metadata'], 'readwrite');
  await tx.objectStore('marked-videos').clear();
  await tx.objectStore('cache-metadata').clear();
  await tx.done;
  console.log('[SlopBlock] Cache cleared');
}
