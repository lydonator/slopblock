/**
 * API service module for Supabase backend
 * Handles all database operations via Supabase functions
 */

import { supabase } from '../lib/supabase';
import { getExtensionId } from '../lib/storage';
import type {
  ReportVideoResponse,
  RemoveReportResponse,
  MarkedVideo,
  MarkedVideoWeighted,
  ChannelStatsResponse,
  CheckUserReportResponse,
  CheckUserReportWeightedResponse,
  UserStatsResponse,
  BatchReportResult,
  ExtensionTrust,
  CommunityStats,
} from '../types';

/**
 * Report a video as AI slop
 * @param videoId - YouTube video ID
 * @param channelId - YouTube channel ID
 * @returns Response with success status and report count
 */
export async function reportVideo(
  videoId: string,
  channelId: string
): Promise<ReportVideoResponse> {
  try {
    const extensionId = await getExtensionId();

    const { data, error } = await supabase.rpc('report_video', {
      p_video_id: videoId,
      p_channel_id: channelId,
      p_extension_id: extensionId,
    });

    if (error) {
      console.error('Error reporting video:', error);
      throw error;
    }

    return data as ReportVideoResponse;
  } catch (error) {
    console.error('Failed to report video:', error);
    throw error;
  }
}

/**
 * Remove a report (undo functionality)
 * @param videoId - YouTube video ID
 * @returns Response with success status and updated report count
 */
export async function removeReport(videoId: string): Promise<RemoveReportResponse> {
  try {
    const extensionId = await getExtensionId();

    const { data, error } = await supabase.rpc('remove_report', {
      p_video_id: videoId,
      p_extension_id: extensionId,
    });

    if (error) {
      console.error('Error removing report:', error);
      throw error;
    }

    return data as RemoveReportResponse;
  } catch (error) {
    console.error('Failed to remove report:', error);
    throw error;
  }
}

/**
 * Check multiple videos for slop status (bulk operation)
 * Only returns videos that meet the threshold (3+ reports)
 * @param videoIds - Array of YouTube video IDs to check
 * @returns Array of marked videos with report counts
 */
