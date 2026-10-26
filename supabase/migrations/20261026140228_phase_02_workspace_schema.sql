-- Organizations are managed by Clerk. Keep their stable Clerk ID in Postgres
-- so every application row can have a real foreign key to its tenant.
create table public.organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  name text not null,
  repository_url text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, repository_url)
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references public.projects(organization_id, id) on delete cascade
);

create index analyses_organization_created_at_idx
  on public.analyses (organization_id, created_at desc);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null,
  path text not null,
  language text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  content_hash text,
  created_at timestamptz not null default now(),
  unique (organization_id, analysis_id, id),
  unique (organization_id, analysis_id, path),
  foreign key (organization_id, analysis_id)
    references public.analyses(organization_id, id) on delete cascade
);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null,
  source_file_id uuid not null,
  target_file_id uuid not null,
  kind text not null default 'import',
  created_at timestamptz not null default now(),
  foreign key (organization_id, analysis_id)
    references public.analyses(organization_id, id) on delete cascade,
  foreign key (organization_id, analysis_id, source_file_id)
    references public.files(organization_id, analysis_id, id) on delete cascade,
  foreign key (organization_id, analysis_id, target_file_id)
    references public.files(organization_id, analysis_id, id) on delete cascade,
  check (source_file_id <> target_file_id)
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  method text not null,
  path text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, analysis_id)
    references public.analyses(organization_id, id) on delete cascade,
  foreign key (organization_id, analysis_id, file_id)
    references public.files(organization_id, analysis_id, id) on delete cascade,
  unique (organization_id, analysis_id, method, path)
);

create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  content text not null,
  model text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, analysis_id)
    references public.analyses(organization_id, id) on delete cascade,
  foreign key (organization_id, analysis_id, file_id)
    references public.files(organization_id, analysis_id, id) on delete cascade
);

create table public.file_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  role text not null,
  source text not null default 'inferred',
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  created_at timestamptz not null default now(),
  foreign key (organization_id, analysis_id)
    references public.analyses(organization_id, id) on delete cascade,
  foreign key (organization_id, analysis_id, file_id)
    references public.files(organization_id, analysis_id, id) on delete cascade,
  unique (organization_id, analysis_id, file_id)
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null,
  kind text not null,
  title text not null,
  description text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (organization_id, analysis_id)
    references public.analyses(organization_id, id) on delete cascade
);

-- RLS protects all rows by the trusted Clerk org_id token claim. Requiring
-- authenticated callers also blocks anonymous access at the policy layer.
alter table public.organizations enable row level security;
alter table public.projects enable row level security;
alter table public.analyses enable row level security;
alter table public.files enable row level security;
alter table public.edges enable row level security;
alter table public.routes enable row level security;
alter table public.explanations enable row level security;
alter table public.file_roles enable row level security;
alter table public.insights enable row level security;

revoke all on public.organizations, public.projects, public.analyses, public.files,
  public.edges, public.routes, public.explanations, public.file_roles, public.insights
  from anon;
grant select, insert, update, delete on public.organizations, public.projects,
  public.analyses, public.files, public.edges, public.routes, public.explanations,
  public.file_roles, public.insights to authenticated;

create policy organizations_active_org on public.organizations
  for all to authenticated
  using (id = (select auth.jwt() ->> 'org_id'))
  with check (id = (select auth.jwt() ->> 'org_id'));

create policy projects_active_org on public.projects
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy analyses_active_org on public.analyses
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy files_active_org on public.files
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy edges_active_org on public.edges
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy routes_active_org on public.routes
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy explanations_active_org on public.explanations
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy file_roles_active_org on public.file_roles
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy insights_active_org on public.insights
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));
