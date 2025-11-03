/**
 * Report Queue Manager (Phase 3 - Week 2)
 *
 * IndexedDB-based queue for batching video reports before upload.
 * Reduces API calls by 90% through client-side batching.
 *
 * Features:
 * - IndexedDB persistent queue (survives browser restarts)
 * - Automatic batch uploads (time-based or count-based triggers)
 * - Retry logic for failed uploads
 * - Offline support with sync on reconnect
 * - Optimistic UI updates
 */

import type { QueuedReport, BatchReportResult } from '../types';
import { MessageType } from '../types';

// Configuration constants
const DB_NAME = 'slopblock_queue';
const DB_VERSION = 1;
const STORE_NAME = 'report_queue';
const MAX_BATCH_SIZE = 10; // Upload after 10 reports
const BATCH_INTERVAL_MS = 5 * 60 * 1000; // Upload every 5 minutes
const MAX_RETRY_COUNT = 3;

/**
 * Manages the local report queue with IndexedDB
 */
export class ReportQueueManager {
  private db: IDBDatabase | null = null;
  private uploadTimer: number | null = null;
  private isOnline: boolean = navigator.onLine;
  private isUploading: boolean = false;

  /**
   * Initialize the queue manager
   */
  async initialize(): Promise<void> {
    // Setup IndexedDB
    await this.openDatabase();

    // Setup periodic upload timer
    this.startUploadTimer();

    // Setup online/offline detection
    this.setupNetworkListeners();

    // Process any existing queue items
    await this.processQueue();
  }

