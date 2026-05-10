/**
 * Per-user daily rate limit, backed by Cloudflare KV.
 *
 * Limits scale with the user's plan (read from `profiles.plan` via Supabase
 * REST + KV cache). Free tier covers casual use; paid tiers raise the cap.
 *
 * KV is eventually consistent — counter races may leak a few extra requests
 * per user per day. Acceptable here. For strict per-second limits we'd want
 * Durable Objects, but the goal here is anti-abuse, not fairness.
 */
import type { PlanTier } from './profiles';

export type RateLimitResult =
  | { ok: true; remaining: number; limit: number; plan: PlanTier }
  | {
      ok: false;
      status: 429;
      resetAt: number;
      message: string;
      limit: number;
      plan: PlanTier;
    };

export interface RateLimitEnv {
  AURIS_RATELIMIT?: KVNamespace;
}

const PLAN_DAILY_LIMIT: Record<PlanTier, number> = {
  free: 200,
  pro: 5000,
  team: 25000,
};

const KEY_TTL_SECONDS = 60 * 60 * 30; // 30h — auto-cleans yesterday's keys

function todayKey(userId: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `rl:${userId}:${day}`;
}

/** Read-only quota lookup for a user — no increment. Used by `/quota`. */
export async function readQuota(
  userId: string,
  isDev: boolean,
  plan: PlanTier,
  env: RateLimitEnv,
): Promise<{ used: number; limit: number; resetAt: number }> {
  const limit = PLAN_DAILY_LIMIT[plan];
  if (isDev || !env.AURIS_RATELIMIT) {
    return { used: 0, limit, resetAt: nextUtcMidnight() };
  }
  const raw = await env.AURIS_RATELIMIT.get(todayKey(userId));
  const used = raw ? parseInt(raw, 10) : 0;
  return { used, limit, resetAt: nextUtcMidnight() };
}

function nextUtcMidnight(): number {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

export async function checkAndIncrement(
  userId: string,
  isDev: boolean,
  plan: PlanTier,
  env: RateLimitEnv,
): Promise<RateLimitResult> {
  const limit = PLAN_DAILY_LIMIT[plan];

  // Dev token bypasses the limit (used for our own load tests / smoke).
  if (isDev) {
    return { ok: true, remaining: Number.POSITIVE_INFINITY, limit, plan };
  }

  // No KV → pass through (local dev without binding).
  if (!env.AURIS_RATELIMIT) {
    return { ok: true, remaining: -1, limit, plan };
  }

  const key = todayKey(userId);
  const raw = await env.AURIS_RATELIMIT.get(key);
  const current = raw ? parseInt(raw, 10) : 0;

  if (current >= limit) {
    const resetAt = nextUtcMidnight();
    const hoursLeft = Math.ceil((resetAt - Date.now()) / (1000 * 60 * 60));
    const upgradeHint =
      plan === 'free'
        ? ' Faça upgrade pra um plano pago pra remover esse limite.'
        : '';
    return {
      ok: false,
      status: 429,
      resetAt,
      message: `Limite diário do plano ${plan} (${limit} requisições) atingido. Volta a contar em ~${hoursLeft}h.${upgradeHint}`,
      limit,
      plan,
    };
  }

  await env.AURIS_RATELIMIT.put(key, String(current + 1), {
    expirationTtl: KEY_TTL_SECONDS,
  });

  return { ok: true, remaining: limit - current - 1, limit, plan };
}
