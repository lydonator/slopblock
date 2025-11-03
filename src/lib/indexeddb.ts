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
  const db = await getDB();
  const response = await fetch(blobUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch blob: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`[SlopBlock] Blob data received:`, data);
  const { metadata, videos } = data;
  console.log(`[SlopBlock] Processing ${videos.length} videos from blob`);

  // Clear existing cache
  const tx = db.transaction('marked-videos', 'readwrite');
  await tx.store.clear();
  await tx.done;
  console.log(`[SlopBlock] Cleared existing cache`);

  // Insert all videos
  const writeTx = db.transaction('marked-videos', 'readwrite');
  for (const video of videos) {
    await writeTx.store.put(video);
  }
  await writeTx.done;
  console.log(`[SlopBlock] Inserted ${videos.length} videos into cache`);

  // Update metadata
  await db.put('cache-metadata', {
    key: 'sync',
    last_sync_timestamp: metadata.generated_at,
    last_prune_timestamp: new Date().toISOString(),
    blob_version: metadata.blob_version,
  });

  // Verify insertion
  const finalCount = await db.count('marked-videos');
  console.log(`[SlopBlock] Synced ${videos.length} videos from CDN (verified count: ${finalCount})`);
}

/**
 * Fetch delta and merge into existing cache
 */
export async function syncDelta(deltaUrl: string, since: string): Promise<void> {
  const db = await getDB();

  try {
    const fullUrl = `${deltaUrl}?since=${encodeURIComponent(since)}`;
    console.log(`[SlopBlock] Fetching delta from: ${fullUrl}`);
    const response = await fetch(fullUrl);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch delta: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const { metadata, videos } = data;

    // Merge videos (upsert)
    const tx = db.transaction('marked-videos', 'readwrite');
    for (const video of videos) {
      await tx.store.put(video); // put() will update if exists
    }
    await tx.done;

    // Update last sync timestamp
    const metadataEntry = await db.get('cache-metadata', 'sync');
    if (metadataEntry) {
      await db.put('cache-metadata', {
        ...metadataEntry,
        last_sync_timestamp: metadata.generated_at,
      });
    }

    console.log(`[SlopBlock] Delta sync: ${videos.length} updates`);
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

  const tx = db.transaction('marked-videos', 'readwrite');
  const index = tx.store.index('by-last-updated');

  let cursor = await index.openCursor();
  let deletedCount = 0;

  while (cursor) {
    if (cursor.value.last_updated_at < cutoffDate) {
      await cursor.delete();
      deletedCount++;
    }
    cursor = await cursor.continue();
  }

  await tx.done;

  // Update prune timestamp
  const metadataEntry = await db.get('cache-metadata', 'sync');
  if (metadataEntry) {
    await db.put('cache-metadata', {
      ...metadataEntry,
      last_prune_timestamp: new Date().toISOString(),
    });
  }

  console.log(`[SlopBlock] Pruned ${deletedCount} old videos`);
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
