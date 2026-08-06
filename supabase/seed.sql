-- YOINK.GG — Seed data for local development
-- This seeds the house ledger with the initial treasury balance.

INSERT INTO public.house_ledger (id, balance, total_rake, total_referral_paid, sieges_settled)
VALUES (
  'singleton',
  0,
  0,
  0,
  0
)
ON CONFLICT (id) DO NOTHING;
