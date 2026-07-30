create table prospects (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  website text,
  contact_name text,
  contact_role text,
  stage text default 'discovery',
  deal_health text default 'unknown',
  memory jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  meeting_type text not null,
  rep_name text default 'Rep',
  scheduled_at timestamptz,
  status text default 'upcoming',
  triage_verdict text,
  triage_reason text,
  brief jsonb,
  raw_notes text,
  extracted jsonb,
  created_at timestamptz default now()
);

create index meetings_prospect_id_idx on meetings(prospect_id);
create unique index prospects_company_name_lower_idx on prospects (lower(company_name));
