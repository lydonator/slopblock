-- =====================================================
-- SlopBlock Phase 4: CDN Caching Infrastructure
-- =====================================================
-- This migration sets up the infrastructure for 48-hour
-- sliding window CDN caching with delta updates.
--
-- Run this in: Supabase Dashboard > SQL Editor
-- =====================================================

-- =====================================================
-- 1. Create Monitoring Table for Cron Job Logs
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cron_job_logs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  video_count INTEGER,
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_executed_at
  ON public.cron_job_logs(executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_job_logs_job_name
  ON public.cron_job_logs(job_name, executed_at DESC);

-- Enable RLS (only admins should access logs)
ALTER TABLE public.cron_job_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users (admin dashboard)
CREATE POLICY "Allow authenticated users to read cron logs"
  ON public.cron_job_logs
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.cron_job_logs IS
  'Logs for scheduled cron jobs (blob generation, delta updates)';

-- =====================================================
-- 2. Create Health Check Function
-- =====================================================

CREATE OR REPLACE FUNCTION check_cron_health()
RETURNS TABLE (
  status TEXT,
  last_success TIMESTAMP WITH TIME ZONE,
  last_failure TIMESTAMP WITH TIME ZONE,
  recent_failures INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_failures INTEGER;
  v_last_success TIMESTAMP WITH TIME ZONE;
  v_last_failure TIMESTAMP WITH TIME ZONE;
  v_status TEXT;
  v_message TEXT;
BEGIN
  -- Get last successful execution
  SELECT executed_at INTO v_last_success
  FROM public.cron_job_logs
  WHERE job_name = 'generate-48h-blob' AND status = 'success'
  ORDER BY executed_at DESC
  LIMIT 1;

  -- Get last failed execution
  SELECT executed_at INTO v_last_failure
  FROM public.cron_job_logs
  WHERE job_name = 'generate-48h-blob' AND status = 'failed'
  ORDER BY executed_at DESC
  LIMIT 1;

  -- Count recent failures (last 2 hours)
  SELECT COUNT(*) INTO v_recent_failures
  FROM public.cron_job_logs
  WHERE job_name = 'generate-48h-blob'
    AND status = 'failed'
    AND executed_at >= NOW() - INTERVAL '2 hours';

  -- Determine status
  IF v_recent_failures >= 2 THEN
    v_status := 'CRITICAL';
    v_message := 'Cron job failed 2+ times in last 2 hours';
  ELSIF v_last_success IS NULL THEN
    v_status := 'WARNING';
    v_message := 'No successful executions found';
  ELSIF v_last_success < NOW() - INTERVAL '2 hours' THEN
    v_status := 'WARNING';
    v_message := 'No successful execution in last 2 hours';
  ELSE
    v_status := 'OK';
    v_message := 'Cron job running normally';
  END IF;

  RETURN QUERY SELECT
    v_status,
    v_last_success,
    v_last_failure,
    v_recent_failures,
    v_message;
END;
$$;

GRANT EXECUTE ON FUNCTION check_cron_health() TO authenticated;

COMMENT ON FUNCTION check_cron_health() IS
  'Health check for 48h blob generation cron job';

-- =====================================================
-- 3. Create Query for Recent Cron Job Status
-- =====================================================

CREATE OR REPLACE FUNCTION get_recent_cron_logs(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  id BIGINT,
  job_name TEXT,
  executed_at TIMESTAMP WITH TIME ZONE,
  status TEXT,
  video_count INTEGER,
  error_message TEXT,
  execution_time_ms INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cl.id,
    cl.job_name,
    cl.executed_at,
    cl.status,
    cl.video_count,
    cl.error_message,
    cl.execution_time_ms
  FROM public.cron_job_logs cl
  WHERE cl.job_name = 'generate-48h-blob'
  ORDER BY cl.executed_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_recent_cron_logs(INTEGER) TO authenticated;

COMMENT ON FUNCTION get_recent_cron_logs(INTEGER) IS
  'Get recent cron job execution logs for monitoring dashboard';

-- =====================================================
-- 4. Create Storage Bucket (via SQL)
-- =====================================================
-- Note: This creates the bucket record. You must also:
-- 1. Enable public access in Supabase Dashboard > Storage
-- 2. Set CORS policy for chrome-extension://*
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cdn-cache',
  'cdn-cache',
  true,  -- Public bucket
  10485760,  -- 10 MB limit
  ARRAY['application/json']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Create public access policy for cdn-cache bucket
-- Drop existing policy if it exists, then recreate
DROP POLICY IF EXISTS "Public read access for cdn-cache" ON storage.objects;

CREATE POLICY "Public read access for cdn-cache"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'cdn-cache');

-- =====================================================
-- 5. Verify Existing video_aggregates_cache Table
-- =====================================================
-- This table should already exist from Phase 3.
-- Let's add an index to optimize the 48-hour window query.
-- =====================================================

-- Add index for 48-hour window queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_video_agg_marked_updated
  ON public.video_aggregates_cache(is_marked, last_updated_at DESC)
  WHERE is_marked = true;

COMMENT ON INDEX idx_video_agg_marked_updated IS
  'Optimizes 48-hour window queries for marked videos';

-- =====================================================
-- 6. Create Helper Function to Get CDN Stats
-- =====================================================

CREATE OR REPLACE FUNCTION get_cdn_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_marked BIGINT;
  v_marked_48h BIGINT;
  v_last_blob_generated TIMESTAMP WITH TIME ZONE;
  v_blob_video_count INTEGER;
BEGIN
  -- Total marked videos (all time)
  SELECT COUNT(*) INTO v_total_marked
  FROM video_aggregates_cache
  WHERE is_marked = true;

  -- Marked videos in 48-hour window
  SELECT COUNT(*) INTO v_marked_48h
  FROM video_aggregates_cache
  WHERE is_marked = true
    AND last_updated_at >= NOW() - INTERVAL '48 hours';

  -- Get last blob generation info
  SELECT executed_at, video_count
  INTO v_last_blob_generated, v_blob_video_count
  FROM cron_job_logs
  WHERE job_name = 'generate-48h-blob' AND status = 'success'
  ORDER BY executed_at DESC
  LIMIT 1;

  RETURN json_build_object(
    'total_marked_videos', COALESCE(v_total_marked, 0),
    'marked_videos_48h', COALESCE(v_marked_48h, 0),
    'last_blob_generated', v_last_blob_generated,
    'last_blob_video_count', COALESCE(v_blob_video_count, 0),
    'cache_coverage_percent',
      CASE
        WHEN v_total_marked > 0 THEN ROUND((v_marked_48h::DECIMAL / v_total_marked) * 100, 2)
        ELSE 0
      END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_cdn_stats() TO authenticated, anon;

COMMENT ON FUNCTION get_cdn_stats() IS
  'Get CDN cache statistics for monitoring dashboard';

-- =====================================================
-- 7. Initial Data Verification
-- =====================================================

-- Check if video_aggregates_cache table exists and has data
DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_row_count BIGINT;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'video_aggregates_cache'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE WARNING 'video_aggregates_cache table does not exist! Run Phase 3 migrations first.';
  ELSE
    -- Count rows
    SELECT COUNT(*) INTO v_row_count FROM video_aggregates_cache;
    RAISE NOTICE 'video_aggregates_cache table exists with % rows', v_row_count;
  END IF;
END;
$$;

-- =====================================================
-- Migration Complete
-- =====================================================

-- Success message
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Phase 4 CDN Infrastructure Migration Complete';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '1. Deploy Edge Functions (generate-48h-blob, generate-delta)';
  RAISE NOTICE '2. Set up CORS in Supabase Dashboard for chrome-extension://*';
  RAISE NOTICE '3. Configure cron job to call generate-48h-blob every 60 minutes';
  RAISE NOTICE '4. Test blob generation manually';
  RAISE NOTICE '==============================================';
END;
$$;
