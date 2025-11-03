-- =====================================================
-- PHASE 3.5: ADMIN DASHBOARD SCHEMA EXTENSIONS (FIXED)
-- =====================================================
-- Fixed version without IF NOT EXISTS for policies
-- =====================================================

-- 1. Channel Whitelist Table
CREATE TABLE IF NOT EXISTS channel_whitelist (
    channel_id VARCHAR(30) PRIMARY KEY,
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('verified', 'manual', 'appeal')),
    whitelisted_at TIMESTAMPTZ DEFAULT NOW(),
    whitelisted_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_whitelist_created ON channel_whitelist(created_at);
CREATE INDEX IF NOT EXISTS idx_channel_whitelist_reason ON channel_whitelist(reason);

COMMENT ON TABLE channel_whitelist IS 'Channels protected from being marked (YouTube Verified, manual admin whitelist, appeal granted)';

-- 2. Appeals Table
CREATE TABLE IF NOT EXISTS appeals (
    id BIGSERIAL PRIMARY KEY,
    appeal_type VARCHAR(20) NOT NULL CHECK (appeal_type IN ('video', 'channel', 'user')),
    subject_id VARCHAR(100) NOT NULL,
    submitter_email VARCHAR(255),
    reasoning TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'rejected')),
    assigned_to VARCHAR(100),
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution_action TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status);
CREATE INDEX IF NOT EXISTS idx_appeals_type ON appeals(appeal_type);
CREATE INDEX IF NOT EXISTS idx_appeals_submitted ON appeals(submitted_at);
CREATE INDEX IF NOT EXISTS idx_appeals_subject ON appeals(subject_id);

COMMENT ON TABLE appeals IS 'User-submitted appeals for marked videos, flagged users, or brigaded channels';

-- 3. Appeal Notes Table
CREATE TABLE IF NOT EXISTS appeal_notes (
    id BIGSERIAL PRIMARY KEY,
    appeal_id BIGINT NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
    admin_id VARCHAR(100) NOT NULL,
    note_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appeal_notes_appeal_id ON appeal_notes(appeal_id);
CREATE INDEX IF NOT EXISTS idx_appeal_notes_created ON appeal_notes(created_at);

COMMENT ON TABLE appeal_notes IS 'Internal admin notes for appeals (not visible to public submitters)';

-- 4. Admin Actions Table (Audit Log)
CREATE TABLE IF NOT EXISTS admin_actions (
    id BIGSERIAL PRIMARY KEY,
    admin_id VARCHAR(100) NOT NULL,
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
    subject_id VARCHAR(100) NOT NULL,
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_type ON admin_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_actions_subject ON admin_actions(subject_type, subject_id);

COMMENT ON TABLE admin_actions IS 'Audit log of all admin interventions';

-- 5. RLS Policies (DROP existing first to avoid conflicts)

-- Appeals policies
ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous insert appeals" ON appeals;
DROP POLICY IF EXISTS "Allow authenticated read appeals" ON appeals;
DROP POLICY IF EXISTS "Allow anon read appeals" ON appeals;
DROP POLICY IF EXISTS "Allow authenticated update appeals" ON appeals;
DROP POLICY IF EXISTS "Allow anon update appeals" ON appeals;

CREATE POLICY "Allow anonymous insert appeals"
ON appeals FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Allow authenticated read appeals"
ON appeals FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow anon read appeals"
ON appeals FOR SELECT
TO anon
USING (true);

CREATE POLICY "Allow authenticated update appeals"
ON appeals FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Allow anon update appeals"
ON appeals FOR UPDATE
TO anon
USING (true);

-- Appeal Notes policies
ALTER TABLE appeal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read/write appeal_notes" ON appeal_notes;

CREATE POLICY "Allow anon read/write appeal_notes"
ON appeal_notes FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Admin Actions policies
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read/write admin_actions" ON admin_actions;

CREATE POLICY "Allow anon read/write admin_actions"
ON admin_actions FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Channel Whitelist policies
ALTER TABLE channel_whitelist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read/write channel_whitelist" ON channel_whitelist;

CREATE POLICY "Allow anon read/write channel_whitelist"
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
