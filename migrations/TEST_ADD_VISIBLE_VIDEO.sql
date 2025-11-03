-- =====================================================
-- TEST SCRIPT: Mark a specific video that's visible on your YouTube feed
-- =====================================================
-- INSTRUCTIONS:
-- 1. Go to YouTube and find a video on your homepage
-- 2. Copy the video ID (the part after ?v= in the URL)
-- 3. Replace 'YOUR_VIDEO_ID_HERE' below with the actual video ID
-- 4. Run this script in Supabase SQL Editor
-- 5. Run: SELECT trigger_48h_blob_generation();
-- 6. Click "Refresh Cache" in extension popup
-- 7. Reload YouTube and look for the warning icon!
-- =====================================================

-- Replace this with a real video ID from your YouTube feed:
DO $$
DECLARE
  v_video_id VARCHAR(20) := 'YOUR_VIDEO_ID_HERE';  -- <-- CHANGE THIS!
  v_channel_id VARCHAR(30) := 'UCTestChannel';
  v_extension_id VARCHAR(50) := 'test-extension-001';
BEGIN
  -- Step 1: Insert the video if it doesn't exist
  INSERT INTO videos (video_id, channel_id, report_count)
  VALUES (v_video_id, v_channel_id, 1)
  ON CONFLICT (video_id) DO NOTHING;

  -- Step 2: Add a report with high trust weight
  INSERT INTO reports (video_id, extension_id, trust_weight)
  VALUES (v_video_id, v_extension_id, 1.0)
  ON CONFLICT (video_id, extension_id) DO NOTHING;

  -- Step 3: Manually update aggregate cache to mark it
  -- (Normally the trigger would do this, but we'll do it directly for testing)
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
    v_video_id,
    v_channel_id,
    2.96,  -- Above 2.5 threshold
    1,
    true,
    NOW(),
    NOW(),
    1
  )
  ON CONFLICT (video_id) DO UPDATE SET
    effective_trust_points = 2.96,
    is_marked = true,
    last_updated_at = NOW();

  RAISE NOTICE '============================================';
  RAISE NOTICE '✅ Video % marked successfully', v_video_id;
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Regenerate blob: SELECT trigger_48h_blob_generation();';
  RAISE NOTICE '2. Click "Refresh Cache" in extension popup';
  RAISE NOTICE '3. Reload YouTube and look for warning icon!';
  RAISE NOTICE '============================================';
END $$;
