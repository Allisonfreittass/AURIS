/**
 * User-plan lookup.
 *
 * Worker reads `public.profiles.plan` from Supabase using the service-role
 * key (bypasses RLS) and caches the result in KV for 60s. With the cache,
 * even at 200 req/day per user this lookup hits Supabase once per minute
 * per active user — negligible cost, no risk of bursting.
 *
 * Stripe webhook (B3c, future) will invalidate the cache on plan change
 * by writing the new plan to KV directly with the same key.
 */

export type PlanTier = 'free' | 'pro' | 'team';

export interface ProfilesEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  AURIS_RATELIMIT?: KVNamespace;
}

const CACHE_TTL_SECONDS = 60;

function planCacheKey(userId: string): string {
  return `plan:${userId}`;
}

function isValidPlan(p: unknown): p is PlanTier {
  return p === 'free' || p === 'pro' || p === 'team';
}

export async function fetchUserPlan(
  userId: string,
  env: ProfilesEnv,
): Promise<PlanTier> {
  // Dev path: no Supabase service-role key configured → assume 'free'.
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return 'free';
  }

  // Cached?
  if (env.AURIS_RATELIMIT) {
    const cached = await env.AURIS_RATELIMIT.get(planCacheKey(userId));
    if (isValidPlan(cached)) return cached;
  }

  // Fetch from Supabase.
  const url = `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=plan&limit=1`;
  let plan: PlanTier = 'free';
  try {
    const resp = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/json',
      },
    });
    if (resp.ok) {
      const rows = (await resp.json()) as Array<{ plan?: unknown }>;
      const found = rows[0]?.plan;
      if (isValidPlan(found)) plan = found;
    } else {
      console.warn(`[profiles] supabase ${resp.status} for user=${userId}`);
    }
  } catch (err) {
    console.warn(`[profiles] fetch failed for user=${userId}:`, err);
    // Fail closed → 'free'.
  }

  // Cache (best-effort).
  if (env.AURIS_RATELIMIT) {
    try {
      await env.AURIS_RATELIMIT.put(planCacheKey(userId), plan, {
        expirationTtl: CACHE_TTL_SECONDS,
      });
    } catch {
      /* ignore — cache is opportunistic */
    }
  }

  return plan;
}
