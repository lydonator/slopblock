-- =====================================================
-- PHASE 3.5: APPEALS SYSTEM POSTGRESQL FUNCTIONS
-- =====================================================
-- Functions for managing appeals queue and resolution
-- =====================================================

-- =====================================================
-- 1. GET_APPEALS_LIST
-- Returns paginated appeals with filters
-- =====================================================

DROP FUNCTION IF EXISTS get_appeals_list(VARCHAR, INT, INT);

CREATE FUNCTION get_appeals_list(
    p_status VARCHAR DEFAULT NULL,      -- Filter by status ('pending', 'under_review', 'resolved', 'rejected', or NULL for all)
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    appeal_id BIGINT,
    appeal_type VARCHAR,
    subject_id VARCHAR,
    submitter_email VARCHAR,
    reasoning TEXT,
    status VARCHAR,
    assigned_to VARCHAR,
    submitted_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolution_action TEXT,
    note_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id::BIGINT AS appeal_id,
        a.appeal_type::VARCHAR AS appeal_type,
        a.subject_id::VARCHAR AS subject_id,
        a.submitter_email::VARCHAR AS submitter_email,
        a.reasoning AS reasoning,
        a.status::VARCHAR AS status,
        a.assigned_to::VARCHAR AS assigned_to,
        a.submitted_at AS submitted_at,
        a.resolved_at AS resolved_at,
        a.resolution_action AS resolution_action,
        COALESCE((
            SELECT COUNT(*)::INT
            FROM appeal_notes an
            WHERE an.appeal_id = a.id
        ), 0) AS note_count
    FROM appeals a
    WHERE (p_status IS NULL OR a.status = p_status)
    ORDER BY
        CASE
            WHEN a.status = 'under_review' THEN 1
            WHEN a.status = 'pending' THEN 2
            ELSE 3
        END,
        a.submitted_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION get_appeals_list IS 'Returns paginated appeals with optional status filter, sorted by priority';

-- =====================================================
-- 2. GET_APPEAL_DETAIL
-- Returns comprehensive appeal information + evidence
-- =====================================================

DROP FUNCTION IF EXISTS get_appeal_detail(BIGINT);

CREATE FUNCTION get_appeal_detail(p_appeal_id BIGINT)
RETURNS TABLE (
    appeal_id BIGINT,
    appeal_type VARCHAR,
    subject_id VARCHAR,
    submitter_email VARCHAR,
    reasoning TEXT,
    status VARCHAR,
    assigned_to VARCHAR,
    submitted_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolution_action TEXT,
    notes JSON,
    evidence JSON
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_appeal_type VARCHAR;
    v_subject_id VARCHAR;
    v_evidence JSON;
BEGIN
    -- Get appeal type and subject ID
    SELECT a.appeal_type, a.subject_id
    INTO v_appeal_type, v_subject_id
    FROM appeals a
    WHERE a.id = p_appeal_id;

    -- Fetch evidence based on appeal type
    IF v_appeal_type = 'video' THEN
        -- Get video details
        SELECT json_build_object(
            'video_id', vac.video_id,
            'channel_id', vac.channel_id,
            'report_count', vac.raw_report_count,
            'is_marked', vac.is_marked,
            'first_reported_at', vac.first_reported_at,
            'last_updated_at', vac.last_updated_at
        ) INTO v_evidence
        FROM video_aggregates_cache vac
        WHERE vac.video_id = v_subject_id;

    ELSIF v_appeal_type = 'channel' THEN
        -- Get channel details
        SELECT json_build_object(
            'channel_id', v_subject_id,
            'total_videos', COUNT(*),
            'marked_videos', COUNT(*) FILTER (WHERE vac.is_marked = true),
            'total_reports', SUM(vac.raw_report_count)
        ) INTO v_evidence
        FROM video_aggregates_cache vac
        WHERE vac.channel_id = v_subject_id;

    ELSIF v_appeal_type = 'user' THEN
        -- Get user trust details
        SELECT json_build_object(
            'extension_id', et.extension_id,
            'trust_score', et.trust_score,
            'total_reports', et.total_reports,
            'accuracy_rate', et.accuracy_rate,
            'is_flagged', et.is_flagged,
            'flagged_reason', et.flagged_reason,
            'user_number', et.user_number
        ) INTO v_evidence
        FROM extension_trust et
        WHERE et.extension_id = v_subject_id;
    END IF;

    -- Return appeal with notes and evidence
    RETURN QUERY
    SELECT
        a.id::BIGINT AS appeal_id,
        a.appeal_type::VARCHAR AS appeal_type,
        a.subject_id::VARCHAR AS subject_id,
        a.submitter_email::VARCHAR AS submitter_email,
        a.reasoning AS reasoning,
        a.status::VARCHAR AS status,
        a.assigned_to::VARCHAR AS assigned_to,
        a.submitted_at AS submitted_at,
        a.resolved_at AS resolved_at,
        a.resolution_action AS resolution_action,
        COALESCE(
            (SELECT json_agg(
                json_build_object(
                    'note_id', an.id,
                    'admin_id', an.admin_id,
                    'note_text', an.note_text,
                    'created_at', an.created_at
                ) ORDER BY an.created_at DESC
            )
            FROM appeal_notes an
            WHERE an.appeal_id = p_appeal_id),
            '[]'::JSON
        )::JSON AS notes,
        COALESCE(v_evidence, '{}'::JSON) AS evidence
    FROM appeals a
    WHERE a.id = p_appeal_id;
END;
$$;

COMMENT ON FUNCTION get_appeal_detail IS 'Returns comprehensive appeal with notes and auto-fetched evidence (video/channel/user data)';

-- =====================================================
-- 3. UPDATE_APPEAL_STATUS
-- Updates appeal status and optionally assigns admin
-- =====================================================

DROP FUNCTION IF EXISTS update_appeal_status(BIGINT, VARCHAR, VARCHAR, VARCHAR);

CREATE FUNCTION update_appeal_status(
    p_appeal_id BIGINT,
    p_status VARCHAR,
    p_admin_id VARCHAR DEFAULT NULL,
    p_resolution_action TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate status
    IF p_status NOT IN ('pending', 'under_review', 'resolved', 'rejected') THEN
        RETURN QUERY SELECT false, 'Invalid status value';
        RETURN;
    END IF;

    -- Update appeal
    UPDATE appeals
    SET
        status = p_status,
        assigned_to = COALESCE(p_admin_id, assigned_to),
        resolved_at = CASE WHEN p_status IN ('resolved', 'rejected') THEN NOW() ELSE resolved_at END,
        resolution_action = COALESCE(p_resolution_action, resolution_action)
    WHERE id = p_appeal_id;

    -- Log admin action if admin ID provided
    IF p_admin_id IS NOT NULL THEN
        INSERT INTO admin_actions (admin_id, action_type, subject_type, subject_id, reason)
        VALUES (p_admin_id, 'resolve_appeal', 'appeal', p_appeal_id::VARCHAR, p_resolution_action);
    END IF;

    RETURN QUERY SELECT true, 'Appeal status updated successfully';
END;
$$;

COMMENT ON FUNCTION update_appeal_status IS 'Updates appeal status with admin assignment and resolution tracking';

-- =====================================================
-- 4. ADD_APPEAL_NOTE
-- Adds internal admin note to appeal
-- =====================================================

DROP FUNCTION IF EXISTS add_appeal_note(BIGINT, VARCHAR, TEXT);

CREATE FUNCTION add_appeal_note(
    p_appeal_id BIGINT,
    p_admin_id VARCHAR,
    p_note_text TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    note_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_note_id BIGINT;
BEGIN
    -- Insert note
    INSERT INTO appeal_notes (appeal_id, admin_id, note_text)
    VALUES (p_appeal_id, p_admin_id, p_note_text)
    RETURNING id INTO v_note_id;

    RETURN QUERY SELECT true, 'Note added successfully', v_note_id;
END;
$$;

COMMENT ON FUNCTION add_appeal_note IS 'Adds internal admin note to appeal';

-- =====================================================
-- 5. GET_APPEALS_COUNT
-- Returns total count of appeals (for pagination)
-- =====================================================

DROP FUNCTION IF EXISTS get_appeals_count(VARCHAR);

CREATE FUNCTION get_appeals_count(p_status VARCHAR DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*)::INT INTO v_count
    FROM appeals
    WHERE (p_status IS NULL OR status = p_status);

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION get_appeals_count IS 'Returns total count of appeals with optional status filter';

-- =====================================================
-- 6. RESOLVE_APPEAL_WITH_ACTION
-- Comprehensive function to resolve appeal + take action
-- =====================================================

DROP FUNCTION IF EXISTS resolve_appeal_with_action(BIGINT, VARCHAR, VARCHAR, TEXT, JSONB);

CREATE FUNCTION resolve_appeal_with_action(
    p_appeal_id BIGINT,
    p_admin_id VARCHAR,
    p_resolution VARCHAR,           -- 'grant' or 'deny'
    p_resolution_action TEXT,        -- Human-readable description
    p_action_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_appeal_type VARCHAR;
    v_subject_id VARCHAR;
    v_final_status VARCHAR;
BEGIN
    -- Get appeal details
    SELECT appeal_type, subject_id
    INTO v_appeal_type, v_subject_id
    FROM appeals
    WHERE id = p_appeal_id;

    IF v_appeal_type IS NULL THEN
        RETURN QUERY SELECT false, 'Appeal not found';
        RETURN;
    END IF;

    -- Determine final status
    v_final_status := CASE WHEN p_resolution = 'grant' THEN 'resolved' ELSE 'rejected' END;

    -- Update appeal status
    UPDATE appeals
    SET
        status = v_final_status,
        resolved_at = NOW(),
        resolution_action = p_resolution_action
    WHERE id = p_appeal_id;

    -- Log admin action
    INSERT INTO admin_actions (admin_id, action_type, subject_type, subject_id, reason, metadata)
    VALUES (p_admin_id, 'resolve_appeal', 'appeal', p_appeal_id::VARCHAR, p_resolution_action, p_action_metadata);

    RETURN QUERY SELECT true, 'Appeal resolved successfully';
END;
$$;

COMMENT ON FUNCTION resolve_appeal_with_action IS 'Resolves appeal (grant/deny) and logs admin action with metadata';

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Phase 3.5 Appeals Functions Applied';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Functions created:';
    RAISE NOTICE '  ✓ get_appeals_list';
    RAISE NOTICE '  ✓ get_appeal_detail';
    RAISE NOTICE '  ✓ update_appeal_status';
    RAISE NOTICE '  ✓ add_appeal_note';
    RAISE NOTICE '  ✓ get_appeals_count';
    RAISE NOTICE '  ✓ resolve_appeal_with_action';
    RAISE NOTICE '';
    RAISE NOTICE '🎉 Run this file in Supabase SQL Editor!';
    RAISE NOTICE '';
END $$;
