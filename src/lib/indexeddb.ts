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

/**
 * CDN Blob Response Structure
 * Used for validating full 48-hour blob downloads
 */
interface CDNBlobResponse {
  metadata: {
    generated_at: string;
    video_count: number;        // Edge function uses "video_count", not "total_videos"
    window_start: string;       // 48-hour window start timestamp
    window_end: string;         // 48-hour window end timestamp
    blob_version: string;
  };
  videos: MarkedVideo[];
}

/**
 * CDN Delta Response Structure
 * Used for validating incremental delta updates
 */
interface CDNDeltaResponse {
  metadata: {
    generated_at: string;
    since: string;
    total_updates: number;
  };
  videos: MarkedVideo[];
}

/**
 * Validation Error
 * Thrown when CDN response data is invalid or malicious
 */
export class CDNValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'CDNValidationError';
  }
}

/**
 * Validate ISO 8601 timestamp string or timestamp-like value
 * Accepts: string timestamps, Date objects, or numeric timestamps
 *
 * CRITICAL FIX: PostgreSQL returns microseconds (6 digits) like "2025-11-09T12:33:50.574042"
 * Previous regex only accepted milliseconds (3 digits) like "2025-11-09T12:33:50.574"
 */
function isValidISO8601(timestamp: any): boolean {
  // Handle null/undefined
  if (timestamp == null) return false;

  // Handle Date objects
  if (timestamp instanceof Date) {
    return !isNaN(timestamp.getTime());
  }

  // Handle numeric timestamps (milliseconds since epoch)
  if (typeof timestamp === 'number') {
    return !isNaN(timestamp) && timestamp > 0;
  }

  // Handle string timestamps
  if (typeof timestamp === 'string') {
    // Updated regex: \d{1,6} accepts 1-6 decimal digits (milliseconds OR microseconds)
    // This handles both JavaScript (3 digits) and PostgreSQL (6 digits) timestamps
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z?$/;
    if (!iso8601Regex.test(timestamp)) return false;

    const date = new Date(timestamp);
    return !isNaN(date.getTime());
  }

  // Handle object-like timestamps (e.g., from Supabase)
  if (typeof timestamp === 'object') {
    // Try to convert to Date
    try {
      const date = new Date(timestamp);
      return !isNaN(date.getTime());
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Validate YouTube video ID format (11 alphanumeric characters)
 */
function isValidVideoId(videoId: string): boolean {
  return typeof videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

/**
 * Validate channel ID format (UC... or @handle)
 */
function isValidChannelId(channelId: string): boolean {
  if (typeof channelId !== 'string') return false;

  // Format 1: UC... (24 characters starting with UC)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) return true;

  // Format 2: @handle (starts with @, followed by alphanumeric/underscore/dash)
  if (/^@[a-zA-Z0-9_-]+$/.test(channelId)) return true;

  return false;
}

/**
 * Validate a single MarkedVideo object
 */
function validateMarkedVideo(video: any, index: number): void {
  // Check required fields exist
  if (!video || typeof video !== 'object') {
    throw new CDNValidationError(`Video at index ${index} is not an object`, { video });
  }

  // Validate video_id
  if (!isValidVideoId(video.video_id)) {
    throw new CDNValidationError(
      `Invalid video_id at index ${index}: must be 11 alphanumeric characters`,
      { video_id: video.video_id, index }
    );
  }

  // Validate channel_id
  if (!isValidChannelId(video.channel_id)) {
    throw new CDNValidationError(
      `Invalid channel_id at index ${index}: must be UC... or @handle format`,
      { channel_id: video.channel_id, index }
    );
  }

  // Validate effective_trust_points (must be non-negative number)
  if (typeof video.effective_trust_points !== 'number' || video.effective_trust_points < 0) {
    throw new CDNValidationError(
      `Invalid effective_trust_points at index ${index}: must be non-negative number`,
      { effective_trust_points: video.effective_trust_points, index }
    );
  }

  // Validate raw_report_count (must be positive integer)
  if (!Number.isInteger(video.raw_report_count) || video.raw_report_count < 1) {
    throw new CDNValidationError(
      `Invalid raw_report_count at index ${index}: must be positive integer`,
      { raw_report_count: video.raw_report_count, index }
    );
  }

  // Validate is_marked (must be boolean)
  if (typeof video.is_marked !== 'boolean') {
    throw new CDNValidationError(
      `Invalid is_marked at index ${index}: must be boolean`,
      { is_marked: video.is_marked, index }
    );
  }

  // Validate timestamps
  if (!isValidISO8601(video.first_reported_at)) {
    throw new CDNValidationError(
      `Invalid first_reported_at at index ${index}: must be ISO 8601 timestamp`,
      { first_reported_at: video.first_reported_at, index }
    );
  }

  if (!isValidISO8601(video.last_updated_at)) {
    throw new CDNValidationError(
      `Invalid last_updated_at at index ${index}: must be ISO 8601 timestamp`,
      { last_updated_at: video.last_updated_at, index }
    );
  }

  // Validate cache_version (must be non-negative integer)
  if (!Number.isInteger(video.cache_version) || video.cache_version < 0) {
    throw new CDNValidationError(
      `Invalid cache_version at index ${index}: must be non-negative integer`,
      { cache_version: video.cache_version, index }
    );
  }
}

/**
 * Validate CDN Blob Response
 * Throws CDNValidationError if response is invalid
 */
function validateBlobResponse(data: any): asserts data is CDNBlobResponse {
  // Check top-level structure
  if (!data || typeof data !== 'object') {
    throw new CDNValidationError('Response is not an object', { data });
  }

  // Validate metadata object
  if (!data.metadata || typeof data.metadata !== 'object') {
    throw new CDNValidationError('Missing or invalid metadata object', { metadata: data.metadata });
  }

  // Validate metadata fields
  if (!isValidISO8601(data.metadata.generated_at)) {
    throw new CDNValidationError('Invalid metadata.generated_at: must be ISO 8601 timestamp', {
      generated_at: data.metadata.generated_at,
    });
  }

  if (typeof data.metadata.blob_version !== 'string' || data.metadata.blob_version.length === 0) {
    throw new CDNValidationError('Invalid metadata.blob_version: must be non-empty string', {
      blob_version: data.metadata.blob_version,
    });
  }

  // Validate video_count (Edge function uses "video_count", not "total_videos")
  if (!Number.isInteger(data.metadata.video_count) || data.metadata.video_count < 0) {
    throw new CDNValidationError('Invalid metadata.video_count: must be non-negative integer', {
      video_count: data.metadata.video_count,
    });
  }

  // Validate window_start and window_end timestamps
  if (!isValidISO8601(data.metadata.window_start)) {
    throw new CDNValidationError('Invalid metadata.window_start: must be ISO 8601 timestamp', {
      window_start: data.metadata.window_start,
    });
  }

  if (!isValidISO8601(data.metadata.window_end)) {
    throw new CDNValidationError('Invalid metadata.window_end: must be ISO 8601 timestamp', {
      window_end: data.metadata.window_end,
    });
  }

  // Validate videos array
  if (!Array.isArray(data.videos)) {
    throw new CDNValidationError('Invalid videos field: must be an array', { videos: data.videos });
  }

  // Check array length matches metadata.video_count
  if (data.videos.length !== data.metadata.video_count) {
    throw new CDNValidationError(
      'Videos array length does not match metadata.video_count',
      { expected: data.metadata.video_count, actual: data.videos.length }
    );
  }

  // Validate each video (sample first 100 for performance, then validate remaining)
  const sampleSize = Math.min(100, data.videos.length);
  for (let i = 0; i < sampleSize; i++) {
    validateMarkedVideo(data.videos[i], i);
  }

  // For large arrays, validate remaining with less strict checks (performance optimization)
  if (data.videos.length > sampleSize) {
    for (let i = sampleSize; i < data.videos.length; i++) {
      const video = data.videos[i];
      // Quick sanity check: just verify video_id format (most critical field)
      if (!isValidVideoId(video.video_id)) {
        throw new CDNValidationError(
          `Invalid video_id at index ${i} (fast validation): must be 11 alphanumeric characters`,
          { video_id: video.video_id, index: i }
        );
      }
    }
  }
}

/**
 * Validate CDN Delta Response
 * Throws CDNValidationError if response is invalid
 */
function validateDeltaResponse(data: any): asserts data is CDNDeltaResponse {
  // Check top-level structure
  if (!data || typeof data !== 'object') {
    throw new CDNValidationError('Delta response is not an object', { data });
  }

  // Validate metadata object
  if (!data.metadata || typeof data.metadata !== 'object') {
    throw new CDNValidationError('Missing or invalid metadata object in delta response', {
      metadata: data.metadata,
    });
  }

  // Validate metadata fields
  if (!isValidISO8601(data.metadata.generated_at)) {
    throw new CDNValidationError('Invalid metadata.generated_at in delta response', {
      generated_at: data.metadata.generated_at,
    });
  }

  if (!isValidISO8601(data.metadata.since)) {
    throw new CDNValidationError('Invalid metadata.since: must be ISO 8601 timestamp', {
      since: data.metadata.since,
    });
  }

  if (!Number.isInteger(data.metadata.total_updates) || data.metadata.total_updates < 0) {
    throw new CDNValidationError('Invalid metadata.total_updates: must be non-negative integer', {
      total_updates: data.metadata.total_updates,
    });
  }

  // Validate videos array
  if (!Array.isArray(data.videos)) {
    throw new CDNValidationError('Invalid videos field in delta response: must be an array', {
      videos: data.videos,
    });
  }

  // Check array length matches metadata
  if (data.videos.length !== data.metadata.total_updates) {
    throw new CDNValidationError(
      'Delta videos array length does not match metadata.total_updates',
      { expected: data.metadata.total_updates, actual: data.videos.length }
    );
  }

  // Validate each video in delta (deltas are typically small, so validate all)
  for (let i = 0; i < data.videos.length; i++) {
    validateMarkedVideo(data.videos[i], i);
  }
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
  'settings': {
    key: string; // 'extension_id', 'auto_hide_enabled', 'config_version'
    value: any;
  };
  'report-states': {
    key: string; // video_id
    value: string; // ReportState enum value
  };
}

let dbInstance: IDBPDatabase<SlopBlockDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<SlopBlockDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<SlopBlockDB>('slopblock-cache', 3, {
    upgrade(db, oldVersion) {
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

      // Create settings store (version 3+)
      if (oldVersion < 3 && !db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }

      // Create report-states store (version 3+)
      if (oldVersion < 3 && !db.objectStoreNames.contains('report-states')) {
        db.createObjectStore('report-states');
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
  console.log(`[SlopBlock] Blob data received (validating...)`);

  // CRITICAL: Validate CDN response before processing
  try {
    validateBlobResponse(data);
    console.log(`[SlopBlock] Validation passed: ${data.videos.length} videos`);
  } catch (error) {
    if (error instanceof CDNValidationError) {
      console.error('[SlopBlock] CDN blob validation failed:', error.message, error.details);
      throw new Error(
        `CDN blob validation failed: ${error.message}. This may indicate data corruption or a security issue.`
      );
    }
    throw error;
  }

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
    console.log(`[SlopBlock] Delta data received (validating...)`);

    // CRITICAL: Validate CDN delta response before processing
    try {
      validateDeltaResponse(data);
      console.log(`[SlopBlock] Delta validation passed: ${data.videos.length} updates`);
    } catch (error) {
      if (error instanceof CDNValidationError) {
        console.error('[SlopBlock] CDN delta validation failed:', error.message, error.details);
        throw new Error(
          `CDN delta validation failed: ${error.message}. This may indicate data corruption or a security issue.`
        );
      }
      throw error;
    }

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

/**
 * BatchedWriteManager - Generic debounced write system for IndexedDB
 * Reduces IndexedDB write operations by batching multiple writes within a time window
 * Inspired by SponsorBlock's batched storage approach
 */
export class BatchedWriteManager<T = any> {
  private batchedWrites: Map<string, T> = new Map();
  private batchWriteTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly delayMs: number;
  private readonly storeName: 'settings' | 'report-states';

  constructor(storeName: 'settings' | 'report-states', delayMs: number = 100) {
    this.storeName = storeName;
    this.delayMs = delayMs;
  }

  /**
   * Queue a write operation to be batched
   */
  queueWrite(key: string, value: T): void {
    this.batchedWrites.set(key, value);

    if (this.batchWriteTimer !== null) {
      clearTimeout(this.batchWriteTimer);
    }

    this.batchWriteTimer = setTimeout(async () => {
      await this.flush();
    }, this.delayMs);
  }

  /**
   * Check if there's a pending write for a key (read-through cache)
   */
  getPendingWrite(key: string): T | undefined {
    return this.batchedWrites.get(key);
  }

  /**
   * Check if a key has a pending write
   */
  hasPendingWrite(key: string): boolean {
    return this.batchedWrites.has(key);
  }

  /**
   * Flush all pending writes to IndexedDB
   */
  async flush(): Promise<void> {
    if (this.batchedWrites.size === 0) return;

    const writes = new Map(this.batchedWrites);
    this.batchedWrites.clear();
    this.batchWriteTimer = null;

    try {
      const db = await getDB();
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);

      // Queue all put operations synchronously to prevent transaction auto-close
      const putPromises: Promise<any>[] = [];
      for (const [key, value] of writes) {
        putPromises.push(store.put(value, key));
      }

      await tx.done;
      console.log(`[SlopBlock] Flushed ${writes.size} writes to ${this.storeName}`);
    } catch (error) {
      console.error(`[SlopBlock] Error in batched write to ${this.storeName}:`, error);
      throw error;
    }
  }

  /**
   * Force immediate flush of all pending writes
   */
  async forceFlush(): Promise<void> {
    if (this.batchWriteTimer !== null) {
      clearTimeout(this.batchWriteTimer);
      this.batchWriteTimer = null;
    }
    await this.flush();
  }
}

/**
 * SettingsStore - Manages extension settings in IndexedDB
 * Handles: extension_id, auto_hide_enabled, config_version
 */
export class SettingsStore {
  private writeManager: BatchedWriteManager<any>;

  constructor() {
    this.writeManager = new BatchedWriteManager('settings', 100);
  }

  /**
   * Get a setting value
   */
  async get<T = any>(key: string): Promise<T | undefined> {
    // Check pending writes first (read-through cache)
    if (this.writeManager.hasPendingWrite(key)) {
      return this.writeManager.getPendingWrite(key) as T;
    }

    const db = await getDB();
    return await db.get('settings', key) as T | undefined;
  }

  /**
   * Set a setting value (batched write)
   */
  set(key: string, value: any): void {
    this.writeManager.queueWrite(key, value);
  }

  /**
   * Set a setting value immediately (no batching)
   */
  async setImmediate(key: string, value: any): Promise<void> {
    const db = await getDB();
    await db.put('settings', value, key);
  }

  /**
   * Delete a setting
   */
  async delete(key: string): Promise<void> {
    const db = await getDB();
    await db.delete('settings', key);
  }

  /**
   * Force flush all pending writes
   */
  async flush(): Promise<void> {
    await this.writeManager.forceFlush();
  }
}

/**
 * ReportStateStore - Manages user report states per video
 * Stores which videos the user has reported/removed reports for
 */
export class ReportStateStore {
  private writeManager: BatchedWriteManager<string>;

  constructor() {
    this.writeManager = new BatchedWriteManager('report-states', 100);
  }

  /**
   * Get report state for a video
   */
  async get(videoId: string): Promise<string | undefined> {
    // Check pending writes first (read-through cache)
    if (this.writeManager.hasPendingWrite(videoId)) {
      return this.writeManager.getPendingWrite(videoId);
    }

    const db = await getDB();
    return await db.get('report-states', videoId);
  }

  /**
   * Set report state for a video (batched write)
   */
  set(videoId: string, state: string): void {
    this.writeManager.queueWrite(videoId, state);
  }

  /**
   * Set report state immediately (no batching)
   */
  async setImmediate(videoId: string, state: string): Promise<void> {
    const db = await getDB();
    await db.put('report-states', state, videoId);
  }

  /**
   * Delete report state for a video
   */
  async delete(videoId: string): Promise<void> {
    const db = await getDB();
    await db.delete('report-states', videoId);
  }

  /**
   * Get all report states
   */
  async getAll(): Promise<Record<string, string>> {
    const db = await getDB();
    const tx = db.transaction('report-states', 'readonly');
    const store = tx.objectStore('report-states');

    const result: Record<string, string> = {};
    let cursor = await store.openCursor();

    while (cursor) {
      result[cursor.key] = cursor.value;
      cursor = await cursor.continue();
    }

    await tx.done;
    return result;
  }

  /**
   * Clear all report states
   */
  async clear(): Promise<void> {
    const db = await getDB();
    await db.clear('report-states');
  }

  /**
   * Force flush all pending writes
   */
  async flush(): Promise<void> {
    await this.writeManager.forceFlush();
  }
}

/**
 * REMOVED: StorageMigration class
 *
 * Migration from chrome.storage to IndexedDB is no longer needed.
 * All new installs use IndexedDB from the start (no permissions required).
 *
 * This code was removed after database wipe on 2025-11-09.
 * Previous users (if any) will start fresh with new extension IDs.
 */

/**
 * Global instances for singleton pattern
 */
let settingsStoreInstance: SettingsStore | null = null;
let reportStateStoreInstance: ReportStateStore | null = null;

/**
 * Get singleton SettingsStore instance
 */
export function getSettingsStore(): SettingsStore {
  if (!settingsStoreInstance) {
    settingsStoreInstance = new SettingsStore();
  }
  return settingsStoreInstance;
}

/**
 * Get singleton ReportStateStore instance
 */
export function getReportStateStore(): ReportStateStore {
  if (!reportStateStoreInstance) {
    reportStateStoreInstance = new ReportStateStore();
  }
  return reportStateStoreInstance;
}

/**
 * REMOVED: runStorageMigration function
 *
 * No migration needed - all new installs use IndexedDB from the start.
 * This is now a no-op function to prevent breaking existing imports.
 */
export async function runStorageMigration(): Promise<void> {
  console.log('[SlopBlock] Storage migration skipped - using IndexedDB from start');
  // No-op - migration code removed
}
