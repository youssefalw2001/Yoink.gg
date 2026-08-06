-- YOINK.GG — Atomic house ledger increment function
-- Called by the settle-siege Edge Function to avoid race conditions.

CREATE OR REPLACE FUNCTION increment_house_ledger(
  rake_amount NUMERIC,
  referral_amount NUMERIC,
  heist_amount NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- runs with the function owner's privileges (bypasses RLS)
AS $$
BEGIN
  UPDATE public.house_ledger
  SET
    balance = balance + rake_amount,
    total_rake = total_rake + rake_amount + referral_amount,
    total_referral_paid = total_referral_paid + referral_amount,
    sieges_settled = sieges_settled + 1,
    biggest_heist = GREATEST(biggest_heist, heist_amount),
    updated_at = now()
  WHERE id = 'singleton';
END;
$$;

-- Only service_role can call this (the settle-siege Edge Function)
REVOKE ALL ON FUNCTION increment_house_ledger FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_house_ledger TO service_role;
