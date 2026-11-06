-- =============================================================================
-- CaminoPlus 13: data audit (quality of stays, cafes, churches, sites)
--
-- tools/poi-audit cross-checks OpenStreetMap, Overture, Wikidata and Commons
-- and produces findings ("possible duplicate", "Overture says closed",
-- "photo licence not allowed", ...). They land here for a human to review.
--
-- Verification ladder shown in the app (strongest first):
--   owner       the business owner confirmed the details (business_owners flow)
--   pilgrim     recent pilgrim reports agree (crowd_reports / reviews)
--   editor      a CaminoPlus editor checked it by hand
--   data_check  the audit found the open data sources agree (NOT a visit)
--   unverified
-- A data check never says a place is open or clean; only owners and pilgrims can.
--
-- Route-agnostic: findings point at a source record key, plus the stay / POI
-- row when it exists. Nothing here is Camino specific.
-- =============================================================================

create table public.data_audit_runs (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null,                    -- 'stage:camino-frances-01', 'route:via-francigena', ...
  tool_version text,
  sources     jsonb not null default '{}',      -- per source: ok / failed / skipped + counts
  stats       jsonb not null default '{}',
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table public.data_audit_findings (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid references public.data_audit_runs (id) on delete set null,
  entity_key    text not null,                  -- 'osm:node/123', 'overture:<uuid>', 'wikidata:Q123'
  stay_id       uuid references public.stays (id) on delete cascade,
  poi_id        uuid references public.pois (id) on delete cascade,
  code          text not null,                  -- DUPLICATE, CLOSED_SIGNAL, PHOTO_LICENCE, ...
  severity      text not null check (severity in ('high', 'medium', 'low', 'info')),
  message       text not null,
  details       jsonb not null default '{}',
  priority      integer not null default 0,
  status        text not null default 'open'
                  check (status in ('open', 'accepted', 'fixed', 'rejected', 'wont_fix')),
  review_note   text,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (entity_key, code)                     -- one row per issue, refreshed by each run
);
create index data_audit_findings_queue_idx on public.data_audit_findings (status, priority desc);
create index data_audit_findings_stay_idx on public.data_audit_findings (stay_id) where stay_id is not null;
create index data_audit_findings_poi_idx on public.data_audit_findings (poi_id) where poi_id is not null;

create trigger data_audit_findings_touch before update on public.data_audit_findings
  for each row execute function private.touch_row();

-- Team-only tables: no client policies, service role (admin tool / CI) only.
alter table public.data_audit_runs enable row level security;
alter table public.data_audit_findings enable row level security;
revoke all on public.data_audit_runs, public.data_audit_findings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Confidence + verification on the things the app shows
-- ---------------------------------------------------------------------------
alter table public.stays
  add column data_confidence    smallint check (data_confidence between 0 and 100),
  add column verification_level text not null default 'unverified'
    check (verification_level in ('owner', 'pilgrim', 'editor', 'data_check', 'unverified')),
  add column data_checked_at    timestamptz;
-- stays.verified_at (existing) = last owner / pilgrim / editor verification.

alter table public.pois
  add column data_confidence    smallint check (data_confidence between 0 and 100),
  add column verification_level text not null default 'unverified'
    check (verification_level in ('owner', 'pilgrim', 'editor', 'data_check', 'unverified')),
  add column data_checked_at    timestamptz,
  add column verified_at        timestamptz,
  add column wikidata_id        text,
  -- AI-drafted description waiting for an editor: {text, sources[], model, unsure[]}
  add column description_draft  jsonb,
  -- photo licence, so the app can always show attribution
  add column image_license      text,
  add column image_attribution  text,
  add column image_source_url   text;

alter table public.stay_photos
  add column license    text,
  add column source_url text;

-- Clients must not be able to set their own trust level.
create trigger stays_guard_verification before insert or update on public.stays
  for each row execute function private.guard_columns(
    '{"data_confidence": null, "verification_level": "unverified", "data_checked_at": null}');
create trigger pois_guard_verification before insert or update on public.pois
  for each row execute function private.guard_columns(
    '{"data_confidence": null, "verification_level": "unverified", "data_checked_at": null, "verified_at": null, "description_draft": null}');

-- The label the app shows under a place name.
create or replace function public.verification_label(p_level text, p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_level
    when 'owner'      then 'Verified by owner'
    when 'pilgrim'    then 'Confirmed by pilgrims'
    when 'editor'     then 'Checked by CaminoPlus'
    when 'data_check' then 'Data cross-checked'
    else 'Not verified yet'
  end || case when p_at is null or p_level = 'unverified' then '' else ' · ' || to_char(p_at, 'Mon YYYY') end;
$$;
grant execute on function public.verification_label(text, timestamptz) to anon, authenticated;
