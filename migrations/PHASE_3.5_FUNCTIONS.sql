-- =====================================================
-- PHASE 3.5: ADMIN DASHBOARD POSTGRESQL FUNCTIONS
-- =====================================================
-- Creates functions for:
-- - Dashboard analytics (KPIs, charts)
-- - Video/channel/user lookup
-- - Manual admin actions (force mark/unmark, flag, whitelist)
-- - Appeal management
-- =====================================================

-- =====================================================
-- 1. GET_DASHBOARD_ANALYTICS
-- Returns all KPI data for home dashboard
-- =====================================================

CREATE OR REPLACE FUNCTION get_dashboard_analytics(p_date_range INT DEFAULT 7)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_total_marked_videos INT;
    v_total_marked_videos_prev INT;
    v_total_reports INT;
    v_total_reports_prev INT;
    v_active_users_30d INT;
    v_active_users_prev INT;
    v_current_threshold NUMERIC;
    v_cutoff_date TIMESTAMPTZ;
    v_prev_cutoff_date TIMESTAMPTZ;
BEGIN
    -- Calculate date ranges
    v_cutoff_date := NOW() - (p_date_range || ' days')::INTERVAL;
    v_prev_cutoff_date := NOW() - ((p_date_range * 2) || ' days')::INTERVAL;

    -- Total marked videos (current)
    SELECT COUNT(*) INTO v_total_marked_videos
    FROM video_aggregates_cache
    WHERE is_marked = true;

    -- Total marked videos (previous period)
    SELECT COUNT(*) INTO v_total_marked_videos_prev
    FROM video_aggregates_cache
    WHERE is_marked = true
    AND first_reported_at <= v_cutoff_date;

    -- Total reports (current)
    SELECT COUNT(*) INTO v_total_reports
    FROM reports;

    -- Total reports (previous period - within date range)
    SELECT COUNT(*) INTO v_total_reports_prev
    FROM reports
    WHERE reported_at >= v_prev_cutoff_date
    AND reported_at < v_cutoff_date;

    -- Active users (last 30 days)
    SELECT COUNT(DISTINCT extension_id) INTO v_active_users_30d
    FROM extension_trust
    WHERE last_active >= NOW() - INTERVAL '30 days';

    -- Active users (previous 30-day period)
    SELECT COUNT(DISTINCT extension_id) INTO v_active_users_prev
    FROM extension_trust
    WHERE last_active >= NOW() - INTERVAL '60 days'
    AND last_active < NOW() - INTERVAL '30 days';

    -- Current threshold from community stats
    SELECT effective_threshold INTO v_current_threshold
    FROM community_stats
    WHERE id = 1;

    -- If no community stats, use default
    IF v_current_threshold IS NULL THEN
        v_current_threshold := 1.0;
    END IF;

    -- Build JSON response
    v_result := json_build_object(
        'total_marked_videos', v_total_marked_videos,
        'total_marked_videos_prev', v_total_marked_videos_prev,
        'total_reports', v_total_reports,
        'total_reports_prev', v_total_reports_prev,
        'active_users_30d', v_active_users_30d,
        'active_users_prev', v_active_users_prev,
        'current_threshold', v_current_threshold
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_dashboard_analytics IS 'Returns KPIs for admin dashboard home page (marked videos, reports, active users, threshold)';

-- =====================================================
-- 2. GET_TRUST_DISTRIBUTION
-- Returns histogram data for trust score chart
-- =====================================================

CREATE OR REPLACE FUNCTION get_trust_distribution()
RETURNS TABLE (
    range TEXT,
    count BIGINT,
    percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_users BIGINT;
BEGIN
    -- Get total users
    SELECT COUNT(*) INTO v_total_users FROM extension_trust;

    -- Return histogram bins
    RETURN QUERY
    SELECT
        bins.range,
        COUNT(et.extension_id) AS count,
        ROUND((COUNT(et.extension_id)::NUMERIC / NULLIF(v_total_users, 0)) * 100, 2) AS percentage
    FROM (
        VALUES
            ('0.30-0.40'),
            ('0.40-0.50'),
            ('0.50-0.60'),
            ('0.60-0.70'),
            ('0.70-0.80'),
            ('0.80-0.90'),
            ('0.90-1.00')
    ) AS bins(range)
    LEFT JOIN extension_trust et ON (
        (bins.range = '0.30-0.40' AND et.trust_score >= 0.30 AND et.trust_score < 0.40) OR
        (bins.range = '0.40-0.50' AND et.trust_score >= 0.40 AND et.trust_score < 0.50) OR
        (bins.range = '0.50-0.60' AND et.trust_score >= 0.50 AND et.trust_score < 0.60) OR
        (bins.range = '0.60-0.70' AND et.trust_score >= 0.60 AND et.trust_score < 0.70) OR
        (bins.range = '0.70-0.80' AND et.trust_score >= 0.70 AND et.trust_score < 0.80) OR
        (bins.range = '0.80-0.90' AND et.trust_score >= 0.80 AND et.trust_score < 0.90) OR
        (bins.range = '0.90-1.00' AND et.trust_score >= 0.90 AND et.trust_score <= 1.00)
    )
    GROUP BY bins.range
    ORDER BY bins.range;
END;
$$;

COMMENT ON FUNCTION get_trust_distribution IS 'Returns histogram of user trust scores (binned in 0.1 increments)';

-- =====================================================
-- 3. GET_REPORT_VOLUME_TIMESERIES
-- Returns daily report counts for last N days
-- =====================================================

CREATE OR REPLACE FUNCTION get_report_volume_timeseries(p_days INT DEFAULT 30)
RETURNS TABLE (
    date DATE,
    report_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.reported_at::DATE AS date,
        COUNT(*) AS report_count
    FROM reports r
    WHERE r.reported_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY r.reported_at::DATE
    ORDER BY date;
END;
$$;

COMMENT ON FUNCTION get_report_volume_timeseries IS 'Returns daily report counts for last N days (for line chart)';

-- =====================================================
-- 4. GET_VIDEO_DETAIL
-- Returns comprehensive video information + all reports
-- =====================================================

CREATE OR REPLACE FUNCTION get_video_detail(p_video_id VARCHAR)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_video_info JSON;
    v_reports JSON;
BEGIN
    -- Get video info from cache
    SELECT json_build_object(
        'video_id', vac.video_id,
        'channel_id', vac.channel_id,
        'effective_trust_points', vac.effective_trust_points,
        'raw_report_count', vac.raw_report_count,
        'is_marked', vac.is_marked,
        'first_reported_at', vac.first_reported_at,
        'last_updated_at', vac.last_updated_at
    ) INTO v_video_info
    FROM video_aggregates_cache vac
    WHERE vac.video_id = p_video_id;

    -- If not in cache, return null
    IF v_video_info IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get all reports for this video
    SELECT json_agg(
        json_build_object(
            'id', r.id,
            'video_id', r.video_id,
            'extension_id', r.extension_id,
            'trust_weight', r.trust_weight,
            'accuracy_status', r.accuracy_status,
            'reported_at', r.reported_at,
            'user_trust_score', et.trust_score,
            'user_pioneer_boost', et.pioneer_boost,
            'user_is_flagged', et.is_flagged
        )
    ) INTO v_reports
    FROM reports r
    LEFT JOIN extension_trust et ON r.extension_id = et.extension_id
    WHERE r.video_id = p_video_id
    ORDER BY r.reported_at DESC;

    -- Combine video info and reports
    v_result := json_build_object(
        'video', v_video_info,
        'reports', COALESCE(v_reports, '[]'::JSON)
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_video_detail IS 'Returns video metadata and all reports with user trust info';

-- =====================================================
-- 5. GET_CHANNEL_DETAIL
-- Returns channel statistics and all videos
-- =====================================================

CREATE OR REPLACE FUNCTION get_channel_detail(p_channel_id VARCHAR)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_total_videos_reported INT;
    v_total_videos_marked INT;
    v_avg_effective_trust NUMERIC;
    v_is_whitelisted BOOLEAN;
    v_whitelist_reason VARCHAR;
    v_videos JSON;
BEGIN
    -- Get channel statistics
    SELECT
        COUNT(*) AS total_videos_reported,
        COUNT(*) FILTER (WHERE is_marked = true) AS total_videos_marked,
        AVG(effective_trust_points) AS avg_effective_trust
    INTO v_total_videos_reported, v_total_videos_marked, v_avg_effective_trust
    FROM video_aggregates_cache
    WHERE channel_id = p_channel_id;

    -- Check whitelist status
    SELECT
        true,
        reason
    INTO v_is_whitelisted, v_whitelist_reason
    FROM channel_whitelist
    WHERE channel_id = p_channel_id;

    IF v_is_whitelisted IS NULL THEN
        v_is_whitelisted := false;
    END IF;

    -- Get all videos from this channel
    SELECT json_agg(
        json_build_object(
            'video_id', vac.video_id,
            'effective_trust_points', vac.effective_trust_points,
            'raw_report_count', vac.raw_report_count,
            'is_marked', vac.is_marked,
            'first_reported_at', vac.first_reported_at
        )
    ) INTO v_videos
    FROM video_aggregates_cache vac
    WHERE vac.channel_id = p_channel_id
    ORDER BY vac.last_updated_at DESC;

    -- Build result
    v_result := json_build_object(
        'channel_id', p_channel_id,
        'total_videos_reported', COALESCE(v_total_videos_reported, 0),
        'total_videos_marked', COALESCE(v_total_videos_marked, 0),
        'avg_effective_trust', COALESCE(v_avg_effective_trust, 0),
        'is_whitelisted', v_is_whitelisted,
        'whitelist_reason', v_whitelist_reason,
        'videos', COALESCE(v_videos, '[]'::JSON)
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_channel_detail IS 'Returns channel statistics, whitelist status, and all reported videos';

-- =====================================================
-- 6. GET_USER_DETAIL
-- Returns user trust profile and report history
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_detail(p_extension_id VARCHAR)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_user_info JSON;
    v_reports JSON;
BEGIN
    -- Get user trust info
    SELECT json_build_object(
        'extension_id', et.extension_id,
        'trust_score', et.trust_score,
        'first_seen', et.first_seen,
        'last_active', et.last_active,
        'total_reports', et.total_reports,
        'accurate_reports', et.accurate_reports,
        'inaccurate_reports', et.inaccurate_reports,
        'pending_reports', et.pending_reports,
        'accuracy_rate', et.accuracy_rate,
        'pioneer_boost', et.pioneer_boost,
        'user_number', et.user_number,
        'is_flagged', et.is_flagged,
        'flagged_reason', et.flagged_reason
    ) INTO v_user_info
    FROM extension_trust et
    WHERE et.extension_id = p_extension_id;

    -- If user doesn't exist, return null
    IF v_user_info IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get all reports by this user
    SELECT json_agg(
        json_build_object(
            'id', r.id,
            'video_id', r.video_id,
            'trust_weight', r.trust_weight,
            'accuracy_status', r.accuracy_status,
            'reported_at', r.reported_at,
            'channel_id', vac.channel_id,
            'is_video_marked', vac.is_marked
        )
    ) INTO v_reports
    FROM reports r
    LEFT JOIN video_aggregates_cache vac ON r.video_id = vac.video_id
    WHERE r.extension_id = p_extension_id
    ORDER BY r.reported_at DESC;

    -- Combine user info and reports
    v_result := json_build_object(
        'user', v_user_info,
        'reports', COALESCE(v_reports, '[]'::JSON)
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_user_detail IS 'Returns user trust profile and complete report history';

-- =====================================================
-- 7. FORCE_MARK_VIDEO
-- Admin action: Force mark a video regardless of trust points
-- =====================================================

CREATE OR REPLACE FUNCTION force_mark_video(
    p_video_id VARCHAR,
    p_admin_id VARCHAR,
    p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_is_marked BOOLEAN;
BEGIN
    -- Get current status
    SELECT is_marked INTO v_old_is_marked
    FROM video_aggregates_cache
    WHERE video_id = p_video_id;

    -- If video doesn't exist in cache, return error
    IF v_old_is_marked IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Video not found in cache');
    END IF;

    -- Update cache to force marked
    UPDATE video_aggregates_cache
    SET is_marked = true,
        last_updated_at = NOW()
    WHERE video_id = p_video_id;

    -- Log admin action
    INSERT INTO admin_actions (admin_id, action_type, subject_type, subject_id, reason, metadata)
    VALUES (
        p_admin_id,
        'force_mark',
        'video',
        p_video_id,
        p_reason,
        json_build_object('old_is_marked', v_old_is_marked, 'new_is_marked', true)
    );

    RETURN json_build_object('success', true, 'message', 'Video marked successfully');
END;
$$;

COMMENT ON FUNCTION force_mark_video IS 'Admin action: Force mark a video (bypasses trust threshold)';

-- =====================================================
-- 8. FORCE_UNMARK_VIDEO
-- Admin action: Force unmark a video
-- =====================================================

CREATE OR REPLACE FUNCTION force_unmark_video(
    p_video_id VARCHAR,
    p_admin_id VARCHAR,
    p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_is_marked BOOLEAN;
BEGIN
    -- Get current status
    SELECT is_marked INTO v_old_is_marked
    FROM video_aggregates_cache
    WHERE video_id = p_video_id;

    -- If video doesn't exist in cache, return error
    IF v_old_is_marked IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Video not found in cache');
    END IF;

    -- Update cache to force unmarked
    UPDATE video_aggregates_cache
    SET is_marked = false,
        last_updated_at = NOW()
    WHERE video_id = p_video_id;

    -- Log admin action
    INSERT INTO admin_actions (admin_id, action_type, subject_type, subject_id, reason, metadata)
    VALUES (
        p_admin_id,
        'force_unmark',
        'video',
        p_video_id,
        p_reason,
        json_build_object('old_is_marked', v_old_is_marked, 'new_is_marked', false)
    );

    RETURN json_build_object('success', true, 'message', 'Video unmarked successfully');
END;
$$;

COMMENT ON FUNCTION force_unmark_video IS 'Admin action: Force unmark a video (removes marked status)';

-- =====================================================
-- 9. DELETE_REPORT_ADMIN
-- Admin action: Delete a specific report (for spam/malicious reports)
-- =====================================================

CREATE OR REPLACE FUNCTION delete_report_admin(
    p_report_id BIGINT,
    p_admin_id VARCHAR,
    p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_video_id VARCHAR;
    v_extension_id VARCHAR;
BEGIN
    -- Get report info before deletion
    SELECT video_id, extension_id INTO v_video_id, v_extension_id
    FROM reports
    WHERE id = p_report_id;

    -- If report doesn't exist, return error
    IF v_video_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Report not found');
    END IF;

    -- Delete report
    DELETE FROM reports WHERE id = p_report_id;

    -- Trigger will automatically refresh cache

    -- Log admin action
    INSERT INTO admin_actions (admin_id, action_type, subject_type, subject_id, reason, metadata)
    VALUES (
        p_admin_id,
        'delete_report',
        'report',
        p_report_id::TEXT,
        p_reason,
        json_build_object('video_id', v_video_id, 'extension_id', v_extension_id)
    );

    RETURN json_build_object('success', true, 'message', 'Report deleted successfully');
END;
$$;

COMMENT ON FUNCTION delete_report_admin IS 'Admin action: Delete a report (for spam/malicious reports, triggers cache refresh)';

-- =====================================================
-- 10. ADD_CHANNEL_TO_WHITELIST
-- Admin action: Add channel to whitelist
-- =====================================================

CREATE OR REPLACE FUNCTION add_channel_to_whitelist(
    p_channel_id VARCHAR,
    p_reason VARCHAR,
    p_admin_id VARCHAR,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Insert or update whitelist entry
    INSERT INTO channel_whitelist (channel_id, reason, whitelisted_by, notes)
    VALUES (p_channel_id, p_reason, p_admin_id, p_notes)
    ON CONFLICT (channel_id)
    DO UPDATE SET
        reason = EXCLUDED.reason,
        whitelisted_by = EXCLUDED.whitelisted_by,
        notes = EXCLUDED.notes,
        whitelisted_at = NOW();

    -- Unmark all videos from this channel
    UPDATE video_aggregates_cache
    SET is_marked = false,
        last_updated_at = NOW()
    WHERE channel_id = p_channel_id;

    -- Log admin action
    INSERT INTO admin_actions (admin_id, action_type, subject_type, subject_id, reason, metadata)
    VALUES (
        p_admin_id,
        'whitelist_channel',
        'channel',
        p_channel_id,
        p_notes,
        json_build_object('whitelist_reason', p_reason)
    );

    RETURN json_build_object('success', true, 'message', 'Channel whitelisted successfully');
END;
$$;

COMMENT ON FUNCTION add_channel_to_whitelist IS 'Admin action: Add channel to whitelist (unmarks all videos from channel)';

-- =====================================================
-- 11. REMOVE_CHANNEL_FROM_WHITELIST
-- Admin action: Remove channel from whitelist
-- =====================================================

CREATE OR REPLACE FUNCTION remove_channel_from_whitelist(
    p_channel_id VARCHAR,
    p_admin_id VARCHAR,
    p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_reason VARCHAR;
BEGIN
    -- Get old reason
    SELECT reason INTO v_old_reason
    FROM channel_whitelist
    WHERE channel_id = p_channel_id;

    -- If not whitelisted, return error
    IF v_old_reason IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Channel not whitelisted');
    END IF;

    -- Remove from whitelist
    DELETE FROM channel_whitelist WHERE channel_id = p_channel_id;

    -- Recalculate all videos from this channel
    -- (they may now become marked if they meet threshold)
    UPDATE video_aggregates_cache vac
    SET is_marked = (vac.effective_trust_points >= (SELECT effective_threshold FROM community_stats WHERE id = 1)),
        last_updated_at = NOW()
    WHERE channel_id = p_channel_id;

    -- Log admin action
    INSERT INTO admin_actions (admin_id, action_type, subject_type, subject_id, reason, metadata)
    VALUES (
        p_admin_id,
        'remove_whitelist',
        'channel',
        p_channel_id,
        p_reason,
        json_build_object('old_reason', v_old_reason)
    );

    RETURN json_build_object('success', true, 'message', 'Channel removed from whitelist');
END;
$$;

COMMENT ON FUNCTION remove_channel_from_whitelist IS 'Admin action: Remove channel from whitelist (videos may become marked again)';

-- =====================================================
-- 12. FLAG_USER
-- Admin action: Flag a user as malicious
-- =====================================================

CREATE OR REPLACE FUNCTION flag_user(
    p_extension_id VARCHAR,
    p_admin_id VARCHAR,
    p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update user trust
    UPDATE extension_trust
    SET is_flagged = true,
        flagged_reason = p_reason,
        trust_score = 0.00,
        updated_at = NOW()
    WHERE extension_id = p_extension_id;

    -- Log admin action
    INSERT INTO admin_actions (admin_id, action_type, subject_type, subject_id, reason, metadata)
    VALUES (
        p_admin_id,
        'flag_user',
        'user',
        p_extension_id,
        p_reason,
        NULL
    );

    RETURN json_build_object('success', true, 'message', 'User flagged successfully');
END;
$$;

COMMENT ON FUNCTION flag_user IS 'Admin action: Flag user as malicious (sets trust_score to 0.00)';

-- =====================================================
-- 13. UNFLAG_USER
-- Admin action: Remove flag from user
-- =====================================================

CREATE OR REPLACE FUNCTION unflag_user(
    p_extension_id VARCHAR,
    p_admin_id VARCHAR,
    p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update user trust
    UPDATE extension_trust
    SET is_flagged = false,
        flagged_reason = NULL,
        updated_at = NOW()
    WHERE extension_id = p_extension_id;

    -- Recalculate trust score
    PERFORM calculate_trust_score(p_extension_id);

    -- Log admin action
    INSERT INTO admin_actions (admin_id, action_type, subject_type, subject_id, reason, metadata)
    VALUES (
        p_admin_id,
        'unflag_user',
        'user',
        p_extension_id,
        p_reason,
        NULL
    );

    RETURN json_build_object('success', true, 'message', 'User unflagged successfully, trust score recalculated');
END;
$$;

COMMENT ON FUNCTION unflag_user IS 'Admin action: Remove flag from user (recalculates trust score)';

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Phase 3.5 Functions Applied';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Functions created:';
    RAISE NOTICE '  ✓ get_dashboard_analytics';
    RAISE NOTICE '  ✓ get_trust_distribution';
    RAISE NOTICE '  ✓ get_report_volume_timeseries';
    RAISE NOTICE '  ✓ get_video_detail';
    RAISE NOTICE '  ✓ get_channel_detail';
    RAISE NOTICE '  ✓ get_user_detail';
    RAISE NOTICE '  ✓ force_mark_video';
    RAISE NOTICE '  ✓ force_unmark_video';
    RAISE NOTICE '  ✓ delete_report_admin';
    RAISE NOTICE '  ✓ add_channel_to_whitelist';
    RAISE NOTICE '  ✓ remove_channel_from_whitelist';
    RAISE NOTICE '  ✓ flag_user';
    RAISE NOTICE '  ✓ unflag_user';
    RAISE NOTICE '';
    RAISE NOTICE '🎉 Phase 3.5 database setup complete!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next: Run these SQL files in Supabase SQL Editor';
END $$;
