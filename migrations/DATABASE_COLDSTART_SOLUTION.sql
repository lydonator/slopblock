-- =====================================================
-- COLD-START SOLUTION: DYNAMIC THRESHOLD + PIONEER BOOST
-- =====================================================
-- Solves the launch problem where all users have low trust (0.30x)
-- preventing videos from reaching the 2.5 effective trust point threshold.
--
-- TWO-PART SOLUTION:
-- 1. DYNAMIC THRESHOLD: Auto-adjusts based on community maturity
--    Formula: threshold = 2.5 × (avg_trust / 0.75)
--    Week 1: ~1.0 points, Mature: 2.5 points
--
-- 2. PIONEER BOOST: Rewards early adopters with permanent trust bonus
--    First 500 users:      +0.40 boost
--    Users 501-1000:       +0.30 boost
--    Users 1001-2000:      +0.20 boost
--    Users 2001+:          +0.00 boost (normal)
--
-- This creates a self-correcting system that:
-- - Starts permissive (low threshold, high pioneer boosts)
-- - Becomes stricter as community matures
-- - Never locks (continues adjusting forever)
-- - Prevents both cold-start AND brigading

-- =====================================================
-- 1. COMMUNITY STATS TABLE
-- =====================================================
-- Tracks global community maturity and calculates dynamic threshold

