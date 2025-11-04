-- MARK_TEST_VIDEOS.sql
-- Manually mark test videos for delta sync testing
-- This simulates what would happen if these videos had enough community reports

-- Step 1: Update video_aggregates_cache to mark the test videos
UPDATE video_aggregates_cache
SET
    effective_trust_points = 3.0,  -- Above the 2.5 threshold
    is_marked = TRUE,               -- Explicitly mark as true
    last_updated_at = NOW()
WHERE video_id IN ('jd8vuGw_9cY', 'iqxnahcpWKI', 'O4iUBzQGfz4', 'Q8k6leBMGQc');

-- Step 2: Verify the update
SELECT
    video_id,
    channel_id,
    effective_trust_points,
    is_marked,
    raw_report_count,
    last_updated_at,
    CASE
        WHEN is_marked THEN '✅ MARKED (ready for blob)'
        ELSE '❌ Not marked'
    END as status
FROM video_aggregates_cache
WHERE video_id IN ('jd8vuGw_9cY', 'iqxnahcpWKI', 'O4iUBzQGfz4', 'Q8k6leBMGQc')
ORDER BY video_id;

-- Expected result: All 4 videos should show:
-- - effective_trust_points: 3.0
-- - is_marked: TRUE
-- - status: ✅ MARKED (ready for blob)
