-- =====================================================
-- PRODUCTION FIX: "video_id is ambiguous" Error
-- =====================================================
-- This is the clean, production-ready fix based on deep analysis
--
-- Root Cause: The JOIN in refresh_video_aggregate() creates
-- ambiguity when PostgreSQL tries to resolve column references
-- in the WHERE clause and subsequent operations.
--
-- Solution: Use explicit table aliases EVERYWHERE and avoid
-- any possibility of ambiguous column references.
-- =====================================================

CREATE OR REPLACE FUNCTION refresh_video_aggregate(p_video_id VARCHAR(20))
RETURNS VOID AS $$
DECLARE
    v_effective_trust DECIMAL(10,2);
    v_raw_count INTEGER;
    v_channel_id VARCHAR(30);
    v_first_reported TIMESTAMP;
    v_is_marked BOOLEAN;
    v_dynamic_threshold DECIMAL(4,2);
    v_current_version INTEGER;
BEGIN
    -- Get current dynamic threshold from community stats
    SELECT cs.effective_threshold INTO v_dynamic_threshold
    FROM community_stats cs
    WHERE cs.id = 1;

    v_dynamic_threshold := COALESCE(v_dynamic_threshold, 2.5);

    -- Calculate effective trust points with EXPLICIT aliases
    -- CRITICAL: Avoid any ambiguous column references
    SELECT
        COALESCE(SUM(r.trust_weight), 0.0) AS total_trust,
        COUNT(*) AS report_count,
        v.channel_id AS channel,
        MIN(r.reported_at) AS first_report
    INTO
        v_effective_trust,
        v_raw_count,
        v_channel_id,
        v_first_reported
    FROM reports r
    INNER JOIN videos v ON r.video_id = v.video_id
    WHERE r.video_id = p_video_id
    GROUP BY v.channel_id;

    -- Determine if video meets threshold
    v_is_marked := (v_effective_trust >= v_dynamic_threshold);

    -- Get current cache version BEFORE the upsert
    -- Use explicit alias to avoid ambiguity
    SELECT COALESCE(vac.cache_version, 0)
    INTO v_current_version
    FROM video_aggregates_cache vac
    WHERE vac.video_id = p_video_id;

    v_current_version := COALESCE(v_current_version, 0);

    -- Upsert into cache with NO ambiguous references
    INSERT INTO video_aggregates_cache (
        video_id,
        channel_id,
        effective_trust_points,
        raw_report_count,
        is_marked,
        first_reported_at,
        last_updated_at,
        cache_version
    )
    VALUES (
        p_video_id,
        v_channel_id,
        v_effective_trust,
        v_raw_count,
        v_is_marked,
        v_first_reported,
        NOW(),
        1
    )
    ON CONFLICT (video_id) DO UPDATE SET
        effective_trust_points = EXCLUDED.effective_trust_points,
        raw_report_count = EXCLUDED.raw_report_count,
        is_marked = EXCLUDED.is_marked,
        last_updated_at = EXCLUDED.last_updated_at,
        cache_version = v_current_version + 1;

    -- Update videos table with explicit alias
    UPDATE videos v
    SET
        report_count = v_raw_count,
        updated_at = NOW()
    WHERE v.video_id = p_video_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION refresh_video_aggregate IS 'Recalculates trust-weighted aggregates with dynamic threshold';

-- =====================================================
-- VERIFICATION: Test the function directly
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ refresh_video_aggregate UPDATED';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Changes made:';
    RAISE NOTICE '  ✓ Explicit aliases on all SELECT columns';
    RAISE NOTICE '  ✓ INNER JOIN instead of implicit JOIN';
    RAISE NOTICE '  ✓ Explicit alias in cache_version fetch';
    RAISE NOTICE '  ✓ Explicit alias in UPDATE videos';
    RAISE NOTICE '  ✓ All column references fully qualified';
    RAISE NOTICE '';
    RAISE NOTICE 'Testing function with dummy video_id...';
    RAISE NOTICE '';

    -- Test the function
    PERFORM refresh_video_aggregate('TEST_' || NOW()::TEXT);

    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Function executed without errors!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Next step: Test batch_report_videos via extension';
    RAISE NOTICE 'The trigger will now use this corrected function';
    RAISE NOTICE '';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '========================================';
    RAISE NOTICE '❌ ERROR OCCURRED:';
    RAISE NOTICE '   %', SQLERRM;
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'If error is still "video_id is ambiguous":';
    RAISE NOTICE '  → The issue is NOT in this function';
    RAISE NOTICE '  → Check for triggers on video_aggregates_cache';
    RAISE NOTICE '  → Run FIX_AMBIGUOUS_VIDEO_ID.sql for diagnostics';
    RAISE NOTICE '';
END $$;

-- =====================================================
-- ADDITIONAL SAFETY: Ensure trigger is correct
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_refresh_video_aggregate()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM refresh_video_aggregate(OLD.video_id);
        RETURN OLD;
    ELSE
        PERFORM refresh_video_aggregate(NEW.video_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_refresh_video_aggregate IS 'Trigger function to refresh video aggregates on report changes';

-- Recreate trigger (ensure it's current)
DROP TRIGGER IF EXISTS trg_reports_aggregate_refresh ON reports;

CREATE TRIGGER trg_reports_aggregate_refresh
AFTER INSERT OR UPDATE OR DELETE ON reports
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_video_aggregate();

COMMENT ON TRIGGER trg_reports_aggregate_refresh ON reports IS 'Auto-refresh video aggregate cache when reports change';

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Trigger also recreated successfully';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'READY TO TEST:';
    RAISE NOTICE '1. Go to extension';
    RAISE NOTICE '2. Click "Sync All Marked Videos"';
    RAISE NOTICE '3. Watch for batch report results';
    RAISE NOTICE '4. Check if reports succeed without "ambiguous" error';
    RAISE NOTICE '';
    RAISE NOTICE 'If error persists, run this query to check for other triggers:';
    RAISE NOTICE '';
    RAISE NOTICE 'SELECT event_object_table, trigger_name, event_manipulation';
    RAISE NOTICE 'FROM information_schema.triggers';
    RAISE NOTICE 'WHERE event_object_schema = ''public'';';
    RAISE NOTICE '';
END $$;
