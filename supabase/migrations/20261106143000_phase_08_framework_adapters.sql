alter table public.analyses
  add column framework text not null default 'generic'
    check (framework in ('next', 'nestjs', 'react', 'generic')),
  add column routes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(routes) = 'array');

alter table public.files
  add column role text not null default 'Files';

-- Older analyses have no trustworthy framework or route extraction data.
update public.analyses
set parser_schema_version = 3
where parser_schema_version = 2;

create or replace function public.get_analysis_graph(p_analysis_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with selected_analysis as (
    select
      analysis.id,
      analysis.organization_id,
      analysis.parser_schema_version,
      analysis.files_found,
      analysis.files_parsed,
      analysis.files_skipped,
      analysis.coverage,
      analysis.skipped_files,
      analysis.framework,
      analysis.routes,
      project.name as repository_name
    from public.analyses as analysis
    join public.projects as project
      on project.organization_id = analysis.organization_id
      and project.id = analysis.project_id
    where analysis.id = p_analysis_id
  ), file_data as (
    select
      file.organization_id,
      file.analysis_id,
      jsonb_agg(jsonb_build_object(
        'path', file.path,
        'module', file.module,
        'extension', file.extension,
        'lines', file.lines,
        'hash', file.content_hash,
        'fanIn', file.fan_in,
        'fanOut', file.fan_out,
        'entryPointReason', file.entry_point_reason,
        'role', file.role
      ) order by file.path) as files,
      count(*)::integer as file_count
    from public.files as file
    where file.analysis_id = p_analysis_id
    group by file.organization_id, file.analysis_id
  ), edge_data as (
    select
      edge.organization_id,
      edge.analysis_id,
      jsonb_agg(jsonb_build_object(
        'from', source_file.path,
        'to', target_file.path,
        'kind', edge.kind,
        'specifier', edge.specifier,
        'isTypeOnly', edge.is_type_only
      ) order by source_file.path, target_file.path, edge.kind, edge.specifier) as edges
    from public.edges as edge
    join public.files as source_file
      on source_file.organization_id = edge.organization_id
      and source_file.analysis_id = edge.analysis_id
      and source_file.id = edge.source_file_id
    join public.files as target_file
      on target_file.organization_id = edge.organization_id
      and target_file.analysis_id = edge.analysis_id
      and target_file.id = edge.target_file_id
    where edge.analysis_id = p_analysis_id
    group by edge.organization_id, edge.analysis_id
  )
  select jsonb_build_object(
    'schemaVersion', selected_analysis.parser_schema_version,
    'framework', selected_analysis.framework,
    'routes', selected_analysis.routes,
    'root', selected_analysis.repository_name,
    'filesFound', coalesce(selected_analysis.files_found, coalesce(file_data.file_count, 0) + jsonb_array_length(selected_analysis.skipped_files)),
    'filesParsed', coalesce(selected_analysis.files_parsed, coalesce(file_data.file_count, 0)),
    'filesSkipped', coalesce(selected_analysis.files_skipped, jsonb_array_length(selected_analysis.skipped_files)),
    'files', coalesce(file_data.files, '[]'::jsonb),
    'edges', coalesce(edge_data.edges, '[]'::jsonb),
    'coverage', selected_analysis.coverage,
    'skipped', selected_analysis.skipped_files
  )
  from selected_analysis
  left join file_data on file_data.organization_id = selected_analysis.organization_id and file_data.analysis_id = selected_analysis.id
  left join edge_data on edge_data.organization_id = selected_analysis.organization_id and edge_data.analysis_id = selected_analysis.id;
$$;
