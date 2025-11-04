-- Check if reported videos are marked in video_aggregates_cache

SELECT
    v.video_id,
    v.channel_id,
    v.report_count,
    vac.effective_trust_points,
    vac.is_marked,
    vac.raw_report_count,
    CASE
        WHEN vac.is_marked THEN '✅ MARKED'
        WHEN vac.effective_trust_points >= 2.5 THEN '⚠️ Should be marked (≥2.5 trust)'
        ELSE '❌ Not marked (need 2.5 trust, have ' || COALESCE(vac.effective_trust_points::text, '0') || ')'
    END as status
FROM videos v
LEFT JOIN video_aggregates_cache vac ON v.video_id = vac.video_id
WHERE v.video_id IN ('jd8vuGw_9cY', 'iqxnahcpWKI', 'O4iUBzQGfz4', 'Q8k6leBMGQc')
ORDER BY v.video_id;

-- Also check reports table
SELECT
    video_id,
    extension_id,
    trust_weight,
    accuracy_status,
    reported_at
FROM reports
WHERE video_id IN ('jd8vuGw_9cY', 'iqxnahcpWKI', 'O4iUBzQGfz4', 'Q8k6leBMGQc')
ORDER BY video_id;

-- Check extension trust
SELECT
    extension_id,
    trust_score,
    accuracy_rate,
    accurate_reports,
    inaccurate_reports,
    pending_reports,
    first_seen_at
FROM extension_trust
WHERE extension_id = '97i6fea8-d3za-47ad-99f8-e85ec896f97d';
