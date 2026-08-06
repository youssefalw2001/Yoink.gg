-- YOINK.GG — 00003: make vault settlement columns server-authoritative
--
-- ── THE VULNERABILITY THIS CLOSES ────────────────────────────────────────────
--
-- 00001 created this policy:
--
--   CREATE POLICY "Users can update own vault (non-settlement fields only)"
--     ON public.vaults FOR UPDATE USING (auth.uid() = owner_id);
--
-- The policy NAME promises a column restriction, but Postgres row-level security
-- cannot restrict columns — RLS decides which ROWS are visible/writable, never
-- which fields. With no WITH CHECK, no column-level GRANT and no trigger, any
-- authenticated user could PATCH /rest/v1/vaults on their own row and set:
--
--   amount        → mint corpus out of nothing
--   banked        → mint withdrawable fees
--   fees_earned   → forge lifetime-toll leaderboard standing
--   survived      → forge survival records
--   streak        → pin the max 2× fee multiplier so raiders are overcharged
--   shield_until  → become permanently un-siegeable while still earning tolls
--   seq           → defeat the optimistic-concurrency check in settle-siege
--   is_active     → resurrect a cashed-out vault
--
-- The only existing guards are CHECK (… >= 0), which stop negatives and nothing
-- else. Because `amount` and `banked` are SOL-denominated, this is a direct
-- balance-forgery hole the moment escrow is enabled, and it destroys leaderboard
-- integrity even in the simulated economy.
--
-- ── THE FIX ──────────────────────────────────────────────────────────────────
--
-- A BEFORE UPDATE trigger. Triggers still fire for the service_role (which
-- bypasses RLS, not triggers), so this is enforced for every writer and the
-- Edge Functions are allowed through explicitly.
--
-- Clients keep exactly the mutations they legitimately own: `compound`,
-- `risk_profile`, and cosmetic-free-but-harmless `bounty_expiry` is NOT included
-- because bounty_pool is money. Everything money- or settlement-shaped is
-- server-only.

-- ── Guard function ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_vault_settlement_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  jwt_role TEXT;
BEGIN
  -- The Edge Functions authenticate with the service_role key and are the only
  -- writers permitted to move money. `auth.role()` reads the JWT role claim;
  -- fall back to the connected Postgres role for direct/service connections.
  BEGIN
    jwt_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  IF COALESCE(jwt_role, current_user) = 'service_role' OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Any client-side UPDATE must leave every settlement column untouched.
  IF NEW.amount        IS DISTINCT FROM OLD.amount
     OR NEW.banked       IS DISTINCT FROM OLD.banked
     OR NEW.fees_earned  IS DISTINCT FROM OLD.fees_earned
     OR NEW.survived     IS DISTINCT FROM OLD.survived
     OR NEW.cracked      IS DISTINCT FROM OLD.cracked
     OR NEW.streak       IS DISTINCT FROM OLD.streak
     OR NEW.shield_until IS DISTINCT FROM OLD.shield_until
     OR NEW.seq          IS DISTINCT FROM OLD.seq
     OR NEW.bounty_pool  IS DISTINCT FROM OLD.bounty_pool
     OR NEW.tier         IS DISTINCT FROM OLD.tier
     OR NEW.is_active    IS DISTINCT FROM OLD.is_active
     OR NEW.closed_at    IS DISTINCT FROM OLD.closed_at
     OR NEW.owner_id     IS DISTINCT FROM OLD.owner_id
     OR NEW.wallet       IS DISTINCT FROM OLD.wallet
     OR NEW.opened_at    IS DISTINCT FROM OLD.opened_at
  THEN
    RAISE EXCEPTION
      'vaults: settlement columns are server-authoritative (use the settle-siege / vault Edge Functions)'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_vault_settlement_columns() IS
  'Blocks client-side writes to money/settlement columns on public.vaults. RLS cannot restrict columns, so this trigger does. service_role (Edge Functions) is exempt.';

DROP TRIGGER IF EXISTS trg_guard_vault_settlement ON public.vaults;
CREATE TRIGGER trg_guard_vault_settlement
  BEFORE UPDATE ON public.vaults
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_vault_settlement_columns();

-- ── Rename the misleading policy ─────────────────────────────────────────────
-- The old name asserted a guarantee the SQL did not implement. Now that the
-- trigger actually enforces it, make the name honest and point at the trigger.
DROP POLICY IF EXISTS "Users can update own vault (non-settlement fields only)" ON public.vaults;

CREATE POLICY "Owners may update own vault; settlement columns blocked by trigger"
  ON public.vaults FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);   -- also stops re-assigning the row to someone else

-- ── Referral cap basis is server-owned too ───────────────────────────────────
-- `referrals.largest_stake` is the basis for the 20× lifetime referral cap. The
-- INSERT policy lets the referred user create their own row, so they could seed
-- an arbitrarily large `largest_stake` and hand their referrer an effectively
-- uncapped claim on house rake. Force it to start at zero; settle-siege raises it
-- from observed vault stakes.
CREATE OR REPLACE FUNCTION public.guard_referral_cap_basis()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  jwt_role TEXT;
BEGIN
  BEGIN
    jwt_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  IF COALESCE(jwt_role, current_user) = 'service_role' OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- A client-created attribution row starts with an empty ledger.
  NEW.lifetime_earned := 0;
  NEW.largest_stake   := 0;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_referral_cap_basis() IS
  'Zeroes client-supplied referral ledger fields on INSERT so a referred user cannot inflate their referrer''s 20x cap basis. service_role is exempt.';

DROP TRIGGER IF EXISTS trg_guard_referral_cap_basis ON public.referrals;
CREATE TRIGGER trg_guard_referral_cap_basis
  BEFORE INSERT ON public.referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_referral_cap_basis();
