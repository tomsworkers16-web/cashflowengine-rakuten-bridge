// The journal contains multiple transitions for a single scheduled post.
// Count the latest transition per (day, slot), never journal line count.
export function summarizePostJournal(rows = []) {
  const bySlot = new Map();
  let missingSlot = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const day = String(row.jstDate || '').trim();
    const slot = String(row.slot || '').trim();
    const key = slot ? day + '/' + slot : 'unkeyed/' + missingSlot++;
    bySlot.set(key, row);
  }
  const latest = [...bySlot.values()];
  const published = latest.filter(x => Boolean(x?.id) && !['uncertain','unverified','pending'].includes(String(x?.meta?.publishStatus || '')));
  const uncertain = latest.filter(x => ['uncertain','unverified','pending'].includes(String(x?.meta?.publishStatus || '')) || !x?.id);
  const postsByRole = {};
  for (const x of published) {
    const role = x?.meta?.role || 'unknown';
    postsByRole[role] = (postsByRole[role] || 0) + 1;
  }
  return { posts: published.length, postsByRole, uncertainAttempts: uncertain.length, published };
}
