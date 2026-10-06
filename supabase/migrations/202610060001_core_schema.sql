-- NaijaPVT production data model.
-- Apply with Supabase CLI after reviewing policies for the deployment.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  phone text,
  role text not null default 'rep' check (role in ('rep', 'reviewer', 'admin')),
  account_status text not null default 'pending' check (account_status in ('pending', 'active', 'suspended')),
  created_at timestamptz not null default now()
);

create table public.states (
  code text primary key,
  name text not null unique
);

create table public.lgas (
  id uuid primary key default gen_random_uuid(),
  state_code text not null references public.states(code),
  code text not null,
  name text not null,
  unique (state_code, code),
  unique (state_code, name)
);

create table public.wards (
  id uuid primary key default gen_random_uuid(),
  lga_id uuid not null references public.lgas(id),
  code text not null,
  name text not null,
  unique (lga_id, code),
  unique (lga_id, name)
);

create table public.polling_units (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references public.wards(id),
  pu_code text not null unique,
  name text not null,
  in_sample boolean not null default false
);

create table public.elections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'planning' check (status in ('planning', 'open', 'closed', 'published')),
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);

create table public.election_parties (
  election_id uuid not null references public.elections(id) on delete restrict,
  party_code text not null,
  party_name text not null,
  sort_order smallint not null default 0,
  primary key (election_id, party_code)
);

create table public.pu_assignments (
  election_id uuid not null references public.elections(id) on delete restrict,
  pu_id uuid not null references public.polling_units(id) on delete restrict,
  rep_id uuid not null references public.profiles(id) on delete restrict,
  rep_slot smallint not null check (rep_slot between 1 and 3),
  assigned_at timestamptz not null default now(),
  primary key (election_id, pu_id, rep_id),
  unique (election_id, pu_id, rep_slot)
);

create index pu_assignments_rep_idx on public.pu_assignments (rep_id, election_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete restrict,
  pu_id uuid not null references public.polling_units(id) on delete restrict,
  rep_id uuid not null references public.profiles(id) on delete restrict,
  accredited_voters integer not null check (accredited_voters >= 0),
  rejected_ballots integer not null check (rejected_ballots >= 0),
  party_votes jsonb not null check (jsonb_typeof(party_votes) = 'object'),
  evidence_key text not null check (length(evidence_key) between 1 and 512),
  evidence_sha256 text check (evidence_sha256 is null or evidence_sha256 ~ '^[a-f0-9]{64}$'),
  submitted_at timestamptz not null default now(),
  unique (election_id, pu_id, rep_id),
  unique (id, election_id, pu_id)
);

create index reports_pu_idx on public.reports (election_id, pu_id, submitted_at);

-- A reviewer resolves a disagreement by selecting one immutable report and recording why.
create table public.pu_resolutions (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete restrict,
  pu_id uuid not null references public.polling_units(id) on delete restrict,
  selected_report_id uuid not null,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  rationale text not null check (length(trim(rationale)) between 10 and 2000),
  resolved_at timestamptz not null default now(),
  unique (election_id, pu_id),
  foreign key (selected_report_id, election_id, pu_id)
    references public.reports(id, election_id, pu_id) on delete restrict
);

create table public.official_result_entries (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete restrict,
  state_code text not null references public.states(code),
  party_code text not null,
  revision integer not null check (revision > 0),
  votes bigint not null check (votes >= 0),
  source_note text,
  entered_by uuid not null references public.profiles(id) on delete restrict,
  entered_at timestamptz not null default now(),
  published_at timestamptz,
  unique (election_id, state_code, party_code, revision),
  foreign key (election_id, party_code)
    references public.election_parties(election_id, party_code) on delete restrict
);

create index official_results_lookup_idx on public.official_result_entries
  (election_id, state_code, party_code, revision desc);

create function public.current_user_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role in ('reviewer', 'admin')
  );
$$;

revoke all on function public.current_user_is_staff() from public;
grant execute on function public.current_user_is_staff() to anon, authenticated;