export async function getMarkedVideos(videoIds: string[]): Promise<MarkedVideo[]> {
  try {
    if (videoIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase.rpc('get_marked_videos', {
      p_video_ids: videoIds,
    });

    if (error) {
      console.error('Error fetching marked videos:', error);
      throw error;
    }

    return (data as MarkedVideo[]) || [];
  } catch (error) {
    console.error('Failed to fetch marked videos:', error);
    return [];
  }
}

/**
 * Get statistics for a specific channel
 * @param channelId - YouTube channel ID
 * @returns Channel statistics including marked video count
 */
export async function getChannelStats(channelId: string): Promise<ChannelStatsResponse> {
  try {
    const { data, error } = await supabase.rpc('get_channel_stats', {
      p_channel_id: channelId,
    });

    if (error) {
      console.error('Error fetching channel stats:', error);
      throw error;
    }

    return data as ChannelStatsResponse;
  } catch (error) {
    console.error('Failed to fetch channel stats:', error);
    throw error;
  }
}

/**
 * Check if the current user has reported a specific video
 * @param videoId - YouTube video ID
 * @returns Object with has_reported flag and total report count
 */
export async function checkUserReport(videoId: string): Promise<CheckUserReportResponse> {
  try {
    const extensionId = await getExtensionId();

    const { data, error } = await supabase.rpc('check_user_report', {
      p_video_id: videoId,
      p_extension_id: extensionId,
    });

    if (error) {
      console.error('Error checking user report:', error);
      throw error;
    }

    return data as CheckUserReportResponse;
  } catch (error) {
    console.error('Failed to check user report:', error);
    throw error;
  }
}

/**
 * Get statistics for the current user
 * @returns Object with user's report count and total marked videos globally
 */
export async function getUserStats(): Promise<UserStatsResponse> {
  try {
    const extensionId = await getExtensionId();

    const { data, error } = await supabase.rpc('get_user_stats', {
      p_extension_id: extensionId,
    });

    if (error) {
      console.error('Error fetching user stats:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      console.error('Extension ID used:', extensionId);
      throw error;
    }

    // Handle array response (function returns TABLE)
    // TODO: Migrate to RETURNS json in SQL for cleaner response
    if (Array.isArray(data) && data.length > 0) {
      return data[0] as UserStatsResponse;
    }

    // Fallback for empty result
    return {
      extension_id: extensionId,
      user_reports: 0,
      total_marked_videos: 0,
    };
  } catch (error) {
    console.error('Failed to fetch user stats:', error);
    throw error;
  }
}

// =====================================================
// PHASE 3: TRUST-WEIGHTED FUNCTIONS
// =====================================================

/**
 * Batch report multiple videos in a single transaction (Phase 3)
 * Reduces API calls by 90% through client-side queuing
 * @param reports - Array of {video_id, channel_id, extension_id}
 * @returns Array of results for each video
 */
export async function batchReportVideos(
  reports: Array<{ video_id: string; channel_id: string; extension_id: string }>
): Promise<BatchReportResult[]> {
  try {
    if (reports.length === 0) {
      return [];
    }

    const { data, error } = await supabase.rpc('batch_report_videos', {
      p_reports: reports,
    });

    if (error) {
      console.error('Error batch reporting videos:', error);
      throw error;
    }

    return (data as BatchReportResult[]) || [];
  } catch (error) {
    console.error('Failed to batch report videos:', error);
    throw error;
  }
}

/**
 * Get marked videos using trust-weighted scoring (Phase 3)
 * Replaces getMarkedVideos() with trust point threshold (2.5 points)
 * @param videoIds - Array of YouTube video IDs to check
 * @returns Array of marked videos with effective trust points
 */
export async function getMarkedVideosWeighted(
  videoIds: string[]
): Promise<MarkedVideoWeighted[]> {
  try {
    if (videoIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase.rpc('get_marked_videos_weighted', {
      p_video_ids: videoIds,
    });

    if (error) {
      console.error('Error fetching marked videos (weighted):', error);
      throw error;
    }

    return (data as MarkedVideoWeighted[]) || [];
  } catch (error) {
    console.error('Failed to fetch marked videos (weighted):', error);
    return [];
  }
}

/**
 * Check if user has reported video with trust weight info (Phase 3)
 * @param videoId - YouTube video ID
 * @returns Object with has_reported flag and trust weight at time of report
 */
export async function checkUserReportWeighted(
  videoId: string
): Promise<CheckUserReportWeightedResponse> {
  try {
    const extensionId = await getExtensionId();

    const { data, error } = await supabase.rpc('check_user_report_weighted', {
      p_video_id: videoId,
      p_extension_id: extensionId,
    });

    if (error) {
      console.error('Error checking user report (weighted):', error);
      throw error;
    }

    // Handle array response (function returns TABLE)
    if (Array.isArray(data) && data.length > 0) {
      return data[0] as CheckUserReportWeightedResponse;
    }

    // No report found
    return {
      has_reported: false,
      trust_weight: 0,
      reported_at: null,
    };
  } catch (error) {
    console.error('Failed to check user report (weighted):', error);
    return {
      has_reported: false,
      trust_weight: 0,
      reported_at: null,
    };
  }
}

/**
 * Get trust score for current extension (Phase 3)
 * @returns Trust score object with metadata
 */
export async function getTrustScore(): Promise<ExtensionTrust | null> {
  try {
    const extensionId = await getExtensionId();

    // First, ensure trust record exists by calling ensure_trust_record
    await supabase.rpc('ensure_trust_record', {
      p_extension_id: extensionId,
    });

    // Now fetch the full trust record
    const { data: trustData, error: trustError } = await supabase
      .from('extension_trust')
      .select('*')
      .eq('extension_id', extensionId)
      .single();

    if (trustError) {
      console.error('Error fetching trust record:', trustError);

      // If record doesn't exist, return default values
      return {
        extension_id: extensionId,
        trust_score: 0.30,
        first_seen: new Date().toISOString(),
        last_active: new Date().toISOString(),
        total_reports: 0,
        total_removed_reports: 0,
        accurate_reports: 0,
        inaccurate_reports: 0,
        pending_reports: 0,
        accuracy_rate: 0.50,
        pioneer_boost: 0.00,
        user_number: null,
        is_flagged: false,
        flagged_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    return trustData as ExtensionTrust;
  } catch (error) {
    console.error('Failed to get trust score:', error);

    // Return default values on error
    const extensionId = await getExtensionId();
    return {
      extension_id: extensionId,
      trust_score: 0.30,
      first_seen: new Date().toISOString(),
      last_active: new Date().toISOString(),
      total_reports: 0,
      total_removed_reports: 0,
      accurate_reports: 0,
      inaccurate_reports: 0,
      pending_reports: 0,
      accuracy_rate: 0.50,
      pioneer_boost: 0.00,
      user_number: null,
      is_flagged: false,
      flagged_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}

// =====================================================
// PHASE 3: COLD-START SOLUTION
// =====================================================

/**
 * Get community maturity stats and dynamic threshold (Phase 3 Cold-Start)
 * @returns Community stats object with current dynamic threshold
 */
export async function getCommunityStats(): Promise<CommunityStats | null> {
  try {
    const { data, error } = await supabase
      .from('community_stats')
      .select('*')
      .eq('id', 1)
      .maybeSingle(); // Changed from .single() to .maybeSingle() - returns null if no rows

    if (error) {
      console.error('Error fetching community stats:', error);
      throw error;
    }

    // If table is empty (fresh database), return default values
    if (!data) {
      console.log('[SlopBlock] Community stats table empty, returning defaults');
      return {
        id: 1,
        total_users: 0,
        active_users_30d: 0,
        avg_trust_weight: 0.30,
        maturity_factor: 0.40,
        effective_threshold: 1.00,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
    }

    return data as CommunityStats;
  } catch (error) {
    console.error('Failed to fetch community stats:', error);

    // Return default values on error
    return {
      id: 1,
      total_users: 0,
      active_users_30d: 0,
      avg_trust_weight: 0.30,
      maturity_factor: 0.40,
      effective_threshold: 1.00,
      last_updated: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
  }
}
