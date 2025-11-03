-- =====================================================
-- PHASE 3.5: USER LIST FUNCTION FOR ADMIN DASHBOARD
-- =====================================================
-- Provides paginated, filtered, and sorted user list
-- for the Users Trust Score Browser page
-- =====================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_user_list(
    INT, INT, DECIMAL, DECIMAL, BOOLEAN, BOOLEAN, VARCHAR, VARCHAR
);

-- =====================================================
-- GET_USER_LIST
-- Fetches paginated and filtered user list with sorting
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_list(
    p_offset INT DEFAULT 0,
    p_limit INT DEFAULT 50,
    p_trust_min DECIMAL DEFAULT 0.0,
    p_trust_max DECIMAL DEFAULT 1.0,
    p_pioneers_only BOOLEAN DEFAULT false,
    p_flagged_only BOOLEAN DEFAULT false,
    p_sort_by VARCHAR DEFAULT 'trust_score',
    p_sort_order VARCHAR DEFAULT 'DESC'
)
RETURNS TABLE (
    extension_id VARCHAR,
    trust_score DECIMAL,
    accuracy_rate DECIMAL,
    total_reports INT,
    user_number INT,
    pioneer_boost DECIMAL,
    is_flagged BOOLEAN,
    flagged_reason VARCHAR,
    last_active TIMESTAMPTZ,
    first_seen TIMESTAMPTZ,
    total_removed_reports INT,
    accurate_reports INT,
    inaccurate_reports INT,
    pending_reports INT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_count BIGINT;
BEGIN
    -- Get total count for pagination (before applying LIMIT/OFFSET)
    SELECT COUNT(*) INTO v_total_count
    FROM extension_trust et
    WHERE
        et.trust_score >= p_trust_min
        AND et.trust_score <= p_trust_max
        AND (NOT p_pioneers_only OR et.user_number IS NOT NULL AND et.user_number <= 2000)
        AND (NOT p_flagged_only OR et.is_flagged = true);

    -- Return paginated results with sorting
    RETURN QUERY
    SELECT
        et.extension_id::VARCHAR,
        et.trust_score::DECIMAL,
        et.accuracy_rate::DECIMAL,
        et.total_reports::INT,
        et.user_number::INT,
        et.pioneer_boost::DECIMAL,
        et.is_flagged::BOOLEAN,
        et.flagged_reason::VARCHAR,
        et.last_active::TIMESTAMPTZ,
        et.first_seen::TIMESTAMPTZ,
        et.total_removed_reports::INT,
        et.accurate_reports::INT,
        et.inaccurate_reports::INT,
        et.pending_reports::INT,
        et.created_at::TIMESTAMPTZ,
        et.updated_at::TIMESTAMPTZ,
        v_total_count::BIGINT
    FROM extension_trust et
    WHERE
        et.trust_score >= p_trust_min
        AND et.trust_score <= p_trust_max
        AND (NOT p_pioneers_only OR et.user_number IS NOT NULL AND et.user_number <= 2000)
        AND (NOT p_flagged_only OR et.is_flagged = true)
    ORDER BY
        CASE
            WHEN p_sort_by = 'trust_score' AND p_sort_order = 'DESC' THEN et.trust_score
        END DESC,
        CASE
            WHEN p_sort_by = 'trust_score' AND p_sort_order = 'ASC' THEN et.trust_score
        END ASC,
        CASE
            WHEN p_sort_by = 'accuracy_rate' AND p_sort_order = 'DESC' THEN et.accuracy_rate
        END DESC,
        CASE
            WHEN p_sort_by = 'accuracy_rate' AND p_sort_order = 'ASC' THEN et.accuracy_rate
        END ASC,
        CASE
            WHEN p_sort_by = 'total_reports' AND p_sort_order = 'DESC' THEN et.total_reports
        END DESC,
        CASE
            WHEN p_sort_by = 'total_reports' AND p_sort_order = 'ASC' THEN et.total_reports
        END ASC,
        CASE
            WHEN p_sort_by = 'last_active' AND p_sort_order = 'DESC' THEN et.last_active
        END DESC,
        CASE
            WHEN p_sort_by = 'last_active' AND p_sort_order = 'ASC' THEN et.last_active
        END ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION get_user_list IS 'Returns paginated and filtered user list for admin dashboard with sorting options';

-- =====================================================
-- GET_USER_DETAIL
-- Returns comprehensive user profile with recent reports
-- =====================================================

DROP FUNCTION IF EXISTS get_user_detail(VARCHAR);

CREATE OR REPLACE FUNCTION get_user_detail(
    p_extension_id VARCHAR
)
RETURNS TABLE (
    extension_id VARCHAR,
    trust_score DECIMAL,
    accuracy_rate DECIMAL,
    total_reports INT,
    total_removed_reports INT,
    accurate_reports INT,
    inaccurate_reports INT,
    pending_reports INT,
    user_number INT,
    pioneer_boost DECIMAL,
    is_flagged BOOLEAN,
    flagged_reason VARCHAR,
    first_seen TIMESTAMPTZ,
    last_active TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    recent_reports JSON
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        et.extension_id::VARCHAR,
        et.trust_score::DECIMAL,
        et.accuracy_rate::DECIMAL,
        et.total_reports::INT,
        et.total_removed_reports::INT,
        et.accurate_reports::INT,
        et.inaccurate_reports::INT,
        et.pending_reports::INT,
        et.user_number::INT,
        et.pioneer_boost::DECIMAL,
        et.is_flagged::BOOLEAN,
        et.flagged_reason::VARCHAR,
        et.first_seen::TIMESTAMPTZ,
        et.last_active::TIMESTAMPTZ,
        et.created_at::TIMESTAMPTZ,
        et.updated_at::TIMESTAMPTZ,
        COALESCE(
            (SELECT json_agg(
                json_build_object(
                    'report_id', r.id,
                    'video_id', r.video_id,
                    'channel_id', vac.channel_id,
                    'trust_weight', r.trust_weight,
                    'accuracy_status', r.accuracy_status,
                    'is_video_marked', vac.is_marked,
                    'reported_at', r.reported_at
                ) ORDER BY r.reported_at DESC
            )
            FROM reports r
            LEFT JOIN video_aggregates_cache vac ON r.video_id = vac.video_id
            WHERE r.extension_id = p_extension_id
            LIMIT 20),
            '[]'::JSON
        )::JSON AS recent_reports
    FROM extension_trust et
    WHERE et.extension_id = p_extension_id;
END;
$$;

COMMENT ON FUNCTION get_user_detail IS 'Returns comprehensive user profile with last 20 reports';

-- =====================================================
-- FLAG_USER / UNFLAG_USER ADMIN ACTIONS
-- =====================================================

DROP FUNCTION IF EXISTS flag_user_admin(VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION flag_user_admin(
    p_extension_id VARCHAR,
    p_admin_id VARCHAR,
    p_reason VARCHAR
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
BEGIN
    -- Update user's flagged status
    UPDATE extension_trust
    SET
        is_flagged = true,
        flagged_reason = p_reason,
        updated_at = NOW()
    WHERE extension_id = p_extension_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'message', 'User not found'
        );
    END IF;

    -- Log admin action
    INSERT INTO admin_actions (admin_id, action_type, subject_type, subject_id, reason)
    VALUES (p_admin_id, 'flag_user', 'user', p_extension_id, p_reason);

    RETURN json_build_object(
        'success', true,
        'message', 'User flagged successfully'
    );
END;
$$;

COMMENT ON FUNCTION flag_user_admin IS 'Flags a user for review (admin action)';

-- ---

DROP FUNCTION IF EXISTS unflag_user_admin(VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION unflag_user_admin(
    p_extension_id VARCHAR,
    p_admin_id VARCHAR,
    p_reason VARCHAR
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
BEGIN
    -- Update user's flagged status
    UPDATE extension_trust
    SET
        is_flagged = false,
        flagged_reason = NULL,
        updated_at = NOW()
    WHERE extension_id = p_extension_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'message', 'User not found'
        );
    END IF;

    -- Log admin action
    INSERT INTO admin_actions (admin_id, action_type, subject_type, subject_id, reason)
    VALUES (p_admin_id, 'unflag_user', 'user', p_extension_id, p_reason);

    RETURN json_build_object(
        'success', true,
        'message', 'User unflagged successfully'
    );
END;
$$;

COMMENT ON FUNCTION unflag_user_admin IS 'Removes flag from a user (admin action)';

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Phase 3.5 User List Functions Created';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Created functions:';
    RAISE NOTICE '  ✓ get_user_list (paginated, filtered, sorted)';
    RAISE NOTICE '  ✓ get_user_detail (comprehensive profile + reports)';
    RAISE NOTICE '  ✓ flag_user_admin (flag user for review)';
    RAISE NOTICE '  ✓ unflag_user_admin (remove flag)';
    RAISE NOTICE '';
    RAISE NOTICE '🎉 Run this file in Supabase SQL Editor!';
    RAISE NOTICE '';
END $$;
