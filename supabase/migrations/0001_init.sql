-- YOINK.GG — initial schema (v1)
--
-- IDENTITY MODEL: the Solana wallet address is the primary key. Players connect
-- a wallet (no email/password) so everything keys on the base58 address.
--
-- SECURITY MODEL (important — this is gambling-adjacent data):
--   - Leaderboards / profiles / stats are PUBLICLY READABLE.
--   - Writes are NOT allowed from the browser (anon/authenticated roles get no
--     insert/update policy). Scores, balances and payouts must be written by a
--     TRUSTED server or Supabase Edge Function using the service role, which
--     bypasses RLS. This prevents a player from forging wins from the client.
--
-- Apply via the Supabase MCP (apply_migration) once the connection is live.

-- ── players ───────────────────────────────────────────────────────────────────
create table if not exists public.players (
  wallet          text primary key,
  display_name    text,
  avatar_variant  smallint,
  avatar_color    text,
  xp              bigint        not null default 0,
  total_yoinks    integer       not null default 0,
  total_wins      integer       not null default 0,
  total_sol_won   numeric(20,9) not null default 0,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

-- ── bag_results — The Bag round payouts (king / podium / held pool / jackpot) ──
create table if not exists public.bag_results (
  id        bigint generated always as identity primary key,
  round     integer       not null,
  wallet    text          not null references public.players(wallet) on delete cascade,
  sol_won   numeric(20,9) not null default 0,
  tier      text,                       -- 'king' | 'runnerup' | 'podium' | 'held' | 'jackpot'
  held_for  integer,                    -- seconds held this round
  won_at    timestamptz   not null default now()
);
create index if not exists bag_results_wallet_idx on public.bag_results (wallet);
create index if not exists bag_results_won_at_idx on public.bag_results (won_at desc);

-- ── wallet_wars_stats — flagship PvP aggregates per wallet ─────────────────────
create table if not exists public.wallet_wars_stats (
  wallet         text          primary key references public.players(wallet) on delete cascade,
  raids_won      integer       not null default 0,
  raids_lost     integer       not null default 0,
  total_banked   numeric(20,9) not null default 0,
  biggest_heist  numeric(20,9) not null default 0,
  updated_at     timestamptz   not null default now()
);

-- ── auto-maintain updated_at ───────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists players_set_updated_at on public.players;
create trigger players_set_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

drop trigger if exists ww_stats_set_updated_at on public.wallet_wars_stats;
create trigger ww_stats_set_updated_at
  before update on public.wallet_wars_stats
  for each row execute function public.set_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────────────
alter table public.players           enable row level security;
alter table public.bag_results       enable row level security;
alter table public.wallet_wars_stats enable row level security;

-- Public read access (leaderboards & profiles are meant to be seen).
create policy "public read players"   on public.players           for select using (true);
create policy "public read bag"       on public.bag_results       for select using (true);
create policy "public read ww stats"  on public.wallet_wars_stats for select using (true);

-- NOTE: intentionally NO insert/update/delete policies for anon/authenticated.
-- All writes go through the service role (trusted server / edge function) so
-- the browser can never forge scores, payouts, or balances.
