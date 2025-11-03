-- =====================================================
-- Initialize Community Stats Table
-- =====================================================
-- This ensures the community_stats table has its required single row
-- with cold-start values for early community growth
-- =====================================================

-- Insert or update the single community stats row
INSERT INTO community_stats (
  id,
  total_users,
  active_users_30d,
  avg_trust_weight,
  maturity_factor,
  effective_threshold,
  last_updated
)
VALUES (
  1,      -- Single row ID (enforced by CHECK constraint)
  0,      -- Total users registered (will be updated by triggers)
  0,      -- Active users in last 30 days
  0.700,  -- Average trust weight (70% cold-start boost)
  0.40,   -- Maturity factor (40% = cold-start phase)
  2.50,   -- Effective threshold (standard 2.5 trust points)
  NOW()   -- Last updated timestamp
)
ON CONFLICT (id) DO UPDATE SET
  -- Don't overwrite existing values, just ensure row exists
  last_updated = COALESCE(community_stats.last_updated, NOW());

-- Verify the row was created
SELECT
  id,
  total_users,
  active_users_30d,
  avg_trust_weight,
  maturity_factor,
  effective_threshold,
  last_updated
FROM community_stats;

-- =====================================================
-- VERIFICATION & EXPLANATION
-- =====================================================

DO $$
DECLARE
  v_total_users INTEGER;
  v_active_users INTEGER;
  v_health_status TEXT;
BEGIN
  SELECT total_users, active_users_30d
  INTO v_total_users, v_active_users
  FROM community_stats WHERE id = 1;

  -- Determine health status based on active users
  IF v_active_users < 100 THEN
    v_health_status := 'Building 🔨';
  ELSIF v_active_users < 1000 THEN
    v_health_status := 'Growing 🌱';
  ELSIF v_active_users < 10000 THEN
    v_health_status := 'Healthy 💚';
  ELSE
    v_health_status := 'Thriving 🚀';
  END IF;

  RAISE NOTICE '============================================';
  RAISE NOTICE '✅ Community Stats Initialized';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Total Users: %', v_total_users;
  RAISE NOTICE 'Active Users (30d): %', v_active_users;
  RAISE NOTICE 'Community Health: %', v_health_status;
  RAISE NOTICE '';
  RAISE NOTICE 'The community_stats table is now ready!';
  RAISE NOTICE 'The extension popup and admin dashboard will no longer show errors.';
  RAISE NOTICE '';
  RAISE NOTICE 'Health Status Tiers:';
  RAISE NOTICE '  • Building:  0-99 active users';
  RAISE NOTICE '  • Growing:   100-999 active users';
  RAISE NOTICE '  • Healthy:   1,000-9,999 active users';
  RAISE NOTICE '  • Thriving:  10,000+ active users';
  RAISE NOTICE '============================================';
END $$;
