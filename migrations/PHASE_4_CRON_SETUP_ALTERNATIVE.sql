-- =====================================================
-- SlopBlock Phase 4: Cron Job Setup (Alternative Method)
-- =====================================================
-- This version stores credentials in a table instead of database settings
-- IMPORTANT: Replace YOUR_SERVICE_ROLE_KEY below with your actual service role key
-- Find it in: Supabase Dashboard > Project Settings > API > service_role key
-- =====================================================

-- =====================================================
-- Step 1: Create Configuration Table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (only functions can access)
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- No policies needed - only functions with SECURITY DEFINER can access

COMMENT ON TABLE public.system_config IS
  'System configuration for Edge Function calls and cron jobs';

-- =====================================================
-- Step 2: Store Configuration Values
-- =====================================================

-- Store project URL
INSERT INTO public.system_config (key, value, description)
VALUES (
  'project_url',
  'https://jbvufjdpnebzfqehbpdu.supabase.co',
  'Supabase project URL for Edge Function calls'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- Store service role key (REPLACE THIS!)
-- SECURITY WARNING: Never commit this to git!
INSERT INTO public.system_config (key, value, description)
VALUES (
  'service_role_key',
  'YOUR_SERVICE_ROLE_KEY_HERE',
  'Service role key for authenticated Edge Function calls'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- =====================================================
-- Step 3: Enable Extensions
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- =====================================================
-- Step 4: Create Function to Call Edge Function via HTTP
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_48h_blob_generation()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_url TEXT;
  v_service_role_key TEXT;
  v_response TEXT;
  v_status_code INTEGER;
BEGIN
  -- Get configuration from table
  SELECT value INTO v_project_url
  FROM public.system_config
  WHERE key = 'project_url';

  SELECT value INTO v_service_role_key
  FROM public.system_config
  WHERE key = 'service_role_key';

  IF v_project_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE EXCEPTION 'Missing project_url or service_role_key in system_config table';
  END IF;

  IF v_service_role_key = 'YOUR_SERVICE_ROLE_KEY_HERE' THEN
    RAISE EXCEPTION 'Service role key not set. Please update system_config table.';
  END IF;

  -- Call Edge Function via HTTP POST
  SELECT
    content::TEXT,
    status
  INTO
    v_response,
    v_status_code
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

  -- Log the response
  RAISE NOTICE 'Edge Function response (status %): %', v_status_code, v_response;

  RETURN v_response;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error calling Edge Function: %', SQLERRM;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION trigger_48h_blob_generation() IS
  'Triggers the 48h blob generation Edge Function via HTTP';

-- =====================================================
-- Step 5: Schedule Cron Job (Every 60 Minutes)
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
-- Step 6: Verify Cron Job is Scheduled
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
-- Step 7: Test Manually (Optional - Uncomment to run)
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
  RAISE NOTICE 'IMPORTANT: Update the service_role_key in system_config table!';
  RAISE NOTICE '';
  RAISE NOTICE 'Run this query to update it:';
  RAISE NOTICE 'UPDATE public.system_config';
  RAISE NOTICE 'SET value = ''YOUR_ACTUAL_SERVICE_ROLE_KEY''';
  RAISE NOTICE 'WHERE key = ''service_role_key'';';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '1. Update the service_role_key (see above)';
  RAISE NOTICE '2. Test manually by running:';
  RAISE NOTICE '   SELECT trigger_48h_blob_generation();';
  RAISE NOTICE '3. Check cron job logs after 1 hour:';
  RAISE NOTICE '   SELECT * FROM get_recent_cron_logs(10);';
  RAISE NOTICE '==============================================';
END;
$$;
