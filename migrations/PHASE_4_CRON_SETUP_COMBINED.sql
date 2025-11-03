-- =====================================================
-- SlopBlock Phase 4: Cron Job Setup (Combined)
-- =====================================================
-- IMPORTANT: Replace YOUR_SERVICE_ROLE_KEY below with your actual service role key
-- Find it in: Supabase Dashboard > Project Settings > API > service_role key
-- =====================================================

-- =====================================================
-- Step 1: Set Database Configuration
-- =====================================================

-- Set your project URL
ALTER DATABASE postgres SET app.settings.project_url = 'https://jbvufjdpnebzfqehbpdu.supabase.co';

-- Set your service role key (REPLACE THIS!)
-- SECURITY WARNING: Never commit this to git!
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY_HERE';

-- =====================================================
-- Step 2: Enable Extensions
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- =====================================================
-- Step 3: Create Function to Call Edge Function via HTTP
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_48h_blob_generation()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_url TEXT;
  v_service_role_key TEXT;
  v_response TEXT;
BEGIN
  -- Get Supabase project URL
  v_project_url := current_setting('app.settings.project_url', true);

  -- Get service role key
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  IF v_project_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE EXCEPTION 'Missing project_url or service_role_key settings';
  END IF;

  -- Call Edge Function via HTTP POST
  SELECT content::TEXT INTO v_response
  FROM http((
    'POST',
    v_project_url || '/functions/v1/generate-48h-blob',
    ARRAY[
      http_header('Content-Type', 'application/json'),
      http_header('Authorization', 'Bearer ' || v_service_role_key)
    ],
    'application/json',
    '{}'
  )::http_request);

  RETURN v_response;
END;
$$;

COMMENT ON FUNCTION trigger_48h_blob_generation() IS
  'Triggers the 48h blob generation Edge Function via HTTP';

-- =====================================================
-- Step 4: Schedule Cron Job (Every 60 Minutes)
-- =====================================================

-- Remove existing job if it exists
SELECT cron.unschedule('generate-48h-blob-job')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'generate-48h-blob-job'
);

-- Schedule new job to run every hour at minute 0
SELECT cron.schedule(
  'generate-48h-blob-job',
  '0 * * * *',
  $$SELECT trigger_48h_blob_generation();$$
);

-- =====================================================
-- Step 5: Verify Cron Job is Scheduled
-- =====================================================

SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'generate-48h-blob-job';

-- =====================================================
-- Step 6: Test Manually (Optional - Uncomment to run)
-- =====================================================

-- Uncomment the line below to test blob generation immediately:
-- SELECT trigger_48h_blob_generation();

-- =====================================================
-- Migration Complete
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Phase 4 Cron Job Setup Complete';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Cron job "generate-48h-blob-job" scheduled to run every 60 minutes';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '1. Verify the service_role_key was set correctly';
  RAISE NOTICE '2. Test manually by uncommenting and running:';
  RAISE NOTICE '   SELECT trigger_48h_blob_generation();';
  RAISE NOTICE '3. Check cron job logs after 1 hour:';
  RAISE NOTICE '   SELECT * FROM get_recent_cron_logs(10);';
  RAISE NOTICE '==============================================';
END;
$$;
