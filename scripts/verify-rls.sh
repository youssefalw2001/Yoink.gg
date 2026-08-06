#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway Postgres and tries to
# exploit the vault RLS hole. Requires Docker. Run: ./scripts/verify-rls.sh
set -u
cd "$(dirname "$0")/.." || exit 1

NAME="ykpg$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1; }
trap cleanup EXIT

docker rm -f "$NAME" >/dev/null 2>&1
if ! docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=yoink postgres:16-alpine >/tmp/run.log 2>&1; then
  echo "FATAL: docker run failed"; cat /tmp/run.log; exit 1
fi
echo "### waiting for postgres ("$NAME")"
READY=0
for i in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
if [ "$READY" != "1" ]; then
  echo "FATAL: postgres never became ready"; docker logs "$NAME" 2>&1 | tail -15; exit 1
fi
docker exec "$NAME" psql -U postgres -d yoink -tAc "select 'pg ' || current_setting('server_version');"

Q() { docker exec -i "$NAME" psql -U postgres -d yoink -v ON_ERROR_STOP=1 "$@"; }

echo ""
echo "### 1. emulate the Supabase auth surface (auth.uid/auth.role, roles, grants)"
Q -q <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public, auth to anon, authenticated, service_role;

-- Hosted Supabase ships this publication for Realtime; 00001 ALTERs it.
do $$ begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
SQL
echo "    auth surface ready"

echo ""
echo "### 2. apply migrations in order"
for m in supabase/migrations/00001_initial_schema.sql \
         supabase/migrations/00002_house_ledger_rpc.sql \
         supabase/migrations/00003_vault_column_guard.sql; do
  # pg_net / pgsodium etc. ship with hosted Supabase but not vanilla Postgres and
  # are irrelevant to the RLS/trigger behaviour under test — drop those lines only.
  if sed -E '/create extension .*(pg_net|pgsodium|pgjwt|pg_graphql|pg_stat_statements|supabase)/Id' "$m" \
      | Q -q -f - >/tmp/mig.log 2>&1; then
    echo "    OK    $(basename "$m")"
  else
    echo "    FAIL  $(basename "$m")"; tail -12 /tmp/mig.log; exit 1
  fi
done

Q -q <<'SQL'
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
SQL

echo ""
echo "### 3. confirm the guard trigger exists"
Q -tAc "select tgname from pg_trigger where tgname='trg_guard_vault_settlement';"

echo ""
echo "### 4. seed a profile + vault owned by our test user"
Q -q <<'SQL'
insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111')
  on conflict do nothing;
insert into public.profiles(id, wallet, display_name)
  values ('11111111-1111-1111-1111-111111111111', 'TESTWALLET1', 'Victim')
  on conflict do nothing;
insert into public.vaults(id, owner_id, wallet, amount, banked, streak)
  values ('22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111', 'TESTWALLET1', 1.0, 0, 0)
  on conflict do nothing;
SQL
Q -tAc "select 'seeded vault amount=' || amount || ' banked=' || banked || ' streak=' || streak from public.vaults;"

echo ""
echo "###############  ATTACK SUITE (as role=authenticated, own vault)  ###############"

attack() {
  local label="$1"; local sql="$2"
  local out
  out=$(docker exec -i "$NAME" psql -U postgres -d yoink -tA 2>&1 <<SQL
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
$sql
commit;
SQL
)
  if echo "$out" | grep -qi "server-authoritative\|insufficient_privilege\|ERROR"; then
    echo "    BLOCKED  $label"
  else
    echo "    !! ALLOWED !!  $label   <-- VULNERABLE"
  fi
}

attack "mint corpus         (amount = 1000000)" "update public.vaults set amount = 1000000 where id='22222222-2222-2222-2222-222222222222';"
attack "mint banked fees    (banked = 500)"     "update public.vaults set banked = 500 where id='22222222-2222-2222-2222-222222222222';"
attack "pin max streak      (streak = 25)"      "update public.vaults set streak = 25 where id='22222222-2222-2222-2222-222222222222';"
attack "permanent shield    (shield_until)"     "update public.vaults set shield_until = now() + interval '10 years' where id='22222222-2222-2222-2222-222222222222';"
attack "defeat concurrency  (seq = 9999)"       "update public.vaults set seq = 9999 where id='22222222-2222-2222-2222-222222222222';"
attack "forge lifetime tolls(fees_earned)"      "update public.vaults set fees_earned = 999 where id='22222222-2222-2222-2222-222222222222';"
attack "forge survival      (survived = 500)"   "update public.vaults set survived = 500 where id='22222222-2222-2222-2222-222222222222';"
# NOTE: the vault is seeded is_active=true, so flipping it to true is a NO-OP and
# the trigger correctly permits it (nothing changed). To actually test resurrection
# we must first close the vault as service_role, THEN try to reopen it as the user.
docker exec -i "$NAME" psql -U postgres -d yoink -q >/dev/null 2>&1 <<'SQL'
set role service_role;
set request.jwt.claim.role = 'service_role';
update public.vaults set is_active = false, closed_at = now()
  where id='22222222-2222-2222-2222-222222222222';
