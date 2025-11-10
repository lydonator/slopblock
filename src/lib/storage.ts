/**
 * Storage utilities - IndexedDB-based (no chrome.storage permission required)
 * Manages extension settings and user state
 */

import { getSettingsStore, getReportStateStore, getDB } from './indexeddb';
import type { CachedVideoData } from '../types';

/**
 * User report states for a video
 */
export enum ReportState {
  NOT_REPORTED = 'not_reported',
  REPORTED = 'reported',
  REMOVED = 'removed'
}

/**
 * Get or generate the unique extension ID for this installation
 * This ID is used to identify the user anonymously in the database
 */
export async function getExtensionId(): Promise<string> {
  const settingsStore = getSettingsStore();
  const existingId = await settingsStore.get<string>('extension_id');

  if (existingId) {
    console.log('[SlopBlock] Using existing extension ID:', existingId);
    return existingId;
  }

  // Generate a new unique ID for this extension installation
  const newId = crypto.randomUUID();
  console.log('[SlopBlock] Generated NEW extension ID:', newId);
  await settingsStore.setImmediate('extension_id', newId);

  // CRITICAL: Verify the ID was actually written to IndexedDB
  const verifyId = await settingsStore.get<string>('extension_id');
  if (verifyId !== newId) {
    console.error('[SlopBlock] CRITICAL: Extension ID verification failed!');
    console.error('[SlopBlock] Expected:', newId);
    console.error('[SlopBlock] Got:', verifyId);
  } else {
    console.log('[SlopBlock] Extension ID verified in IndexedDB');
  }

  return newId;
}

/**
 * Get the auto-hide setting value
 * @returns True if auto-hide is enabled, false otherwise (default: false)
 */
export async function getAutoHideEnabled(): Promise<boolean> {
  const settingsStore = getSettingsStore();
  const enabled = await settingsStore.get<boolean>('auto_hide_enabled');
  return enabled ?? false; // Default: OFF
}

/**
 * Set the auto-hide setting value
 * @param enabled - True to enable auto-hide, false to disable
 */
export async function setAutoHideEnabled(enabled: boolean): Promise<void> {
  const settingsStore = getSettingsStore();
  settingsStore.set('auto_hide_enabled', enabled);
}

/**
 * Get the upload interval setting (for testing only)
 * @returns Upload interval in seconds (default: 600 = 10 minutes)
 */
export async function getUploadInterval(): Promise<number> {
  const settingsStore = getSettingsStore();
  const interval = await settingsStore.get<number>('upload_interval_seconds');
  return interval ?? 600; // Default: 10 minutes
}

/**
 * Set the upload interval setting (for testing only)
 * NOTE: This function only updates the stored value.
 * The alarm recreation is handled by the background worker via SET_UPLOAD_INTERVAL message.
 * @param seconds - Upload interval in seconds
 */
export async function setUploadInterval(seconds: number): Promise<void> {
  const settingsStore = getSettingsStore();
  await settingsStore.setImmediate('upload_interval_seconds', seconds);
  console.log(`[SlopBlock] Upload interval setting saved: ${seconds}s`);
}

/**
 * Get cached video data from storage
 * @returns Map of video_id to cached video data
 * @deprecated Phase 4: Use IndexedDB marked-videos cache instead
 */
export async function getVideoCache(): Promise<Record<string, CachedVideoData>> {
  // Legacy function - return empty object
  // Video cache is now in IndexedDB marked-videos store
  return {};
}

/**
 * Update cached video data in storage
 * @deprecated Phase 4: Use IndexedDB marked-videos cache instead
 */
export async function setVideoCache(_cache: Record<string, CachedVideoData>): Promise<void> {
  // Legacy function - no-op
  // Video cache is now in IndexedDB marked-videos store
}

/**
 * Clear all cached video data
 * @deprecated Phase 4: Use clearCache() from indexeddb.ts instead
 */
export async function clearVideoCache(): Promise<void> {
  // Legacy function - no-op
  // Video cache is now in IndexedDB marked-videos store
}

/**
 * Get user's report state for a specific video
 * @param videoId - YouTube video ID
 * @returns User's report state (not_reported, reported, or removed)
 */
export async function getUserReportState(videoId: string): Promise<ReportState> {
  const reportStateStore = getReportStateStore();
  const state = await reportStateStore.get(videoId);
  return (state as ReportState) ?? ReportState.NOT_REPORTED;
}

/**
 * Set user's report state for a specific video
 * @param videoId - YouTube video ID
 * @param state - Report state to set
 */
export async function setUserReportState(videoId: string, state: ReportState): Promise<void> {
  const reportStateStore = getReportStateStore();
  reportStateStore.set(videoId, state);
}

/**
 * Clear all extension data (useful for debugging)
 */
export async function clearAllData(): Promise<void> {
  const settingsStore = getSettingsStore();
  const reportStateStore = getReportStateStore();

  await reportStateStore.clear();
  // Keep extension_id only
  const extensionId = await settingsStore.get<string>('extension_id');

  // Clear settings store (will be recreated)
  const db = await getDB();
  await db.clear('settings');

  // Restore extension ID if it existed
  if (extensionId) {
    await settingsStore.setImmediate('extension_id', extensionId);
  }

  console.log('[SlopBlock] Cleared all user data (preserved extension_id)');
}

/**
 * NUCLEAR OPTION: Clear ALL data including extension ID
 * Only use this for fresh start testing - will break report associations
 */
export async function clearAllDataIncludingExtensionId(): Promise<void> {
  const reportStateStore = getReportStateStore();

  await reportStateStore.clear();

  // Clear settings store (will be recreated)
  const db = await getDB();
  await db.clear('settings');

  console.log('[SlopBlock] NUCLEAR CLEAR: All data including extension_id removed. New ID will be generated on next use.');
}

/**
 * REMOVED: Config migration system
 *
 * All migration code removed after database wipe on 2025-11-09.
 * All installs now start fresh with IndexedDB (no chrome.storage legacy).
 *
 * This function is kept as a no-op to prevent breaking existing imports.
 */
export async function runMigrations(): Promise<void> {
  console.log('[SlopBlock] Config migrations skipped - fresh install');
  // No-op - migration code removed
}
