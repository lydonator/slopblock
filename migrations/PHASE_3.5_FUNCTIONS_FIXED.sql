-- =====================================================
-- PHASE 3.5: ADMIN DASHBOARD POSTGRESQL FUNCTIONS (FIXED)
-- =====================================================
-- Fixes GROUP BY errors in get_video_detail and get_channel_detail
-- =====================================================

-- Drop existing functions first to change return types
DROP FUNCTION IF EXISTS get_video_detail(VARCHAR);
DROP FUNCTION IF EXISTS get_channel_detail(VARCHAR);

-- =====================================================
-- 4. GET_VIDEO_DETAIL (FIXED)
-- Returns comprehensive video information + all reports
-- =====================================================

CREATE FUNCTION get_video_detail(p_video_id VARCHAR)
RETURNS TABLE (
    video_id VARCHAR,
    channel_id VARCHAR,
    report_count INT,
    is_marked BOOLEAN,
    is_flagged BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    reports JSON
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        vac.video_id::VARCHAR AS video_id,
        vac.channel_id::VARCHAR AS channel_id,
        vac.raw_report_count::INT AS report_count,
        vac.is_marked::BOOLEAN AS is_marked,
        false::BOOLEAN AS is_flagged,
        vac.first_reported_at::TIMESTAMPTZ AS created_at,
        vac.last_updated_at::TIMESTAMPTZ AS updated_at,
        COALESCE(
            (SELECT json_agg(
                json_build_object(
                    'report_id', r.id,
                    'extension_id', r.extension_id,
                    'report_weight', r.trust_weight,
                    'user_trust_score', et.trust_score,
                    'created_at', r.reported_at
                ) ORDER BY r.reported_at DESC
            )
            FROM reports r
            LEFT JOIN extension_trust et ON r.extension_id = et.extension_id
            WHERE r.video_id = p_video_id),
            '[]'::JSON
        )::JSON AS reports
    FROM video_aggregates_cache vac
    WHERE vac.video_id = p_video_id;
END;
$$;

COMMENT ON FUNCTION get_video_detail IS 'Returns video metadata and all reports with user trust info (FIXED for GROUP BY)';

-- =====================================================
-- 5. GET_CHANNEL_DETAIL (FIXED)
-- Returns channel statistics and all videos
-- =====================================================

CREATE OR REPLACE FUNCTION get_channel_detail(p_channel_id VARCHAR)
RETURNS TABLE (
    channel_id VARCHAR,
    total_videos INT,
    marked_videos INT,
    total_reports INT,
    is_whitelisted BOOLEAN,
    is_verified BOOLEAN,
    whitelist_reason VARCHAR,
    whitelisted_at TIMESTAMPTZ,
    videos JSON
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_videos INT;
    v_marked_videos INT;
    v_total_reports INT;
    v_is_whitelisted BOOLEAN;
    v_is_verified BOOLEAN;
    v_whitelist_reason VARCHAR;
    v_whitelisted_at TIMESTAMPTZ;
    v_videos JSON;
BEGIN
    -- Get channel statistics
    SELECT
        COUNT(*)::INT,
        COUNT(*) FILTER (WHERE vac.is_marked = true)::INT,
        SUM(vac.raw_report_count)::INT
    INTO v_total_videos, v_marked_videos, v_total_reports
    FROM video_aggregates_cache vac
    WHERE vac.channel_id = p_channel_id;

    -- Check whitelist status (use aliases to avoid ambiguity)
    SELECT
        true,
        (cw.reason = 'verified'), -- is_verified if reason is 'verified'
        cw.reason,
        cw.whitelisted_at
    INTO v_is_whitelisted, v_is_verified, v_whitelist_reason, v_whitelisted_at
    FROM channel_whitelist cw
    WHERE cw.channel_id = p_channel_id;

    -- Default to not whitelisted if not found
    IF v_is_whitelisted IS NULL THEN
        v_is_whitelisted := false;
        v_is_verified := false;
    END IF;

    -- Get all videos from this channel
    SELECT json_agg(
        json_build_object(
            'video_id', vac.video_id,
            'report_count', vac.raw_report_count,
            'is_marked', vac.is_marked,
            'created_at', vac.first_reported_at
        ) ORDER BY vac.last_updated_at DESC
    ) INTO v_videos
    FROM video_aggregates_cache vac
    WHERE vac.channel_id = p_channel_id;

    -- Return single row (explicit column names to match RETURNS TABLE)
    RETURN QUERY
    SELECT
        p_channel_id AS channel_id,
        COALESCE(v_total_videos, 0) AS total_videos,
        COALESCE(v_marked_videos, 0) AS marked_videos,
        COALESCE(v_total_reports, 0) AS total_reports,
        COALESCE(v_is_whitelisted, false) AS is_whitelisted,
        COALESCE(v_is_verified, false) AS is_verified,
        v_whitelist_reason AS whitelist_reason,
        v_whitelisted_at AS whitelisted_at,
        COALESCE(v_videos, '[]'::JSON) AS videos;
END;
$$;

COMMENT ON FUNCTION get_channel_detail IS 'Returns channel statistics, whitelist status, and all reported videos (FIXED for GROUP BY)';

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Phase 3.5 Functions FIXED';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Fixed functions:';
    RAISE NOTICE '  ✓ get_video_detail (GROUP BY error resolved)';
    RAISE NOTICE '  ✓ get_channel_detail (GROUP BY error resolved)';
    RAISE NOTICE '';
    RAISE NOTICE '🎉 Run this file in Supabase SQL Editor!';
    RAISE NOTICE '';
END $$;
