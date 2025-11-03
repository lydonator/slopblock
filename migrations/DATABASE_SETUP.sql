-- SlopBlock Database Schema
-- Run this script in your Supabase SQL Editor to set up the database

-- ============================================================================
-- TABLE: videos
-- Stores information about videos that have been reported
-- ============================================================================

CREATE TABLE IF NOT EXISTS videos (
    video_id VARCHAR(20) PRIMARY KEY,
    channel_id VARCHAR(30),
    report_count INTEGER DEFAULT 0,
    first_reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE videos IS 'Stores videos that have been reported as AI slop';
COMMENT ON COLUMN videos.video_id IS 'YouTube video ID (e.g., dQw4w9WgXcQ)';
COMMENT ON COLUMN videos.channel_id IS 'YouTube channel ID that uploaded the video';
COMMENT ON COLUMN videos.report_count IS 'Cached count of unique reports for performance';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_videos_report_count ON videos(report_count);
CREATE INDEX IF NOT EXISTS idx_videos_channel_id ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_last_reported ON videos(last_reported_at);

-- ============================================================================
-- TABLE: reports
-- Stores individual reports from users (extension IDs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reports (
    id BIGSERIAL PRIMARY KEY,
    video_id VARCHAR(20) NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    extension_id VARCHAR(100) NOT NULL,
    reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Prevent duplicate reports from same extension
    CONSTRAINT unique_report UNIQUE(video_id, extension_id)
);

COMMENT ON TABLE reports IS 'Individual reports from users (one per extension per video)';
COMMENT ON COLUMN reports.extension_id IS 'Chrome extension unique installation ID';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_video_id ON reports(video_id);
CREATE INDEX IF NOT EXISTS idx_reports_extension_id ON reports(extension_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_at ON reports(reported_at);

-- ============================================================================
-- FUNCTION: report_video
-- Reports a video as AI slop (or increments count if already reported)
-- ============================================================================

CREATE OR REPLACE FUNCTION report_video(
    p_video_id VARCHAR(20),
    p_channel_id VARCHAR(30),
    p_extension_id VARCHAR(100)
)
RETURNS JSON AS $$
DECLARE
    v_report_count INTEGER;
    v_is_new_report BOOLEAN;
BEGIN
    -- Insert or update video record
    INSERT INTO videos (video_id, channel_id, first_reported_at, last_reported_at)
    VALUES (p_video_id, p_channel_id, NOW(), NOW())
    ON CONFLICT (video_id) DO UPDATE SET
        last_reported_at = NOW(),
        channel_id = COALESCE(videos.channel_id, p_channel_id);

    -- Insert report (will fail silently if duplicate due to UNIQUE constraint)
    INSERT INTO reports (video_id, extension_id, reported_at)
    VALUES (p_video_id, p_extension_id, NOW())
    ON CONFLICT (video_id, extension_id) DO NOTHING
    RETURNING id INTO v_is_new_report;

    -- Update cached count in videos table
    UPDATE videos
    SET
        report_count = (SELECT COUNT(*) FROM reports WHERE video_id = p_video_id),
        updated_at = NOW()
    WHERE video_id = p_video_id
    RETURNING report_count INTO v_report_count;

    RETURN json_build_object(
        'success', true,
        'video_id', p_video_id,
        'report_count', v_report_count,
        'is_new_report', (v_is_new_report IS NOT NULL)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION report_video IS 'Report a video as AI slop. Idempotent - returns success even if already reported.';

-- ============================================================================
-- FUNCTION: remove_report
-- Removes a user's report (undo functionality)
-- ============================================================================

CREATE OR REPLACE FUNCTION remove_report(
    p_video_id VARCHAR(20),
    p_extension_id VARCHAR(100)
)
RETURNS JSON AS $$
DECLARE
    v_report_count INTEGER;
    v_deleted_count INTEGER;
BEGIN
    -- Delete the report
    DELETE FROM reports
    WHERE video_id = p_video_id AND extension_id = p_extension_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count > 0 THEN
        -- Update cached count in videos table
        UPDATE videos
        SET
            report_count = (SELECT COUNT(*) FROM reports WHERE video_id = p_video_id),
            updated_at = NOW()
        WHERE video_id = p_video_id
        RETURNING report_count INTO v_report_count;

        -- If no reports left, optionally delete the video record
        -- (Commented out - keeping video records for historical data)
        -- DELETE FROM videos WHERE video_id = p_video_id AND report_count = 0;

        RETURN json_build_object(
            'success', true,
            'video_id', p_video_id,
            'report_count', COALESCE(v_report_count, 0)
        );
    ELSE
        RETURN json_build_object(
            'success', false,
            'error', 'Report not found'
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION remove_report IS 'Remove a user''s report for a video (undo functionality)';

-- ============================================================================
-- FUNCTION: get_marked_videos
-- Bulk fetch videos that meet the threshold (3+ reports)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_marked_videos(p_video_ids VARCHAR(20)[])
RETURNS TABLE(
    video_id VARCHAR(20),
    report_count INTEGER,
    channel_id VARCHAR(30)
) AS $$
BEGIN
    RETURN QUERY
    SELECT v.video_id, v.report_count, v.channel_id
    FROM videos v
    WHERE v.video_id = ANY(p_video_ids)
      AND v.report_count >= 3
    ORDER BY v.report_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_marked_videos IS 'Bulk fetch videos that meet the slop threshold (3+ reports)';

-- ============================================================================
-- FUNCTION: get_channel_stats
-- Get statistics about a channel's reported videos
-- ============================================================================

CREATE OR REPLACE FUNCTION get_channel_stats(p_channel_id VARCHAR(30))
RETURNS JSON AS $$
DECLARE
    v_marked_count INTEGER;
    v_total_reports INTEGER;
BEGIN
    SELECT
        COUNT(*),
        COALESCE(SUM(report_count), 0)
    INTO v_marked_count, v_total_reports
    FROM videos
    WHERE channel_id = p_channel_id
      AND report_count >= 3;

    RETURN json_build_object(
        'channel_id', p_channel_id,
        'marked_video_count', v_marked_count,
        'total_reports', v_total_reports
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_channel_stats IS 'Get statistics about a channel''s reported videos';

-- ============================================================================
-- FUNCTION: check_user_report
-- Check if a specific extension has reported a video
-- ============================================================================

CREATE OR REPLACE FUNCTION check_user_report(
    p_video_id VARCHAR(20),
    p_extension_id VARCHAR(100)
)
RETURNS JSON AS $$
DECLARE
    v_has_reported BOOLEAN;
    v_report_count INTEGER;
BEGIN
    -- Check if report exists
    SELECT EXISTS(
        SELECT 1 FROM reports
        WHERE video_id = p_video_id
        AND extension_id = p_extension_id
    ) INTO v_has_reported;

    -- Get total report count
    SELECT report_count INTO v_report_count
    FROM videos
    WHERE video_id = p_video_id;

    RETURN json_build_object(
        'video_id', p_video_id,
        'has_reported', v_has_reported,
        'report_count', COALESCE(v_report_count, 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_user_report IS 'Check if a user has reported a video and get report count';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Allow anonymous read access but all writes go through functions
-- ============================================================================

-- Enable RLS on tables
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Allow public read access to videos (aggregate data)
DROP POLICY IF EXISTS "Allow public read access to videos" ON videos;
CREATE POLICY "Allow public read access to videos"
ON videos FOR SELECT
TO anon
USING (true);

-- Allow public read to reports for transparency
-- Note: extension_id is visible but doesn't contain PII
DROP POLICY IF EXISTS "Allow public read access to reports" ON reports;
CREATE POLICY "Allow public read access to reports"
ON reports FOR SELECT
TO anon
USING (true);

-- All INSERT/UPDATE/DELETE operations must go through SECURITY DEFINER functions
-- No direct write policies for anon users

-- ============================================================================
-- OPTIONAL: Materialized View for Channel Statistics
-- Uncomment if performance optimization is needed for channel stats
-- ============================================================================

/*
CREATE MATERIALIZED VIEW IF NOT EXISTS channel_stats AS
SELECT
    channel_id,
    COUNT(DISTINCT video_id) as marked_video_count,
    SUM(report_count) as total_reports,
    MAX(last_reported_at) as last_report_date
FROM videos
WHERE report_count >= 3 AND channel_id IS NOT NULL
GROUP BY channel_id;

CREATE INDEX IF NOT EXISTS idx_channel_stats_channel_id ON channel_stats(channel_id);

COMMENT ON MATERIALIZED VIEW channel_stats IS 'Cached channel statistics for performance. Refresh periodically.';

-- To refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY channel_stats;
*/

-- ============================================================================
-- TEST DATA (Optional - for development/testing)
-- Uncomment to add sample data
-- ============================================================================

/*
-- Insert test videos
INSERT INTO videos (video_id, channel_id, report_count, first_reported_at)
VALUES
    ('test_video_1', 'test_channel_1', 5, NOW() - INTERVAL '2 days'),
    ('test_video_2', 'test_channel_1', 3, NOW() - INTERVAL '1 day'),
    ('test_video_3', 'test_channel_2', 10, NOW() - INTERVAL '5 days')
ON CONFLICT (video_id) DO NOTHING;

-- Insert test reports
INSERT INTO reports (video_id, extension_id, reported_at)
VALUES
    ('test_video_1', 'ext_test_1', NOW() - INTERVAL '2 days'),
    ('test_video_1', 'ext_test_2', NOW() - INTERVAL '2 days'),
    ('test_video_1', 'ext_test_3', NOW() - INTERVAL '1 day'),
    ('test_video_1', 'ext_test_4', NOW() - INTERVAL '1 day'),
    ('test_video_1', 'ext_test_5', NOW()),
    ('test_video_2', 'ext_test_1', NOW() - INTERVAL '1 day'),
    ('test_video_2', 'ext_test_2', NOW() - INTERVAL '1 day'),
    ('test_video_2', 'ext_test_3', NOW())
ON CONFLICT (video_id, extension_id) DO NOTHING;
*/

-- ============================================================================
-- VERIFICATION QUERIES
-- Run these to verify setup worked correctly
-- ============================================================================

-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('videos', 'reports');

-- Check functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('report_video', 'remove_report', 'get_marked_videos', 'get_channel_stats', 'check_user_report');

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('videos', 'reports');

-- Test report_video function
-- SELECT report_video('test123', 'channel456', 'extension789');

-- Test get_marked_videos function
-- SELECT * FROM get_marked_videos(ARRAY['test123', 'test456']::VARCHAR[]);

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

-- Your database is now ready for SlopBlock!
-- Next steps:
-- 1. Copy your Supabase URL and anon key from project settings
-- 2. Add them to your extension's .env file
-- 3. Test API calls from your extension
