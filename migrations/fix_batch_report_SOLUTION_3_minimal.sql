-- SOLUTION 3: Minimal version - just success/failure, no computed stats
-- This is the nuclear option - simplest possible implementation

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
                -- Return duplicate report error with default values
                video_id := v_video_id;
                success := FALSE;
                effective_trust_points := 0.0;
                is_marked := FALSE;
                error_message := 'Report already exists';
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

            -- Return success with default values (we'll fetch stats separately later)
            video_id := v_video_id;
            success := TRUE;
            effective_trust_points := 0.0;  -- Will be computed later by client
            is_marked := FALSE;              -- Will be computed later by client
            error_message := NULL;
            RETURN NEXT;

        EXCEPTION WHEN OTHERS THEN
            -- Return error
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
