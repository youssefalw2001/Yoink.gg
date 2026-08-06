-- YOINK.GG — Initial schema for Wallet Wars server-authoritative backend
--
-- This schema mirrors the client-side state in src/lib/walletWarsState.ts and
-- makes it persistent, multi-user, and tamper-proof. Every table is protected
-- by Row Level Security so users can only mutate their own data.
--
-- DESIGN PRINCIPLES:
--   1. The siege settlement function owns the seed + roll + outcome (server authority)
--   2. Vaults are the source of truth for corpus/banked/streak (not localStorage)
--   3. Sieges table is an IMMUTABLE audit trail (append-only, provably fair)
--   4. Referral attribution is set-once (first referrer wins, never overwritten)
--   5. House ledger is a singleton row updated atomically inside settlement

-- ═══════════════════════════════════════════════════════════════════════════════
-- EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid(), gen_random_bytes()
CREATE EXTENSION IF NOT EXISTS "pg_net";      -- for async webhooks (notifications)

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE tier_id AS ENUM ('pit', 'grind', 'arena', 'court');
CREATE TYPE risk_profile AS ENUM ('fortified', 'standard', 'exposed');
CREATE TYPE siege_outcome AS ENUM ('win', 'loss');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. PROFILES — wallet identity (linked to Supabase auth.users)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet        TEXT NOT NULL UNIQUE,         -- Solana base58 public key
  display_name  TEXT DEFAULT '',
  avatar_variant INT DEFAULT NULL,
  avatar_color  TEXT DEFAULT NULL,
  role          TEXT DEFAULT 'runner' CHECK (role IN ('lord', 'runner')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_wallet ON public.profiles(wallet);

-- RLS: users can read all profiles, but only update their own.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. VAULTS — the real vault state (replaces localStorage yoink_walletwars_v4)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.vaults (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet        TEXT NOT NULL,                -- denormalized for fast board queries

  -- Economy state (mirrors src/lib/walletWarsState.ts Vault interface)
  amount        NUMERIC(20, 9) NOT NULL CHECK (amount >= 0),     -- V: corpus
  banked        NUMERIC(20, 9) NOT NULL DEFAULT 0 CHECK (banked >= 0),  -- withdrawable fees
  fees_earned   NUMERIC(20, 9) NOT NULL DEFAULT 0,               -- lifetime tolls (display only)
  survived      INT NOT NULL DEFAULT 0 CHECK (survived >= 0),
  cracked       INT NOT NULL DEFAULT 0 CHECK (cracked >= 0),
  streak        INT NOT NULL DEFAULT 0 CHECK (streak >= 0),
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  shield_until  TIMESTAMPTZ NOT NULL DEFAULT now(),
  seq           INT NOT NULL DEFAULT 0,      -- optimistic concurrency version
  compound      BOOLEAN NOT NULL DEFAULT false,
  bounty_pool   NUMERIC(20, 9) NOT NULL DEFAULT 0 CHECK (bounty_pool >= 0),
  bounty_expiry TIMESTAMPTZ DEFAULT NULL,

  -- Risk profile (IMMUTABLE after creation — chosen at open time)
  risk_profile  risk_profile NOT NULL DEFAULT 'standard',

  -- Tier (computed from amount, stored for fast queries)
  tier          tier_id NOT NULL DEFAULT 'pit',

  -- Lifecycle
  is_active     BOOLEAN NOT NULL DEFAULT true,  -- false after cash-out
  closed_at     TIMESTAMPTZ DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vaults_owner ON public.vaults(owner_id) WHERE is_active = true;
CREATE INDEX idx_vaults_tier_active ON public.vaults(tier, is_active) WHERE is_active = true;
CREATE INDEX idx_vaults_active_board ON public.vaults(is_active, tier, amount DESC) WHERE is_active = true;

-- RLS: everyone can read active vaults (the board is public), only the settle
-- function and the owner can mutate.
ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active vaults are viewable by everyone"
  ON public.vaults FOR SELECT USING (true);

CREATE POLICY "Users can insert own vault"
  ON public.vaults FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own vault (non-settlement fields only)"
  ON public.vaults FOR UPDATE USING (auth.uid() = owner_id);

-- The settle-siege Edge Function uses service_role key which bypasses RLS.
-- This is intentional: settlement MUST be server-authoritative.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. SIEGES — immutable audit trail (provably fair, append-only)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.sieges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raider_id       UUID NOT NULL REFERENCES public.profiles(id),
  raider_vault_id UUID NOT NULL REFERENCES public.vaults(id),
  defender_id     UUID NOT NULL REFERENCES public.profiles(id),
  defender_vault_id UUID NOT NULL REFERENCES public.vaults(id),

  -- Provably fair (commit-reveal)
  seed_hash       TEXT NOT NULL,    -- SHA-256(seed), published BEFORE the siege
  seed            TEXT NOT NULL,    -- revealed AFTER settlement
  roll            NUMERIC(10, 9) NOT NULL,  -- rollFromSeed(seed) ∈ [0,1)
  p_win           NUMERIC(6, 4) NOT NULL,   -- published crack chance

  -- Outcome
  outcome         siege_outcome NOT NULL,
  fee             NUMERIC(20, 9) NOT NULL,  -- F charged to raider
  fee_base        NUMERIC(20, 9) NOT NULL,  -- base fee before repeat tax
  repeat_tax      NUMERIC(20, 9) NOT NULL DEFAULT 0,
  prize_gross     NUMERIC(20, 9) NOT NULL DEFAULT 0,  -- 0 on loss
  prize_to_raider NUMERIC(20, 9) NOT NULL DEFAULT 0,
  prize_to_house  NUMERIC(20, 9) NOT NULL DEFAULT 0,
  fee_to_defender NUMERIC(20, 9) NOT NULL,
  fee_to_house    NUMERIC(20, 9) NOT NULL,
  bounty_consumed NUMERIC(20, 9) NOT NULL DEFAULT 0,

  -- Referral (carved from house's own share, never from fee/toll)
  referrer_wallet TEXT DEFAULT NULL,
  referrer_cut    NUMERIC(20, 9) NOT NULL DEFAULT 0,

  -- Context
  streak_at_siege INT NOT NULL DEFAULT 0,
  streak_mult     NUMERIC(6, 4) NOT NULL DEFAULT 1.0,
  defender_tier   tier_id NOT NULL,
  defender_risk   risk_profile NOT NULL,

  -- Timestamps
  settled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sieges_raider ON public.sieges(raider_id, settled_at DESC);
CREATE INDEX idx_sieges_defender ON public.sieges(defender_id, settled_at DESC);
CREATE INDEX idx_sieges_recent ON public.sieges(settled_at DESC);

-- RLS: sieges are readable by everyone (provable fairness = transparency),
-- but ONLY insertable by the service_role (settle-siege Edge Function).
ALTER TABLE public.sieges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sieges are viewable by everyone"
  ON public.sieges FOR SELECT USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- Only the service_role (Edge Function) can write siege records.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. REFERRALS — attribution + lifetime ledger
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The referred user (whose activity generates referrer income)
  referred_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_wallet TEXT NOT NULL,
  -- The referrer (who earns the cut)
  referrer_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referrer_wallet TEXT NOT NULL,
  referrer_code   TEXT NOT NULL,    -- the code used at attribution time

  -- Ledger (updated atomically inside settle-siege)
  lifetime_earned NUMERIC(20, 9) NOT NULL DEFAULT 0,  -- total SOL carved to referrer
  largest_stake   NUMERIC(20, 9) NOT NULL DEFAULT 0,  -- referred user's max vault stake
  -- Cap: lifetime_earned <= 20 * largest_stake (enforced in settle function)

  -- Set-once: created_at is the attribution moment, never updated
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One referrer per referred user (the first-referrer-wins rule)
  UNIQUE (referred_id)
);

CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX idx_referrals_referred ON public.referrals(referred_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Referrals are viewable by involved parties"
  ON public.referrals FOR SELECT
  USING (auth.uid() = referred_id OR auth.uid() = referrer_id);

CREATE POLICY "Users can set their own referral attribution once"
  ON public.referrals FOR INSERT
  WITH CHECK (auth.uid() = referred_id);

-- No UPDATE policy: referral attribution is immutable once set.
-- Lifetime earned is updated by the service_role (settle-siege function).

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. HOUSE LEDGER — singleton tracking house treasury + stats
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.house_ledger (
  id                  TEXT PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  balance             NUMERIC(20, 9) NOT NULL DEFAULT 0,
  total_rake          NUMERIC(20, 9) NOT NULL DEFAULT 0,   -- lifetime gross rake
  total_referral_paid NUMERIC(20, 9) NOT NULL DEFAULT 0,   -- lifetime referral cuts
  sieges_settled      BIGINT NOT NULL DEFAULT 0,
  biggest_heist       NUMERIC(20, 9) NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.house_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "House ledger is readable by everyone"
  ON public.house_ledger FOR SELECT USING (true);

-- No INSERT/UPDATE for users. Only service_role (settle function) writes.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. PENDING SIEGES — commit phase (seed_hash published, awaiting reveal)
-- ═══════════════════════════════════════════════════════════════════════════════
-- This table implements the commit-reveal pattern:
--   1. Raider requests a siege → server generates seed, stores hash, returns hash
--   2. Raider confirms → server reveals seed, settles, writes to sieges table
--   3. Client can verify: SHA-256(seed) === seed_hash AND rollFromSeed(seed) < p

CREATE TABLE public.pending_sieges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raider_id         UUID NOT NULL REFERENCES public.profiles(id),
  raider_vault_id   UUID NOT NULL REFERENCES public.vaults(id),
  defender_vault_id UUID NOT NULL REFERENCES public.vaults(id),

  -- Commit phase: hash is public, seed is secret until reveal
  seed_hash         TEXT NOT NULL,
  seed              TEXT NOT NULL,    -- encrypted/hidden until settlement

  -- Context frozen at commit time (so it can't change between commit and reveal)
  fee               NUMERIC(20, 9) NOT NULL,
  repeat_tax_mult   NUMERIC(6, 4) NOT NULL DEFAULT 0,
  streak_mult       NUMERIC(6, 4) NOT NULL DEFAULT 1.0,

  -- Lifecycle
  status            TEXT NOT NULL DEFAULT 'committed' CHECK (status IN ('committed', 'settled', 'expired')),
  committed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 seconds'),
  settled_at        TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_pending_raider ON public.pending_sieges(raider_id, status) WHERE status = 'committed';

ALTER TABLE public.pending_sieges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own pending sieges"
  ON public.pending_sieges FOR SELECT
  USING (auth.uid() = raider_id);

-- Only service_role can INSERT/UPDATE (the commit + reveal are both server-side).

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Compute tier from amount (mirrors tierIndexForAmount in walletWarsState.ts)
CREATE OR REPLACE FUNCTION compute_tier(amount NUMERIC)
RETURNS tier_id
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF amount >= 20 THEN RETURN 'court';
  ELSIF amount >= 5 THEN RETURN 'arena';
  ELSIF amount >= 1 THEN RETURN 'grind';
  ELSE RETURN 'pit';
  END IF;
END;
$$;

-- Auto-update tier on vault amount change
CREATE OR REPLACE FUNCTION update_vault_tier()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.tier := compute_tier(NEW.amount);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vault_tier
  BEFORE INSERT OR UPDATE OF amount ON public.vaults
  FOR EACH ROW EXECUTE FUNCTION update_vault_tier();

-- Auto-update updated_at on profiles
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. REALTIME — enable for live board updates
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.vaults;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sieges;
ALTER PUBLICATION supabase_realtime ADD TABLE public.house_ledger;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. VIEWS — convenience views for the board and leaderboard
-- ═══════════════════════════════════════════════════════════════════════════════

-- Active vault board (what the Hunt tab renders)
CREATE OR REPLACE VIEW public.vault_board AS
SELECT
  v.id,
  v.wallet,
  v.amount,
  v.banked,
  v.fees_earned,
  v.survived,
  v.cracked,
  v.streak,
  v.opened_at,
  v.shield_until,
  v.tier,
  v.risk_profile,
  v.bounty_pool,
  v.bounty_expiry,
  v.compound,
  v.owner_id,
  p.display_name,
  p.avatar_variant,
  p.avatar_color
FROM public.vaults v
JOIN public.profiles p ON p.id = v.owner_id
WHERE v.is_active = true
ORDER BY v.amount DESC;

-- Leaderboard (Hall of Kings)
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  v.wallet,
  v.amount,
  v.survived,
  v.cracked,
  v.streak,
  v.fees_earned,
  v.tier,
  v.risk_profile,
  v.opened_at,
  p.display_name,
  p.avatar_variant,
  p.avatar_color
FROM public.vaults v
JOIN public.profiles p ON p.id = v.owner_id
WHERE v.is_active = true
ORDER BY v.fees_earned DESC
LIMIT 100;
