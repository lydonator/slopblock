-- SOLUTION 4: Fully qualified column references and no direct RETURN QUERY SELECT
-- This explicitly assigns to output columns using INTO, avoiding all ambiguity

CREATE OR REPLACE FUNCTION batch_report_videos(
    p_reports JSONB
)
RETURNS TABLE(
    video_id VARCHAR(20),
    success BOOLEAN,
    effective_trust_points DECIMAL(10,2),
    is_marked BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_report JSONB;
    v_video_id VARCHAR(20);
    v_channel_id VARCHAR(30);
    v_extension_id VARCHAR(100);
    v_trust_score DECIMAL(3,2);
    v_report_exists BOOLEAN;
    v_effective_trust DECIMAL(10,2);
    v_is_marked BOOLEAN;
BEGIN
    FOR v_report IN SELECT * FROM jsonb_array_elements(p_reports)
    LOOP
        -- Extract report data
        v_video_id := v_report->>'video_id';
        v_channel_id := v_report->>'channel_id';
        v_extension_id := v_report->>'extension_id';

        BEGIN
            -- Ensure trust record exists
            PERFORM ensure_trust_record(v_extension_id);
            v_trust_score := calculate_trust_score(v_extension_id);

            -- Check if report already exists using fully qualified columns
            SELECT EXISTS(
                SELECT 1
                FROM reports r
                WHERE r.video_id = v_video_id
                  AND r.extension_id = v_extension_id
            ) INTO v_report_exists;

            IF v_report_exists THEN
                -- Get video stats from cache using fully qualified columns
                SELECT
                    COALESCE(vac.effective_trust_points, 0.0),
                    COALESCE(vac.is_marked, FALSE)
                INTO
                    v_effective_trust,
                    v_is_marked
                FROM video_aggregates_cache vac
                WHERE vac.video_id = v_video_id;

                -- Assign to output columns explicitly
                video_id := v_video_id;
                success := FALSE;
                effective_trust_points := COALESCE(v_effective_trust, 0.0);
                is_marked := COALESCE(v_is_marked, FALSE);
                error_message := 'Report already exists';
                RETURN NEXT;
                CONTINUE;
            END IF;

            -- Insert video record if it doesn't exist
            INSERT INTO videos (video_id, channel_id, report_count)
            VALUES (v_video_id, v_channel_id, 0)
            ON CONFLICT (video_id) DO NOTHING;

            -- Insert the report
            INSERT INTO reports (video_id, extension_id, trust_weight, accuracy_status)
            VALUES (v_video_id, v_extension_id, v_trust_score, 'pending');

            -- Update trust metrics
            UPDATE extension_trust
            SET
                total_reports = total_reports + 1,
                pending_reports = pending_reports + 1,
                last_active = NOW(),
                updated_at = NOW()
            WHERE extension_id = v_extension_id;

            -- Refresh the materialized view
            REFRESH MATERIALIZED VIEW CONCURRENTLY video_aggregates_cache;

            -- Get updated stats from cache using fully qualified columns
            SELECT
                COALESCE(vac.effective_trust_points, 0.0),
                COALESCE(vac.is_marked, FALSE)
            INTO
                v_effective_trust,
                v_is_marked
            FROM video_aggregates_cache vac
            WHERE vac.video_id = v_video_id;

            -- Assign to output columns explicitly
            video_id := v_video_id;
            success := TRUE;
            effective_trust_points := COALESCE(v_effective_trust, 0.0);
            is_marked := COALESCE(v_is_marked, FALSE);
            error_message := NULL;
            RETURN NEXT;

        EXCEPTION WHEN OTHERS THEN
            -- Assign error to output columns explicitly
            video_id := v_video_id;
            success := FALSE;
            effective_trust_points := 0.0;
            is_marked := FALSE;
            error_message := SQLERRM;
            RETURN NEXT;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION batch_report_videos(JSONB) TO authenticated, anon;

-- Test query to verify function works
-- Uncomment and replace test data with your actual extension_id:
-- SELECT * FROM batch_report_videos('[
--   {"video_id": "test123", "channel_id": "UC123", "extension_id": "your-extension-id"}
-- ]'::JSONB);
