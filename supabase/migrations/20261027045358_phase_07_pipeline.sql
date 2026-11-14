-- Persist parser output and enough run state for a server-side pipeline.
-- Remove the old empty demo analyses for these repositories before enforcing
-- the one-analysis-per-project rule. Their projects are removed below too.
delete from public.analyses a
using public.projects p
where p.organization_id = a.organization_id
  and p.id = a.project_id
  and p.repository_url in (
    'https://github.com/tailwindlabs/tailwindcss',
    'https://github.com/vercel/next.js',
    'https://github.com/shadcn-ui/ui'
  )
  and a.status = 'queued'
  and not exists (
    select 1 from public.files f where f.organization_id = a.organization_id and f.analysis_id = a.id
  );

delete from public.projects p
where p.repository_url in (
    'https://github.com/tailwindlabs/tailwindcss',
    'https://github.com/vercel/next.js',
    'https://github.com/shadcn-ui/ui'
  )
  and not exists (
    select 1 from public.analyses a where a.organization_id = p.organization_id and a.project_id = p.id
  );

alter table public.analyses
  add column commit_sha text,
  add column stage text not null default 'queued'
    check (stage in ('queued', 'fetching', 'selecting', 'parsing', 'storing', 'completed', 'failed')),
  add column stage_message text not null default 'Waiting to start.',
  add column failed_stage text,
  add column coverage jsonb not null default '{}'::jsonb,
  add column skipped_files jsonb not null default '[]'::jsonb,
  add column parser_schema_version integer;

alter table public.analyses
  add constraint analyses_one_per_project unique (organization_id, project_id);

alter table public.files
  add column module text not null default '.',
  add column extension text not null default '',
  add column lines integer not null default 0 check (lines >= 0),
  add column fan_in integer not null default 0 check (fan_in >= 0),
  add column fan_out integer not null default 0 check (fan_out >= 0),
  add column entry_point_reason text;

alter table public.edges
  add column specifier text not null default '',
  add column is_type_only boolean not null default false;

create index files_analysis_id_idx on public.files (analysis_id);
create index edges_analysis_id_idx on public.edges (analysis_id);