  /**
   * Open IndexedDB connection
   */
  private openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });

          // Create indexes for efficient queries
          store.createIndex('video_id', 'video_id', { unique: false });
          store.createIndex('queued_at', 'queued_at', { unique: false });
          store.createIndex('retry_count', 'retry_count', { unique: false });

          console.log('IndexedDB object store created');
        }
      };
    });
  }

  /**
   * Add a report to the queue
   */
  async queueReport(videoId: string, channelId: string, extensionId: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Check if report already queued for this video
    const existing = await this.getQueuedReport(videoId, extensionId);
    if (existing) {
      console.log(`Report already queued for video ${videoId}`);
      return;
    }

    const report: Omit<QueuedReport, 'id'> = {
      video_id: videoId,
      channel_id: channelId,
      extension_id: extensionId,
      queued_at: Date.now(),
      retry_count: 0,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(report);

      request.onsuccess = () => {
        console.log(`Report queued for video ${videoId}`);
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to queue report:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = async () => {
        // Check if we should trigger immediate upload
        const queueSize = await this.getQueueSize();
        if (queueSize >= MAX_BATCH_SIZE) {
          console.log(`Queue size (${queueSize}) reached threshold, triggering upload`);
          await this.processQueue();
        }
      };
    });
  }

  /**
   * Get a specific queued report
   */
  private async getQueuedReport(
    videoId: string,
    extensionId: string
  ): Promise<QueuedReport | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('video_id');
      const request = index.getAll(videoId);

      request.onsuccess = () => {
        const reports = request.result as QueuedReport[];
        const match = reports.find((r) => r.extension_id === extensionId);
        resolve(match || null);
      };

      request.onerror = () => {
        console.error('Failed to get queued report:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get current queue size
   */
  async getQueueSize(): Promise<number> {
    if (!this.db) return 0;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all queued reports
   */
  private async getAllQueuedReports(): Promise<QueuedReport[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove reports from queue
   */
  private async removeReports(ids: number[]): Promise<void> {
    if (!this.db || ids.length === 0) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      let completed = 0;
      let hasError = false;

      for (const id of ids) {
        const request = store.delete(id);

        request.onsuccess = () => {
          completed++;
          if (completed === ids.length && !hasError) {
            resolve();
          }
        };

        request.onerror = () => {
          hasError = true;
          console.error(`Failed to remove report ${id}:`, request.error);
          reject(request.error);
        };
      }
    });
  }

  /**
   * Update retry count for failed reports
   */
  private async updateRetryCount(id: number, error?: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const report = getRequest.result as QueuedReport;
        if (!report) {
          resolve();
          return;
        }

        report.retry_count++;
        if (error) {
          report.last_error = error;
        }

        const updateRequest = store.put(report);

        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Process the queue and upload reports in batches
   */
  async processQueue(): Promise<void> {
    // Don't process if offline or already uploading
    if (!this.isOnline || this.isUploading) {
      console.log('Skipping queue processing (offline or already uploading)');
      return;
    }

    this.isUploading = true;

    try {
      const reports = await this.getAllQueuedReports();

      if (reports.length === 0) {
        console.log('Queue is empty');
        return;
      }

      console.log(`Processing ${reports.length} queued reports`);

      // Split into batches
      const batches: QueuedReport[][] = [];
      for (let i = 0; i < reports.length; i += MAX_BATCH_SIZE) {
        batches.push(reports.slice(i, i + MAX_BATCH_SIZE));
      }

      // Upload each batch
      for (const batch of batches) {
        await this.uploadBatch(batch);
      }
    } catch (error) {
      console.error('Error processing queue:', error);
    } finally {
      this.isUploading = false;
    }
  }

  /**
   * Upload a batch of reports
   */
  private async uploadBatch(reports: QueuedReport[]): Promise<void> {
    try {
      // Prepare batch request
      const batchPayload = reports.map((r) => ({
        video_id: r.video_id,
        channel_id: r.channel_id,
        extension_id: r.extension_id,
      }));

      console.log(`Uploading batch of ${batchPayload.length} reports`);

      // Send to background worker
      const response = await chrome.runtime.sendMessage({
        type: MessageType.BATCH_REPORT_VIDEOS,
        payload: { reports: batchPayload },
      });

      if (!response.success) {
        throw new Error(response.error || 'Batch upload failed');
      }

      const results = response.data as BatchReportResult[];

      // Process results
      const successfulIds: number[] = [];
      const failedReports: QueuedReport[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const report = reports[i];

        if (result.out_success) {
          // Success - mark for removal
          successfulIds.push(report.id!);
        } else {
          // Failed - log error
          console.error(`Failed to report video ${report.video_id}:`, result.out_error_message);

          // Check retry count
          if (report.retry_count < MAX_RETRY_COUNT) {
            failedReports.push(report);
          } else {
            // Max retries exceeded - remove from queue
            console.error(
              `Report for video ${report.video_id} failed after ${MAX_RETRY_COUNT} retries`
            );
            successfulIds.push(report.id!);
          }
        }
      }

      // Remove successful reports
      if (successfulIds.length > 0) {
        await this.removeReports(successfulIds);
      }

      // Update retry counts for failed reports
      for (const report of failedReports) {
        const result = results.find((r) => r.out_video_id === report.video_id);
        await this.updateRetryCount(report.id!, result?.out_error_message || undefined);
      }

    } catch (error) {
      // Check if extension context was invalidated (extension reloaded)
      if (error instanceof Error && error.message.includes('Extension context invalidated')) {
        console.log('Extension was reloaded - batch upload cancelled. Reports will retry on next page load.');
        return; // Don't update retry counts, just exit gracefully
      }

      console.error('Error uploading batch:', error);

      // Update retry counts for all reports in batch
      for (const report of reports) {
        if (report.retry_count < MAX_RETRY_COUNT) {
          await this.updateRetryCount(
            report.id!,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      }
    }
  }

  /**
   * Start periodic upload timer
   */
  private startUploadTimer(): void {
    if (this.uploadTimer) {
      clearInterval(this.uploadTimer);
    }

    this.uploadTimer = setInterval(() => {
      console.log('Upload timer triggered');
      this.processQueue();
    }, BATCH_INTERVAL_MS) as unknown as number;

    console.log(`Upload timer started (${BATCH_INTERVAL_MS / 1000}s interval)`);
  }

  /**
   * Setup online/offline event listeners
   */
  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      console.log('Network online - processing queue');
      this.isOnline = true;
      this.processQueue();
    });

    window.addEventListener('offline', () => {
      console.log('Network offline - pausing queue processing');
      this.isOnline = false;
    });

    // Visibility change (tab becomes active)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        console.log('Tab became visible - processing queue');
        this.processQueue();
      }
    });
  }

  /**
   * Force immediate queue processing (for testing)
   */
  async flush(): Promise<void> {
    console.log('Flushing queue...');
    await this.processQueue();
  }

  /**
   * Get queue statistics for debugging
   */
  async getStats(): Promise<{
    queueSize: number;
    isOnline: boolean;
    isUploading: boolean;
  }> {
    return {
      queueSize: await this.getQueueSize(),
      isOnline: this.isOnline,
      isUploading: this.isUploading,
    };
  }

  /**
   * Clear all queued reports (for testing/debugging)
   */
  async clearQueue(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('Queue cleared');
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to clear queue:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.uploadTimer) {
      clearInterval(this.uploadTimer);
      this.uploadTimer = null;
    }

    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export singleton instance
let queueManagerInstance: ReportQueueManager | null = null;

/**
 * Get the singleton queue manager instance
 */
export async function getQueueManager(): Promise<ReportQueueManager> {
  if (!queueManagerInstance) {
    queueManagerInstance = new ReportQueueManager();
    await queueManagerInstance.initialize();
  }
  return queueManagerInstance;
}
