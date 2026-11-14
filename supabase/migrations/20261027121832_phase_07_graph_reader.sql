alter table public.analyses
  add column files_found integer check (files_found is null or files_found >= 0),
  add column files_parsed integer check (files_parsed is null or files_parsed >= 0),
  add column files_skipped integer check (files_skipped is null or files_skipped >= 0);

update public.analyses as analysis
set files_parsed = (
      select count(*)::integer from public.files as file
      where file.organization_id = analysis.organization_id and file.analysis_id = analysis.id
    ),
    files_skipped = jsonb_array_length(analysis.skipped_files),
    files_found = (
      select count(*)::integer from public.files as file
      where file.organization_id = analysis.organization_id and file.analysis_id = analysis.id
    ) + jsonb_array_length(analysis.skipped_files)
where analysis.parser_schema_version is not null;

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
        'entryPointReason', file.entry_point_reason
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

revoke all on function public.get_analysis_graph(uuid) from public, anon;
grant execute on function public.get_analysis_graph(uuid) to authenticated;
