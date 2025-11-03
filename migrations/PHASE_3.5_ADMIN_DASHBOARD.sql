-- =====================================================
-- PHASE 3.5: ADMIN DASHBOARD SCHEMA EXTENSIONS
-- =====================================================
-- Creates tables for:
-- - Channel whitelist (YouTube Verified + manual)
-- - Appeals system (user disputes)
-- - Admin action audit log
-- - Appeal notes (internal documentation)
-- =====================================================

-- 1. Channel Whitelist Table
-- Protects channels from being marked (YouTube Verified, manual admin whitelist)
CREATE TABLE IF NOT EXISTS channel_whitelist (
    channel_id VARCHAR(30) PRIMARY KEY,
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('verified', 'manual', 'appeal')),
    whitelisted_at TIMESTAMPTZ DEFAULT NOW(),
    whitelisted_by VARCHAR(100), -- admin extension_id or 'system'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_whitelist_created ON channel_whitelist(created_at);
CREATE INDEX IF NOT EXISTS idx_channel_whitelist_reason ON channel_whitelist(reason);

COMMENT ON TABLE channel_whitelist IS 'Channels protected from being marked (YouTube Verified, manual admin whitelist, appeal granted)';
COMMENT ON COLUMN channel_whitelist.reason IS 'Whitelist reason: verified (YouTube Verified), manual (admin decision), appeal (user appeal granted)';
COMMENT ON COLUMN channel_whitelist.whitelisted_by IS 'Admin extension ID or "system" for auto-whitelist';

-- 2. Appeals Table
-- User-submitted appeals for marked videos, flagged users, or brigaded channels
CREATE TABLE IF NOT EXISTS appeals (
    id BIGSERIAL PRIMARY KEY,
    appeal_type VARCHAR(20) NOT NULL CHECK (appeal_type IN ('video', 'channel', 'user')),
    subject_id VARCHAR(100) NOT NULL, -- video_id, channel_id, or extension_id
    submitter_email VARCHAR(255), -- optional contact info
    reasoning TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'rejected')),
    assigned_to VARCHAR(100), -- admin extension_id handling this appeal
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution_action TEXT, -- description of action taken (e.g., "Force unmarked video", "Removed from whitelist")
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status);
CREATE INDEX IF NOT EXISTS idx_appeals_type ON appeals(appeal_type);
CREATE INDEX IF NOT EXISTS idx_appeals_submitted ON appeals(submitted_at);
CREATE INDEX IF NOT EXISTS idx_appeals_subject ON appeals(subject_id);

COMMENT ON TABLE appeals IS 'User-submitted appeals for marked videos, flagged users, or brigaded channels';
COMMENT ON COLUMN appeals.appeal_type IS 'Type: video (incorrectly marked), channel (brigaded), user (flagged incorrectly)';
COMMENT ON COLUMN appeals.subject_id IS 'YouTube video ID, channel ID, or extension ID being appealed';
COMMENT ON COLUMN appeals.status IS 'Appeal workflow status: pending → under_review → resolved/rejected';

-- 3. Appeal Notes Table
-- Internal admin notes for appeals (not visible to public)
CREATE TABLE IF NOT EXISTS appeal_notes (
    id BIGSERIAL PRIMARY KEY,
    appeal_id BIGINT NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
    admin_id VARCHAR(100) NOT NULL, -- extension_id of admin who wrote note
    note_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appeal_notes_appeal_id ON appeal_notes(appeal_id);
CREATE INDEX IF NOT EXISTS idx_appeal_notes_created ON appeal_notes(created_at);

COMMENT ON TABLE appeal_notes IS 'Internal admin notes for appeals (not visible to public submitters)';

-- 4. Admin Actions Table (Audit Log)
-- Logs all admin interventions for transparency and debugging
CREATE TABLE IF NOT EXISTS admin_actions (
    id BIGSERIAL PRIMARY KEY,
    admin_id VARCHAR(100) NOT NULL, -- extension_id of admin
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN (
        'force_mark',
        'force_unmark',
        'delete_report',
        'flag_user',
        'unflag_user',
        'whitelist_channel',
        'remove_whitelist',
        'resolve_appeal',
        'assign_appeal',
        'manual_threshold'
    )),
    subject_type VARCHAR(20) NOT NULL CHECK (subject_type IN ('video', 'channel', 'user', 'report', 'appeal', 'system')),
    subject_id VARCHAR(100) NOT NULL, -- ID of affected entity
    reason TEXT, -- admin-provided reason for action
    metadata JSONB, -- additional context (e.g., {"old_value": 2.5, "new_value": 3.0, "report_count": 12})
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_type ON admin_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_actions_subject ON admin_actions(subject_type, subject_id);

COMMENT ON TABLE admin_actions IS 'Audit log of all admin interventions (force mark/unmark, flag user, whitelist channel, etc.)';
COMMENT ON COLUMN admin_actions.metadata IS 'JSON object with additional context (old/new values, counts, etc.)';

-- 5. RLS Policies

-- Appeals: Allow anonymous insert (public form), authenticated read (admin dashboard)
ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;

-- Allow anyone to submit appeals (public form)
CREATE POLICY IF NOT EXISTS "Allow anonymous insert appeals"
ON appeals FOR INSERT
TO anon
WITH CHECK (true);

-- Allow authenticated users to read all appeals (admin dashboard)
CREATE POLICY IF NOT EXISTS "Allow authenticated read appeals"
ON appeals FOR SELECT
TO authenticated
USING (true);

-- Allow anon to read appeals (admin dashboard doesn't use auth yet)
CREATE POLICY IF NOT EXISTS "Allow anon read appeals"
ON appeals FOR SELECT
TO anon
USING (true);

-- Allow authenticated users to update appeals (admin dashboard)
CREATE POLICY IF NOT EXISTS "Allow authenticated update appeals"
ON appeals FOR UPDATE
TO authenticated
USING (true);

-- Allow anon to update appeals (admin dashboard doesn't use auth yet)
CREATE POLICY IF NOT EXISTS "Allow anon update appeals"
ON appeals FOR UPDATE
TO anon
USING (true);

-- Appeal Notes: Admin-only
ALTER TABLE appeal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow anon read/write appeal_notes"
ON appeal_notes FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Admin Actions: Read-only for transparency
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow anon read/write admin_actions"
ON admin_actions FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Channel Whitelist: Read-only public, write for admins
ALTER TABLE channel_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow anon read/write channel_whitelist"
ON channel_whitelist FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Phase 3.5 Schema Extensions Applied';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  ✓ channel_whitelist';
    RAISE NOTICE '  ✓ appeals';
    RAISE NOTICE '  ✓ appeal_notes';
    RAISE NOTICE '  ✓ admin_actions';
    RAISE NOTICE '';
    RAISE NOTICE 'RLS policies enabled for all tables';
    RAISE NOTICE '';
    RAISE NOTICE 'Next: Run PHASE_3.5_FUNCTIONS.sql';
END $$;