SQL
attack "resurrect CLOSED    (is_active false->true)" "update public.vaults set is_active = true, closed_at = null where id='22222222-2222-2222-2222-222222222222';"
docker exec -i "$NAME" psql -U postgres -d yoink -q >/dev/null 2>&1 <<'SQL'
set role service_role;
set request.jwt.claim.role = 'service_role';
update public.vaults set is_active = true, closed_at = null
  where id='22222222-2222-2222-2222-222222222222';
SQL
> /dev/null
# A no-op write (`amount = amount`) changes nothing, so the trigger permits it.
# That is correct — no money moves — and is asserted separately below rather than
# in the attack suite, where an "allowed" line would read as a vulnerability.
echo ""
echo "###############  BENIGN NO-OP (must be permitted, moves no money)  ###############"
allow_noop_out=$(docker exec -i "$NAME" psql -U postgres -d yoink -tA 2>&1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
update public.vaults set amount = amount where id='22222222-2222-2222-2222-222222222222';
commit;
SQL
)
if echo "$allow_noop_out" | grep -qi ERROR; then
  echo "    unexpectedly blocked a no-op write"
else
  echo "    ALLOWED  amount = amount (identity write, no state change)"
fi
attack "steal someone's vault (owner_id)"       "update public.vaults set owner_id='11111111-1111-1111-1111-111111111111', wallet='OTHER' where id='22222222-2222-2222-2222-222222222222';"
attack "jump tier           (tier = 'court')"   "update public.vaults set tier = 'court' where id='22222222-2222-2222-2222-222222222222';"
attack "mint bounty         (bounty_pool = 50)" "update public.vaults set bounty_pool = 50 where id='22222222-2222-2222-2222-222222222222';"

echo ""
echo "###############  LEGITIMATE CLIENT WRITES (must still work)  ###############"
allow() {
  local label="$1"; local sql="$2"
  local out
  out=$(docker exec -i "$NAME" psql -U postgres -d yoink -tA 2>&1 <<SQL
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
$sql
commit;
SQL
)
  if echo "$out" | grep -qi "ERROR"; then
    echo "    !! BROKEN !!  $label"; echo "$out" | grep -i error | head -2
  else
    echo "    ALLOWED  $label"
  fi
}
allow "toggle compound"          "update public.vaults set compound = true where id='22222222-2222-2222-2222-222222222222';"
allow "switch risk profile"      "update public.vaults set risk_profile='exposed' where id='22222222-2222-2222-2222-222222222222';"
allow "update own display_name"  "update public.profiles set display_name='Renamed' where id='11111111-1111-1111-1111-111111111111';"

echo ""
echo "###############  SERVICE ROLE (Edge Function) MUST still settle  ###############"
out=$(docker exec -i "$NAME" psql -U postgres -d yoink -tA 2>&1 <<'SQL'
begin;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
update public.vaults set amount = 2.5, banked = 0.1, streak = 3, seq = 1
  where id='22222222-2222-2222-2222-222222222222';
commit;
SQL
)
if echo "$out" | grep -qi "ERROR"; then
  echo "    !! BROKEN !!  service_role settlement was blocked"; echo "$out" | grep -i error | head -3
else
  echo "    ALLOWED  service_role settled the vault"
fi
docker exec "$NAME" psql -U postgres -d yoink -tAc "select '    final state: amount=' || amount || ' banked=' || banked || ' streak=' || streak || ' compound=' || compound || ' profile=' || risk_profile from public.vaults;"

echo ""
echo "###############  REFERRAL CAP-BASIS GUARD  ###############"
Q -q <<'SQL'
insert into auth.users(id) values ('33333333-3333-3333-3333-333333333333') on conflict do nothing;
insert into public.profiles(id, wallet) values ('33333333-3333-3333-3333-333333333333','REFERRERWALLET') on conflict do nothing;
SQL
out=$(docker exec -i "$NAME" psql -U postgres -d yoink -tA 2>&1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';
insert into public.referrals(referred_id, referred_wallet, referrer_id, referrer_wallet, referrer_code, lifetime_earned, largest_stake)
values ('11111111-1111-1111-1111-111111111111','TESTWALLET1','33333333-3333-3333-3333-333333333333','REFERRERWALLET','LORD-X', 9999, 1000000);
commit;
SQL
)
echo "$out" | grep -i error | head -2
docker exec "$NAME" psql -U postgres -d yoink -tAc "select '    stored: lifetime_earned=' || lifetime_earned || ' largest_stake=' || largest_stake || '  (attacker asked for 9999 / 1000000)' from public.referrals;"

echo ""
echo "### cleanup"
docker rm -f "$NAME" >/dev/null 2>&1 && echo "    container removed"
