-- GENERATE_BLOB_MANUAL.sql
-- Manual blob generation for testing (simulates the Edge Function)

-- This query shows you what the blob SHOULD contain
-- You'll need to manually create a JSON file with this data

SELECT json_build_object(
    'generated_at', NOW(),
    'video_count', COUNT(*),
    'videos', json_agg(
        json_build_object(
            'video_id', video_id,
            'effective_trust_points', effective_trust_points,
            'is_marked', is_marked
        )
    )
) as blob_content
FROM video_aggregates_cache
WHERE is_marked = TRUE
AND last_updated_at >= NOW() - INTERVAL '48 hours';

-- Expected output: JSON blob with 4 videos
-- Copy this JSON and we'll use it for delta sync testing