-- The insert is one transaction. Database constraints, not browser storage,
-- enforce one report per assigned rep and polling unit.
create function public.submit_report(
  p_election_id uuid,
  p_pu_id uuid,
  p_accredited_voters integer,
  p_rejected_ballots integer,
  p_party_votes jsonb,
  p_evidence_key text,
  p_evidence_sha256 text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_status text;
  v_role text;
  v_team_size integer;
  v_party_count integer;
  v_valid_votes bigint;
  v_report_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Sign in is required to submit a report.';
  end if;

  select p.account_status, p.role into v_account_status, v_role
  from public.profiles p where p.id = v_user_id;
  if v_account_status is distinct from 'active' or v_role is distinct from 'rep' then
    raise exception using errcode = '42501', message = 'An active rep account is required.';
  end if;

  if not exists (
    select 1 from public.elections e
    where e.id = p_election_id and e.status = 'open'
      and (e.opens_at is null or e.opens_at <= now())
      and (e.closes_at is null or e.closes_at >= now())
  ) then
    raise exception using errcode = '22023', message = 'This election is not accepting reports.';
  end if;

  select count(*) into v_team_size from public.pu_assignments a
  where a.election_id = p_election_id and a.pu_id = p_pu_id;
  if v_team_size <> 3 or not exists (
    select 1 from public.pu_assignments a
    where a.election_id = p_election_id and a.pu_id = p_pu_id and a.rep_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'You are not on a complete three-rep team for this polling unit.';
  end if;

  if p_accredited_voters is null or p_accredited_voters < 0
     or p_rejected_ballots is null or p_rejected_ballots < 0
     or p_party_votes is null or jsonb_typeof(p_party_votes) <> 'object'
     or p_evidence_key is null or length(trim(p_evidence_key)) = 0 then
    raise exception using errcode = '22023', message = 'Required report fields are missing or invalid.';
  end if;

  if p_evidence_key !~ ('^elections/' || p_election_id::text || '/polling-units/' || p_pu_id::text || '/' || v_user_id::text || '/[0-9a-f-]{36}$') then
    raise exception using errcode = '22023', message = 'Evidence key does not match the assigned report.';
  end if;

  select count(*) into v_party_count from public.election_parties ep
  where ep.election_id = p_election_id;
  if v_party_count = 0 or (select count(*) from jsonb_object_keys(p_party_votes)) <> v_party_count then
    raise exception using errcode = '22023', message = 'Include one vote count for every party in this election.';
  end if;

  if exists (
    select 1 from jsonb_each_text(p_party_votes) v
    left join public.election_parties ep
      on ep.election_id = p_election_id and ep.party_code = v.key
    where ep.party_code is null or v.value !~ '^[0-9]{1,9}$'
  ) then
    raise exception using errcode = '22023', message = 'Party vote counts are invalid.';
  end if;

  select coalesce(sum(v.value::bigint), 0) into v_valid_votes
  from jsonb_each_text(p_party_votes) v;
  if v_valid_votes + p_rejected_ballots > p_accredited_voters then
    raise exception using errcode = '22023', message = 'Votes and rejected ballots exceed accredited voters.';
  end if;

  insert into public.reports (
    election_id, pu_id, rep_id, accredited_voters, rejected_ballots,
    party_votes, evidence_key, evidence_sha256
  ) values (
    p_election_id, p_pu_id, v_user_id, p_accredited_voters, p_rejected_ballots,
    p_party_votes, p_evidence_key, p_evidence_sha256
  ) returning id into v_report_id;

  return v_report_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'This rep has already submitted for this polling unit.';
end;
$$;

revoke all on function public.submit_report(uuid, uuid, integer, integer, jsonb, text, text) from public;
grant execute on function public.submit_report(uuid, uuid, integer, integer, jsonb, text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.states enable row level security;
alter table public.lgas enable row level security;
alter table public.wards enable row level security;
alter table public.polling_units enable row level security;
alter table public.elections enable row level security;
alter table public.election_parties enable row level security;
alter table public.pu_assignments enable row level security;
alter table public.reports enable row level security;
alter table public.pu_resolutions enable row level security;
alter table public.official_result_entries enable row level security;

create policy "Public can read state register" on public.states for select to anon, authenticated using (true);
create policy "Public can read LGA register" on public.lgas for select to anon, authenticated using (true);
create policy "Public can read ward register" on public.wards for select to anon, authenticated using (true);
create policy "Public can read polling unit register" on public.polling_units for select to anon, authenticated using (true);
create policy "Public can read active elections" on public.elections for select to anon, authenticated
  using (status in ('open', 'closed', 'published') or public.current_user_is_staff());
create policy "Public can read active election parties" on public.election_parties for select to anon, authenticated
  using (exists (select 1 from public.elections e where e.id = election_id and e.status in ('open', 'closed', 'published'))
    or public.current_user_is_staff());
create policy "Rep can read own profile and staff can read profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_user_is_staff());
create policy "Rep can read own assignments and staff can read assignments" on public.pu_assignments for select to authenticated
  using (rep_id = auth.uid() or public.current_user_is_staff());
create policy "Rep can read own report and staff can review reports" on public.reports for select to authenticated
  using (rep_id = auth.uid() or public.current_user_is_staff());
create policy "Staff can read resolutions" on public.pu_resolutions for select to authenticated
  using (public.current_user_is_staff());
create policy "Public can read published official entries" on public.official_result_entries for select to anon, authenticated
  using (published_at is not null or public.current_user_is_staff());
create policy "Staff can insert resolutions" on public.pu_resolutions for insert to authenticated
  with check (public.current_user_is_staff() and reviewer_id = auth.uid());
create policy "Staff can insert official entries" on public.official_result_entries for insert to authenticated
  with check (public.current_user_is_staff() and entered_by = auth.uid());

revoke all on public.profiles, public.states, public.lgas, public.wards, public.polling_units,
  public.elections, public.election_parties, public.pu_assignments, public.reports,
  public.pu_resolutions, public.official_result_entries from anon, authenticated;

grant select on public.states, public.lgas, public.wards, public.polling_units,
  public.elections, public.election_parties to anon, authenticated;
grant select on public.profiles, public.pu_assignments, public.reports, public.pu_resolutions,
  public.official_result_entries to authenticated;
grant insert on public.pu_resolutions, public.official_result_entries to authenticated;

-- This view deliberately exposes only three-way matching totals and resolved figures.
-- It never exposes rep identities, individual photos, or private review notes.
create view public.verified_pu_results with (security_invoker = false) as
with agreed as (
  select r.election_id, r.pu_id, r.accredited_voters, r.rejected_ballots, r.party_votes
  from public.reports r
  join public.elections e on e.id = r.election_id and e.status in ('open', 'closed', 'published')
  group by r.election_id, r.pu_id, r.accredited_voters, r.rejected_ballots, r.party_votes
  having count(*) = 3
), selected as (
  select a.election_id, a.pu_id, a.accredited_voters, a.rejected_ballots, a.party_votes, 'matched'::text as verification
  from agreed a
  where not exists (
    select 1 from public.pu_resolutions pr
    where pr.election_id = a.election_id and pr.pu_id = a.pu_id
  )
  union all
  select r.election_id, r.pu_id, r.accredited_voters, r.rejected_ballots, r.party_votes, 'reviewed'::text as verification
  from public.pu_resolutions pr
  join public.reports r on r.id = pr.selected_report_id
  join public.elections e on e.id = r.election_id and e.status in ('open', 'closed', 'published')
)
select s.code as state_code, s.name as state_name,
       l.name as lga_name, w.name as ward_name,
       pu.id as pu_id, pu.pu_code, pu.name as pu_name,
       selected.election_id, selected.accredited_voters,
       selected.rejected_ballots, selected.party_votes,
       selected.verification
from selected
join public.polling_units pu on pu.id = selected.pu_id
join public.wards w on w.id = pu.ward_id
join public.lgas l on l.id = w.lga_id
join public.states s on s.code = l.state_code;

revoke all on public.verified_pu_results from public;
grant select on public.verified_pu_results to anon, authenticated;