CREATE TABLE IF NOT EXISTS community_stats (
    id INTEGER PRIMARY KEY DEFAULT 1,
    total_users INTEGER DEFAULT 0,
    active_users_30d INTEGER DEFAULT 0,
    avg_trust_weight DECIMAL(4,3) DEFAULT 0.300,
    maturity_factor DECIMAL(3,2) DEFAULT 0.40,
    effective_threshold DECIMAL(4,2) DEFAULT 1.00,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Insert initial row
INSERT INTO community_stats (id, total_users, avg_trust_weight, effective_threshold)
VALUES (1, 0, 0.300, 1.00)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_community_stats_last_updated ON community_stats(last_updated);

COMMENT ON TABLE community_stats IS 'Global community maturity metrics for dynamic threshold calculation';
COMMENT ON COLUMN community_stats.total_users IS 'Total unique extension installations (all time)';
COMMENT ON COLUMN community_stats.active_users_30d IS 'Users who reported in last 30 days';
COMMENT ON COLUMN community_stats.avg_trust_weight IS 'Average trust weight of active users (updated daily)';
COMMENT ON COLUMN community_stats.maturity_factor IS 'Normalized maturity: avg_trust / 0.75 (target)';
COMMENT ON COLUMN community_stats.effective_threshold IS 'Current threshold for marking videos (formula: 2.5 × maturity_factor)';

-- =====================================================
-- 2. ADD PIONEER BOOST COLUMN
-- =====================================================
-- Permanent trust bonus for early adopters

ALTER TABLE extension_trust
ADD COLUMN IF NOT EXISTS pioneer_boost DECIMAL(3,2) DEFAULT 0.00 CHECK (pioneer_boost >= 0.00 AND pioneer_boost <= 0.50),
ADD COLUMN IF NOT EXISTS user_number INTEGER;

COMMENT ON COLUMN extension_trust.pioneer_boost IS 'Permanent trust bonus for early adopters (0.40/0.30/0.20/0.00 based on join order)';
COMMENT ON COLUMN extension_trust.user_number IS 'User registration sequence number (1st user, 2nd user, etc.)';

CREATE INDEX IF NOT EXISTS idx_extension_trust_user_number ON extension_trust(user_number);

-- =====================================================
-- 3. ASSIGN USER NUMBERS TO EXISTING USERS
-- =====================================================
-- Backfill user_number for existing extensions based on first_seen

DO $$
DECLARE
    v_extension_record RECORD;
    v_user_num INTEGER := 1;
BEGIN
    -- Assign user numbers in order of first_seen
    FOR v_extension_record IN
        SELECT extension_id
        FROM extension_trust
        ORDER BY first_seen ASC
    LOOP
        UPDATE extension_trust
        SET user_number = v_user_num,
            pioneer_boost = CASE
                WHEN v_user_num <= 500 THEN 0.40
                WHEN v_user_num <= 1000 THEN 0.30
                WHEN v_user_num <= 2000 THEN 0.20
                ELSE 0.00
            END,
            updated_at = NOW()
        WHERE extension_id = v_extension_record.extension_id;

        v_user_num := v_user_num + 1;
    END LOOP;

    -- Update community stats with current total
    UPDATE community_stats
    SET total_users = v_user_num - 1,
        last_updated = NOW()
    WHERE id = 1;

    RAISE NOTICE 'Assigned user numbers to % existing users', v_user_num - 1;
END $$;

-- =====================================================
-- 4. UPDATE ENSURE_TRUST_RECORD TO ASSIGN PIONEER BOOST
-- =====================================================
-- Modified to assign user_number and pioneer_boost on first registration

CREATE OR REPLACE FUNCTION ensure_trust_record(p_extension_id VARCHAR(100))
RETURNS VOID AS $$
DECLARE
    v_user_number INTEGER;
    v_pioneer_boost DECIMAL(3,2);
BEGIN
    -- Check if record exists
    IF EXISTS (SELECT 1 FROM extension_trust WHERE extension_id = p_extension_id) THEN
        -- Update last_active only
        UPDATE extension_trust
        SET last_active = NOW(),
            updated_at = NOW()
        WHERE extension_id = p_extension_id;
    ELSE
        -- New user: assign user number and pioneer boost
        SELECT COALESCE(MAX(user_number), 0) + 1
        INTO v_user_number
        FROM extension_trust;

        -- Calculate pioneer boost based on user number
        v_pioneer_boost := CASE
            WHEN v_user_number <= 500 THEN 0.40
            WHEN v_user_number <= 1000 THEN 0.30
            WHEN v_user_number <= 2000 THEN 0.20
            ELSE 0.00
        END;

        -- Insert new record
        INSERT INTO extension_trust (
            extension_id,
            first_seen,
            last_active,
            user_number,
            pioneer_boost,
            trust_score
        )
        VALUES (
            p_extension_id,
            NOW(),
            NOW(),
            v_user_number,
            v_pioneer_boost,
            0.30 + v_pioneer_boost -- Initial trust score includes pioneer boost
        );

        -- Update community stats
        UPDATE community_stats
        SET total_users = v_user_number,
            last_updated = NOW()
        WHERE id = 1;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION ensure_trust_record IS 'Creates trust record with user_number and pioneer_boost (Phase 3 Cold-Start)';

-- =====================================================
-- 5. UPDATE CALCULATE_TRUST_SCORE TO INCLUDE PIONEER BOOST
-- =====================================================
-- Modified hybrid formula: (time_factor * 0.5 + accuracy_factor * 0.5) + pioneer_boost

CREATE OR REPLACE FUNCTION calculate_trust_score(p_extension_id VARCHAR(100))
RETURNS DECIMAL(3,2) AS $$
DECLARE
    v_first_seen TIMESTAMP;
    v_days_active INTEGER;
    v_time_factor DECIMAL(3,2);
    v_accuracy_factor DECIMAL(3,2);
    v_base_trust DECIMAL(3,2);
    v_pioneer_boost DECIMAL(3,2);
    v_final_trust DECIMAL(3,2);
    v_is_flagged BOOLEAN;
    v_total_evaluated INTEGER;
BEGIN
    -- Get extension data
    SELECT
        first_seen,
        is_flagged,
        pioneer_boost,
        accurate_reports + inaccurate_reports
    INTO v_first_seen, v_is_flagged, v_pioneer_boost, v_total_evaluated
    FROM extension_trust
    WHERE extension_id = p_extension_id;

    -- If not found, this is a new extension (shouldn't happen after ensure_trust_record)
    IF v_first_seen IS NULL THEN
        RETURN 0.30;
    END IF;

    -- If flagged, return minimum trust (pioneer boost doesn't help)
    IF v_is_flagged = TRUE THEN
        RETURN 0.00;
    END IF;

    -- Calculate TIME FACTOR (0.3 to 1.0 over 30 days)
    v_days_active := EXTRACT(DAY FROM (NOW() - v_first_seen));
    IF v_days_active >= 30 THEN
        v_time_factor := 1.00;
    ELSE
        v_time_factor := 0.30 + (0.70 * (v_days_active::DECIMAL / 30.0));
    END IF;

    -- Calculate ACCURACY FACTOR (0.3 to 1.0 based on report accuracy)
    v_accuracy_factor := calculate_accuracy_rate(p_extension_id);

    -- BASE TRUST SCORE: 50% time, 50% accuracy
    -- Early users (< 5 evaluated reports): weighted more toward time
    IF v_total_evaluated < 5 THEN
        -- 80% time, 20% accuracy until we have enough data
        v_base_trust := (v_time_factor * 0.80) + (v_accuracy_factor * 0.20);
    ELSE
        -- 50/50 split once we have sufficient data
        v_base_trust := (v_time_factor * 0.50) + (v_accuracy_factor * 0.50);
    END IF;

    -- ADD PIONEER BOOST (permanent bonus for early adopters)
    v_final_trust := v_base_trust + v_pioneer_boost;

    -- Clamp to valid range (max 1.00, min 0.30 base but can go lower with 0 pioneer boost)
    IF v_final_trust > 1.00 THEN
        v_final_trust := 1.00;
    ELSIF v_final_trust < 0.30 THEN
        v_final_trust := 0.30;
    END IF;

    RETURN ROUND(v_final_trust, 2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_trust_score IS 'Hybrid trust score with pioneer boost: (time * 0.5 + accuracy * 0.5) + pioneer_boost';

-- =====================================================
-- 6. UPDATE COMMUNITY MATURITY FUNCTION (DAILY CRON)
-- =====================================================
-- Calculates average trust weight and updates effective threshold

CREATE OR REPLACE FUNCTION update_community_maturity()
RETURNS TABLE(
    total_users INTEGER,
    active_users INTEGER,
    avg_trust DECIMAL(4,3),
    maturity DECIMAL(3,2),
    threshold DECIMAL(4,2)
) AS $$
DECLARE
    v_total_users INTEGER;
    v_active_users INTEGER;
    v_avg_trust DECIMAL(4,3);
    v_maturity_factor DECIMAL(3,2);
    v_effective_threshold DECIMAL(4,2);
BEGIN
    -- Count total users
    SELECT COUNT(*) INTO v_total_users
    FROM extension_trust;

    -- Count active users (reported in last 30 days)
    SELECT COUNT(DISTINCT extension_id) INTO v_active_users
    FROM reports
    WHERE reported_at >= NOW() - INTERVAL '30 days';

    -- Calculate average trust weight of active users
    -- If no active users, use global average
    IF v_active_users > 0 THEN
        SELECT AVG(trust_score) INTO v_avg_trust
        FROM extension_trust
        WHERE extension_id IN (
            SELECT DISTINCT extension_id
            FROM reports
            WHERE reported_at >= NOW() - INTERVAL '30 days'
        );
    ELSE
        -- Fallback: use average of all users
        SELECT AVG(trust_score) INTO v_avg_trust
        FROM extension_trust;
    END IF;

    -- Ensure avg_trust is not null
    v_avg_trust := COALESCE(v_avg_trust, 0.30);

    -- Calculate maturity factor (normalized to 0.75 target)
    -- 0.30 avg trust → 0.40 maturity
    -- 0.75 avg trust → 1.00 maturity
    v_maturity_factor := v_avg_trust / 0.75;

    -- Clamp maturity factor
    IF v_maturity_factor < 0.40 THEN
        v_maturity_factor := 0.40; -- Minimum 40% maturity
    ELSIF v_maturity_factor > 1.00 THEN
        v_maturity_factor := 1.00; -- Maximum 100% maturity
    END IF;

    -- Calculate effective threshold
    -- Formula: 2.5 × maturity_factor
    -- Week 1 (0.40 maturity): 1.0 points
    -- Mature (1.00 maturity): 2.5 points
    v_effective_threshold := 2.5 * v_maturity_factor;

    -- Update community_stats table
    UPDATE community_stats
    SET total_users = v_total_users,
        active_users_30d = v_active_users,
        avg_trust_weight = v_avg_trust,
        maturity_factor = v_maturity_factor,
        effective_threshold = v_effective_threshold,
        last_updated = NOW()
    WHERE id = 1;

    -- Return results
    RETURN QUERY
    SELECT
        v_total_users,
        v_active_users,
        v_avg_trust,
        v_maturity_factor,
        v_effective_threshold;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_community_maturity IS 'Daily cron job: Calculates community maturity and updates dynamic threshold';

-- =====================================================
-- 7. UPDATE GET_MARKED_VIDEOS_WEIGHTED FOR DYNAMIC THRESHOLD
-- =====================================================
-- Modified to use dynamic threshold from community_stats

CREATE OR REPLACE FUNCTION get_marked_videos_weighted(p_video_ids VARCHAR(20)[])
RETURNS TABLE(
    video_id VARCHAR(20),
    channel_id VARCHAR(30),
    effective_trust_points DECIMAL(10,2),
    raw_report_count INTEGER,
    first_reported_at TIMESTAMP
) AS $$
DECLARE
    v_effective_threshold DECIMAL(4,2);
BEGIN
    -- Get current dynamic threshold
    SELECT effective_threshold INTO v_effective_threshold
    FROM community_stats
    WHERE id = 1;

    -- Fallback to 2.5 if community_stats not initialized
    v_effective_threshold := COALESCE(v_effective_threshold, 2.5);

    RETURN QUERY
    SELECT
        vac.video_id,
        vac.channel_id,
        vac.effective_trust_points,
        vac.raw_report_count,
        vac.first_reported_at
    FROM video_aggregates_cache vac
    WHERE vac.video_id = ANY(p_video_ids)
    AND vac.effective_trust_points >= v_effective_threshold -- DYNAMIC THRESHOLD
    ORDER BY vac.effective_trust_points DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_marked_videos_weighted IS 'Returns videos meeting DYNAMIC threshold (uses community_stats.effective_threshold)';

-- =====================================================
-- 8. UPDATE VIDEO_AGGREGATES_CACHE IS_MARKED LOGIC
-- =====================================================
-- Modify refresh_video_aggregate to use dynamic threshold

CREATE OR REPLACE FUNCTION refresh_video_aggregate(p_video_id VARCHAR(20))
RETURNS VOID AS $$
DECLARE
    v_effective_trust DECIMAL(10,2);
    v_raw_count INTEGER;
    v_channel_id VARCHAR(30);
    v_first_reported TIMESTAMP;
    v_is_marked BOOLEAN;
    v_dynamic_threshold DECIMAL(4,2);
BEGIN
    -- Get current dynamic threshold
    SELECT effective_threshold INTO v_dynamic_threshold
    FROM community_stats
    WHERE id = 1;

    -- Fallback to 2.5 if not initialized
    v_dynamic_threshold := COALESCE(v_dynamic_threshold, 2.5);

    -- Calculate effective trust points (sum of all trust weights)
    SELECT
        COALESCE(SUM(r.trust_weight), 0.0),
        COUNT(*),
        v.channel_id,
        MIN(r.reported_at)
    INTO v_effective_trust, v_raw_count, v_channel_id, v_first_reported
    FROM reports r
    JOIN videos v ON r.video_id = v.video_id
    WHERE r.video_id = p_video_id
    GROUP BY v.channel_id;

    -- Determine if marked using DYNAMIC threshold
    v_is_marked := (v_effective_trust >= v_dynamic_threshold);

    -- Update cache
    INSERT INTO video_aggregates_cache (
        video_id,
        channel_id,
        effective_trust_points,
        raw_report_count,
        is_marked,
        first_reported_at,
        last_updated_at
    )
    VALUES (
        p_video_id,
        v_channel_id,
        v_effective_trust,
        v_raw_count,
        v_is_marked,
        v_first_reported,
        NOW()
    )
    ON CONFLICT (video_id) DO UPDATE SET
        effective_trust_points = EXCLUDED.effective_trust_points,
        raw_report_count = EXCLUDED.raw_report_count,
        is_marked = EXCLUDED.is_marked,
        last_updated_at = NOW(),
        cache_version = video_aggregates_cache.cache_version + 1;

    -- Also update videos table report_count for backward compatibility
    UPDATE videos
    SET report_count = v_raw_count,
        updated_at = NOW()
    WHERE video_id = p_video_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION refresh_video_aggregate IS 'Recalculates trust-weighted aggregates with DYNAMIC threshold';

-- =====================================================
-- 9. SETUP CRON JOB FOR COMMUNITY MATURITY
-- =====================================================
-- Run update_community_maturity() every 6 hours

-- Check if pg_cron extension is enabled
DO $SETUP_CRON$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        RAISE NOTICE 'pg_cron extension not enabled. Run: CREATE EXTENSION pg_cron;';
    ELSE
        -- Schedule maturity updates every 6 hours
        PERFORM cron.schedule(
            'update-community-maturity',
            '0 */6 * * *', -- Every 6 hours
            'SELECT update_community_maturity();'
        );
        RAISE NOTICE 'Scheduled update_community_maturity() cron job (every 6 hours)';
    END IF;
END $SETUP_CRON$;

-- =====================================================
-- 10. RECALCULATE ALL EXISTING TRUST SCORES
-- =====================================================
-- Update all users with new pioneer boost formula

DO $$
DECLARE
    v_extension_id VARCHAR(100);
BEGIN
    -- Recalculate trust scores for all extensions
    FOR v_extension_id in SELECT extension_id FROM extension_trust
    LOOP
        UPDATE extension_trust
        SET trust_score = calculate_trust_score(v_extension_id),
            updated_at = NOW()
        WHERE extension_id = v_extension_id;
    END LOOP;

    -- Run initial community maturity calculation
    PERFORM update_community_maturity();

    -- Refresh all video aggregates with new dynamic threshold
    PERFORM refresh_video_aggregate(video_id)
    FROM videos;

    RAISE NOTICE 'Cold-start solution applied: Dynamic threshold + pioneer boost active';
END $$;

-- =====================================================
-- 11. ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on community_stats
ALTER TABLE community_stats ENABLE ROW LEVEL SECURITY;

-- Allow read access to everyone (transparency)
CREATE POLICY "Allow read access to community stats"
ON community_stats FOR SELECT
USING (true);

-- =====================================================
-- 12. GRANT PERMISSIONS
-- =====================================================

GRANT SELECT ON community_stats TO anon;
GRANT ALL ON community_stats TO service_role;

GRANT EXECUTE ON FUNCTION update_community_maturity TO service_role;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check community stats
-- SELECT * FROM community_stats;

-- Check pioneer boost distribution
-- SELECT
--   CASE
--     WHEN user_number <= 500 THEN 'First 500 (+0.40)'
--     WHEN user_number <= 1000 THEN '501-1000 (+0.30)'
--     WHEN user_number <= 2000 THEN '1001-2000 (+0.20)'
--     ELSE '2001+ (+0.00)'
--   END as tier,
--   COUNT(*) as user_count,
--   AVG(trust_score) as avg_trust
-- FROM extension_trust
-- GROUP BY tier
-- ORDER BY MIN(user_number);

-- Check current threshold
-- SELECT
--   total_users,
--   active_users_30d,
--   avg_trust_weight,
--   maturity_factor,
--   effective_threshold,
--   last_updated
-- FROM community_stats
-- WHERE id = 1;

-- Simulate threshold over time
-- SELECT
--   avg_trust_input,
--   (avg_trust_input / 0.75) as maturity_factor,
--   2.5 * (avg_trust_input / 0.75) as effective_threshold
-- FROM (
--   VALUES (0.30), (0.40), (0.50), (0.60), (0.70), (0.75), (0.80), (0.90), (1.00)
-- ) AS t(avg_trust_input);

-- =====================================================
-- EXPECTED BEHAVIOR
-- =====================================================

-- Week 1 Launch (all users new, avg trust ~0.30-0.40):
--   - Effective threshold: ~1.0 points
--   - First 500 users have 0.70 trust (0.30 base + 0.40 pioneer)
--   - Need 2 reports from pioneers to mark video
--
-- Month 1 (users gaining trust, avg ~0.50):
--   - Effective threshold: ~1.7 points
--   - Mix of pioneer and normal users
--   - Need 3-4 reports to mark video
--
-- Mature Community (avg trust ~0.75):
--   - Effective threshold: 2.5 points (full threshold)
--   - Most users have 0.70-1.00 trust
--   - Need 3-4 reports from trusted users
--
-- Self-Correcting:
--   - If botnet influx drops avg trust → threshold drops
--   - If quality users dominate → threshold rises
--   - Never locks, always adapts
