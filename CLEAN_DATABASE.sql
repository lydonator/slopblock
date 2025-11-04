-- CLEAN_DATABASE.sql
-- Comprehensive database cleanup script
-- Removes ALL testing data while preserving structure and your extension ID
-- Safe version: checks if tables exist before truncating

DO $$
BEGIN
    -- Step 1: Clear cache tables (Phase 4) - if they exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cache_delta_log') THEN
        TRUNCATE TABLE cache_delta_log CASCADE;
        RAISE NOTICE 'Cleared cache_delta_log';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cache_48h_blob') THEN
        TRUNCATE TABLE cache_48h_blob CASCADE;
        RAISE NOTICE 'Cleared cache_48h_blob';
    END IF;

    -- Step 2: Clear aggregates and trust data (Phase 3)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_aggregates_cache') THEN
        TRUNCATE TABLE video_aggregates_cache CASCADE;
        RAISE NOTICE 'Cleared video_aggregates_cache';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'extension_trust') THEN
        TRUNCATE TABLE extension_trust CASCADE;
        RAISE NOTICE 'Cleared extension_trust';
    END IF;

    -- Step 3: Clear core tables (Phase 0-2)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports') THEN
        TRUNCATE TABLE reports CASCADE;
        RAISE NOTICE 'Cleared reports';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'videos') THEN
        TRUNCATE TABLE videos CASCADE;
        RAISE NOTICE 'Cleared videos';
    END IF;

    -- Step 4: Clear additional tables (appeals, moderation, etc.)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'appeals') THEN
        TRUNCATE TABLE appeals CASCADE;
        RAISE NOTICE 'Cleared appeals';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'appeal_notes') THEN
        TRUNCATE TABLE appeal_notes CASCADE;
        RAISE NOTICE 'Cleared appeal_notes';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_actions') THEN
        TRUNCATE TABLE admin_actions CASCADE;
        RAISE NOTICE 'Cleared admin_actions';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel_whitelist') THEN
        TRUNCATE TABLE channel_whitelist CASCADE;
        RAISE NOTICE 'Cleared channel_whitelist';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'community_stats') THEN
        TRUNCATE TABLE community_stats CASCADE;
        RAISE NOTICE 'Cleared community_stats';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cron_job_logs') THEN
        TRUNCATE TABLE cron_job_logs CASCADE;
        RAISE NOTICE 'Cleared cron_job_logs';
    END IF;

    -- Step 5: Reset sequences
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'reports_id_seq') THEN
        ALTER SEQUENCE reports_id_seq RESTART WITH 1;
        RAISE NOTICE 'Reset reports_id_seq';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'cache_delta_log_id_seq') THEN
        ALTER SEQUENCE cache_delta_log_id_seq RESTART WITH 1;
        RAISE NOTICE 'Reset cache_delta_log_id_seq';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'appeals_id_seq') THEN
        ALTER SEQUENCE appeals_id_seq RESTART WITH 1;
        RAISE NOTICE 'Reset appeals_id_seq';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'appeal_notes_id_seq') THEN
        ALTER SEQUENCE appeal_notes_id_seq RESTART WITH 1;
        RAISE NOTICE 'Reset appeal_notes_id_seq';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'admin_actions_id_seq') THEN
        ALTER SEQUENCE admin_actions_id_seq RESTART WITH 1;
        RAISE NOTICE 'Reset admin_actions_id_seq';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'cron_job_logs_id_seq') THEN
        ALTER SEQUENCE cron_job_logs_id_seq RESTART WITH 1;
        RAISE NOTICE 'Reset cron_job_logs_id_seq';
    END IF;

    RAISE NOTICE 'Database cleanup complete!';
END $$;

-- Step 6: Verify cleanup - show counts for all tables
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.tables t2
     WHERE t2.table_schema = 'public' AND t2.table_name = t.table_name) as exists,
    CASE
        WHEN table_name = 'videos' THEN (SELECT COUNT(*) FROM videos)
        WHEN table_name = 'reports' THEN (SELECT COUNT(*) FROM reports)
        WHEN table_name = 'extension_trust' THEN (SELECT COUNT(*) FROM extension_trust)
        WHEN table_name = 'video_aggregates_cache' THEN (SELECT COUNT(*) FROM video_aggregates_cache)
        WHEN table_name = 'appeals' THEN (SELECT COUNT(*) FROM appeals)
        WHEN table_name = 'appeal_notes' THEN (SELECT COUNT(*) FROM appeal_notes)
        WHEN table_name = 'admin_actions' THEN (SELECT COUNT(*) FROM admin_actions)
        WHEN table_name = 'channel_whitelist' THEN (SELECT COUNT(*) FROM channel_whitelist)
        WHEN table_name = 'community_stats' THEN (SELECT COUNT(*) FROM community_stats)
        WHEN table_name = 'cron_job_logs' THEN (SELECT COUNT(*) FROM cron_job_logs)
        WHEN table_name = 'system_config' THEN (SELECT COUNT(*) FROM system_config)
        ELSE NULL
    END as row_count
FROM (
    VALUES
        ('videos'),
        ('reports'),
        ('extension_trust'),
        ('video_aggregates_cache'),
        ('appeals'),
        ('appeal_notes'),
        ('admin_actions'),
        ('channel_whitelist'),
        ('community_stats'),
        ('cron_job_logs'),
        ('system_config')
) AS t(table_name)
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND information_schema.tables.table_name = t.table_name)
ORDER BY table_name;

-- Expected result: All counts should be 0 except system_config (should be 1)

-- Next steps:
-- 1. Clear Supabase Storage cache blob:
--    Storage → cache-blobs bucket → Delete 48h-cache.json
-- 2. Clear browser IndexedDB:
--    Open SlopBlock popup → Click "Clear Cache" button
-- 3. Reload extension in chrome://extensions/
-- 4. Ready for fresh testing!
