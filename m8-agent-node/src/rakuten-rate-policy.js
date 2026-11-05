// API-limit guard. 429 means we should stop searching instead of trying other keywords.
export const RAKUTEN_COOLDOWN_MS = 30 * 60 * 1000;
export function isRakutenRateLimitError(error) {
  return error?.status === 429 || String(error?.message || '') === 'HTTP_429';
}
export function rakutenCooldownRemaining(lastRateLimitAt,now=Date.now()) {
  const at=Date.parse(lastRateLimitAt || '');
  if(!Number.isFinite(at))return 0;
  return Math.max(0,Math.ceil((at+RAKUTEN_COOLDOWN_MS-now)/1000));
}
