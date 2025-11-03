-- =====================================================
-- SlopBlock Phase 4: Cron Job Setup
-- =====================================================
-- This sets up the scheduled cron job to regenerate
-- the 48-hour blob every 60 minutes.
--
-- Prerequisites:
-- 1. Run PHASE_4_CDN_INFRASTRUCTURE.sql first
-- 2. Deploy Edge Functions (generate-48h-blob, generate-delta)
--
-- Run this in: Supabase Dashboard > SQL Editor
-- =====================================================

-- =====================================================
-- 1. Enable pg_cron Extension
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- =====================================================
-- 2. Create Function to Call Edge Function via HTTP
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
  -- Get Supabase project URL (replace with your actual project URL)
  -- Format: https://xxxxx.supabase.co
  v_project_url := current_setting('app.settings.project_url', true);

  -- Get service role key (set via Supabase Dashboard > Project Settings > API)
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
-- 3. Schedule Cron Job (Every 60 Minutes)
-- =====================================================

-- Remove existing job if it exists
SELECT cron.unschedule('generate-48h-blob-job')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'generate-48h-blob-job'
);

-- Schedule new job to run every hour at minute 0
SELECT cron.schedule(
  'generate-48h-blob-job',           -- Job name
  '0 * * * *',                        -- Cron expression (every hour at :00)
  $$SELECT trigger_48h_blob_generation();$$
);

-- =====================================================
-- 4. Alternative: Direct HTTP Call (Simpler Approach)
-- =====================================================
-- If the function approach doesn't work, use this instead:
-- =====================================================

/*
-- IMPORTANT: Replace {YOUR_PROJECT_ID} with your actual Supabase project ID
-- and {YOUR_SERVICE_ROLE_KEY} with your actual service role key

SELECT cron.schedule(
  'generate-48h-blob-job',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://{YOUR_PROJECT_ID}.supabase.co/functions/v1/generate-48h-blob',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer {YOUR_SERVICE_ROLE_KEY}'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
*/

-- =====================================================
-- 5. Verify Cron Job is Scheduled
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
-- 6. Manual Test (Run This Once)
-- =====================================================
-- Test the blob generation function manually before relying on cron

-- SELECT trigger_48h_blob_generation();

-- Check if blob was created successfully
-- SELECT * FROM cron_job_logs
-- WHERE job_name = 'generate-48h-blob'
-- ORDER BY executed_at DESC
-- LIMIT 1;

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
  RAISE NOTICE 'IMPORTANT MANUAL STEPS:';
  RAISE NOTICE '1. Set project_url in Supabase Dashboard:';
  RAISE NOTICE '   ALTER DATABASE postgres SET app.settings.project_url = ''https://YOUR_PROJECT_ID.supabase.co'';';
  RAISE NOTICE '';
  RAISE NOTICE '2. Set service_role_key (NEVER commit this to git):';
  RAISE NOTICE '   ALTER DATABASE postgres SET app.settings.service_role_key = ''YOUR_SERVICE_ROLE_KEY'';';
  RAISE NOTICE '';
  RAISE NOTICE '3. Test manually by running:';
  RAISE NOTICE '   SELECT trigger_48h_blob_generation();';
  RAISE NOTICE '';
  RAISE NOTICE '4. Verify cron job logs:';
  RAISE NOTICE '   SELECT * FROM get_recent_cron_logs(10);';
  RAISE NOTICE '==============================================';
END;
$$;
