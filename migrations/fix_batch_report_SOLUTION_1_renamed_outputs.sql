-- SOLUTION 1: Rename RETURNS TABLE columns to avoid conflicts
-- This renames output columns to prevent scope conflicts with database columns

CREATE OR REPLACE FUNCTION batch_report_videos(
    p_reports JSONB
)
RETURNS TABLE(
    out_video_id VARCHAR(20),
    out_success BOOLEAN,
    out_effective_trust_points DECIMAL(10,2),
    out_is_marked BOOLEAN,
    out_error_message TEXT
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
        v_video_id := v_report->>'video_id';
        v_channel_id := v_report->>'channel_id';
        v_extension_id := v_report->>'extension_id';

        BEGIN
            -- Ensure trust record exists
            PERFORM ensure_trust_record(v_extension_id);
            v_trust_score := calculate_trust_score(v_extension_id);

            -- Check if report already exists
            SELECT EXISTS(
                SELECT 1 FROM reports r
                WHERE r.video_id = v_video_id
                AND r.extension_id = v_extension_id
            ) INTO v_report_exists;

            IF v_report_exists THEN
                -- Fetch stats into variables to avoid column ambiguity
                SELECT
                    COALESCE(vac.effective_trust_points, 0.0),
                    COALESCE(vac.is_marked, FALSE)
                INTO v_effective_trust, v_is_marked
                FROM video_aggregates_cache vac
                WHERE vac.video_id = v_video_id;

                -- Return using variables, not direct SELECT
                out_video_id := v_video_id;
                out_success := FALSE;
                out_effective_trust_points := v_effective_trust;
                out_is_marked := v_is_marked;
                out_error_message := 'Report already exists';
                RETURN NEXT;
                CONTINUE;
            END IF;

            -- Insert video record
            INSERT INTO videos (video_id, channel_id, report_count)
            VALUES (v_video_id, v_channel_id, 0)
            ON CONFLICT (video_id) DO NOTHING;

            -- Insert report
            INSERT INTO reports (video_id, extension_id, trust_weight, accuracy_status)
            VALUES (v_video_id, v_extension_id, v_trust_score, 'pending');

            -- Update trust metrics
            UPDATE extension_trust
            SET total_reports = total_reports + 1,
                pending_reports = pending_reports + 1,
                last_active = NOW(),
                updated_at = NOW()
            WHERE extension_id = v_extension_id;

            -- Refresh materialized view
            REFRESH MATERIALIZED VIEW CONCURRENTLY video_aggregates_cache;

            -- Fetch updated stats into variables
            SELECT
                COALESCE(vac.effective_trust_points, 0.0),
                COALESCE(vac.is_marked, FALSE)
            INTO v_effective_trust, v_is_marked
            FROM video_aggregates_cache vac
            WHERE vac.video_id = v_video_id;

            -- Return success using variables
            out_video_id := v_video_id;
            out_success := TRUE;
            out_effective_trust_points := v_effective_trust;
            out_is_marked := v_is_marked;
            out_error_message := NULL;
            RETURN NEXT;

        EXCEPTION WHEN OTHERS THEN
            -- Return error using variables
            out_video_id := v_video_id;
            out_success := FALSE;
            out_effective_trust_points := 0.0;
            out_is_marked := FALSE;
            out_error_message := SQLERRM;
            RETURN NEXT;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION batch_report_videos(JSONB) TO authenticated, anon;
