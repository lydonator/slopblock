-- =====================================================
-- TEST SCRIPT: Mark Existing Videos for CDN Cache Testing
-- =====================================================
-- This script artificially marks existing test videos to verify
-- the CDN cache → IndexedDB → Warning Icons flow
--
-- WARNING: This is for TESTING ONLY. In production, videos should
-- only be marked when they organically reach 2.5+ trust points.
-- =====================================================

-- Step 1: Update video_aggregates_cache to mark all existing videos
UPDATE video_aggregates_cache
SET
  effective_trust_points = 2.96,  -- Above 2.5 threshold
  is_marked = true,
  last_updated_at = NOW()
WHERE is_marked = false;

-- Step 2: Verify the changes
SELECT
  COUNT(*) as total_marked,
  MIN(effective_trust_points) as min_trust,
  MAX(effective_trust_points) as max_trust,
  AVG(effective_trust_points) as avg_trust
FROM video_aggregates_cache
WHERE is_marked = true;

-- Step 3: Show sample of marked videos
SELECT
  video_id,
  channel_id,
  effective_trust_points,
  raw_report_count,
  is_marked,
  last_updated_at
FROM video_aggregates_cache
WHERE is_marked = true
ORDER BY last_updated_at DESC
LIMIT 10;

-- =====================================================
-- NEXT STEPS AFTER RUNNING THIS SCRIPT:
-- =====================================================
-- 1. Wait for next hourly cron job (or manually trigger it):
--    SELECT trigger_48h_blob_generation();
--
-- 2. Verify CDN blob contains marked videos:
--    Visit: https://jbvufjdpnebzfqehbpdu.supabase.co/storage/v1/object/public/cdn-cache/marked-videos-48h.json
--
-- 3. In extension popup, click "Refresh Cache"
--
-- 4. Navigate to YouTube and look for warning icons on thumbnails
--
-- 5. Check console for: "[SlopBlock] Checked X videos from cache, found Y marked"
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE '✅ Test videos marked successfully';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Manually trigger blob generation:';
  RAISE NOTICE '   SELECT trigger_48h_blob_generation();';
  RAISE NOTICE '';
  RAISE NOTICE '2. Check CDN blob has videos:';
  RAISE NOTICE '   https://jbvufjdpnebzfqehbpdu.supabase.co/storage/v1/object/public/cdn-cache/marked-videos-48h.json';
  RAISE NOTICE '';
  RAISE NOTICE '3. Click "Refresh Cache" in extension popup';
  RAISE NOTICE '';
  RAISE NOTICE '4. Visit YouTube and look for warning icons!';
  RAISE NOTICE '============================================';
END $$;
