/**
 * Per-IP daily request quota stored in Cloudflare KV.
 *
 * Key shape: rl:<ip>:<YYYY-MM-DD>
 * Value:     count (number, stored as string)
 *
 * Each call increments the counter. Returns true when the request is
 * within quota, false when exceeded. KV is eventually consistent — for
 * rate limiting this is acceptable (a determined attacker may sneak a
 * few extra calls while writes propagate, but never an unbounded amount).
 */
export async function checkAndIncrementQuota(
  kv: KVNamespace,
  ip: string,
  limit: number,
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const key = `rl:${ip}:${today}`;

  const raw = await kv.get(key);
  const current = raw ? parseInt(raw, 10) || 0 : 0;
  if (current >= limit) {
    return false;
  }
  // expirationTtl 90000s = ~25h, so the counter naturally falls off the
  // day after. We don't need precise midnight rollover.
  await kv.put(key, String(current + 1), { expirationTtl: 90000 });
  return true;
}
