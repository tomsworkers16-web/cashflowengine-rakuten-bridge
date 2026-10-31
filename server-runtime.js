const PORT = Number(process.env.PORT || 10000);

await import('./server-threads-gateway.js');

async function localGet(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function summarizeEvaluation(label, result) {
  const d = result.data || {};
  const first = Array.isArray(d.posts) && d.posts.length ? d.posts[0] : null;
  console.log(`[${label}]`, JSON.stringify({
    status: result.status,
    ok: d.ok === true,
    account: d.account || d.target_account || null,
    timezone: d.timezone || null,
    postCount: d.post_count ?? null,
    source: d.threads_data_source || d.source || null,
    firstPost: first ? {
      post_id: first.post_id,
      post_timestamp: first.post_timestamp,
      views: first.views,
      likes: first.likes,
      replies: first.replies,
      reposts: first.reposts,
      quotes: first.quotes,
      shares: first.shares,
      source: first.threads_data_source || first.source,
      hasPredictionSnapshot: Boolean(first.prediction_snapshot)
    } : null,
    fallbackRequired: d.fallback_required || false,
    fallbackReason: d.fallback_reason || null
  }));
}

setTimeout(async () => {
  try {
    const health = await localGet('/threads/health');
    console.log('[THREADS_GATEWAY_HEALTH_TEST]', JSON.stringify({
      status: health.status,
      ok: health.data?.ok === true,
      configured: health.data?.configured,
      metaApiReachable: health.data?.meta_api_reachable,
      tokenValidity: health.data?.token_validity,
      targetAccount: health.data?.target_account,
      primarySource: health.data?.primary_source,
      fallbackSource: health.data?.fallback_source,
      lastSuccessfulFetch: health.data?.last_successful_fetch,
      lastError: health.data?.last_error || null
    }));

    const seven = await localGet('/threads/evaluation-data?days=7');
    summarizeEvaluation('THREADS_EVALUATION_7D_TEST', seven);

    const today = await localGet('/threads/evaluation-data?days=1');
    summarizeEvaluation('THREADS_EVALUATION_TODAY_TEST', today);

    if (process.env.CFE_FALLBACK_TEST_ON_START === '1') {
      const fallback = await localGet('/threads/evaluation-data?days=7&simulate_meta_failure=1');
      summarizeEvaluation('THREADS_FALLBACK_MOCK_TEST', fallback);
      const recovery = await localGet('/threads/evaluation-data?days=7');
      summarizeEvaluation('THREADS_FALLBACK_RECOVERY_TEST', recovery);
    }
  } catch (e) {
    console.error('[THREADS_GATEWAY_STARTUP_TEST_ERROR]', String(e?.message || e));
  }
}, 2500);
