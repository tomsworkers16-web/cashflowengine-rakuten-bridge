// Single-attempt publication with a durable intent journal.
// Record is synchronous: a crash after a request was sent must not trigger an automatic retry.
export async function publishTextOnce({ text, slot, jstDate, meta, record, send, lookup }) {
  if (typeof record !== 'function' || typeof send !== 'function' || typeof lookup !== 'function') {
    throw new Error('publish_dependencies_missing');
  }
  const at = new Date().toISOString();
  record({at, jstDate, slot, id: null, text, meta: {...meta, publishStatus: 'pending'}});
  try {
    const id = await send(text); // send MUST perform only one network attempt.
    if (!id) throw new Error('publish_no_id');
    record({at: new Date().toISOString(), jstDate, slot, id, text,
      meta: {...meta, publishStatus: 'posted'}});
    return {status:'posted', id};
  } catch (error) {
    try {
      const posts = await lookup();
      const match = Array.isArray(posts) && posts.find(p =>
        p?.id && String(p.text || '').trim() === String(text).trim());
      if (match) {
        record({at: new Date().toISOString(), jstDate, slot, id: match.id, text,
          meta: {...meta, publishStatus:'verified_posted'}});
        return {status:'verified_posted', id: match.id};
      }
    } catch {
      // If verification fails, publication outcome remains uncertain.
    }
    record({at: new Date().toISOString(), jstDate, slot, id: null, text,
      meta: {...meta, publishStatus:'uncertain'}});
    return {status:'uncertain', id:null, reason: error?.message || 'publish_outcome_unknown'};
  }
}

export function findRecoverablePosts(journal, officialPosts, day) {
  if (!Array.isArray(journal) || !Array.isArray(officialPosts)) return [];
  const latest = new Map();
  for (const row of journal) {
    if (row?.jstDate === day && typeof row.slot === 'string' && row.slot) latest.set(row.slot, row);
  }
  const uncertain = [...latest.values()].filter(row => !row?.id &&
    ['pending','uncertain','unverified'].includes(String(row?.meta?.publishStatus || '')) &&
    String(row?.text || '').trim());
  // Identical copy in multiple unresolved slots cannot be unambiguously attributed.
  const counts = new Map();
  for (const row of uncertain) {
    const key = row.text.trim();
    counts.set(key,(counts.get(key) || 0) + 1);
  }
  const knownIds = new Set(journal.filter(x => x?.id).map(x => String(x.id)));
  const matches = [];
  for (const row of uncertain) {
    const key = row.text.trim();
    if (counts.get(key) !== 1) continue;
    const found = officialPosts.filter(post => post?.id && String(post.text || '').trim() === key
      && !knownIds.has(String(post.id)));
    if (found.length !== 1) continue;
    const post = found[0];
    knownIds.add(String(post.id));
    matches.push({ ...row, at:new Date().toISOString(), id:post.id,
      meta:{...row.meta,publishStatus:'verified_posted',reconciledFrom:'official_timeline'} });
  }
  return matches;
}
