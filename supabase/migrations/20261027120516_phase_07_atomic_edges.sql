create or replace function public.insert_analysis_edges(
  p_organization_id text,
  p_analysis_id uuid,
  p_edges jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  expected_count integer;
  inserted_count integer;
begin
  if jsonb_typeof(p_edges) <> 'array' then
    raise exception 'Edges must be provided as a JSON array.' using errcode = '22023';
  end if;

  select count(*) into expected_count
  from jsonb_array_elements(p_edges) as edge(value);

  if exists (
    select 1
    from jsonb_array_elements(p_edges) as edge(value)
    left join public.files as source_file
      on source_file.organization_id = p_organization_id
      and source_file.analysis_id = p_analysis_id
      and source_file.path = edge.value->>'from_path'
    left join public.files as target_file
      on target_file.organization_id = p_organization_id
      and target_file.analysis_id = p_analysis_id
      and target_file.path = edge.value->>'to_path'
    where source_file.id is null
      or target_file.id is null
      or source_file.id = target_file.id
  ) then
    raise exception 'An edge endpoint does not match a distinct stored file for this analysis.' using errcode = '23503';
  end if;

  insert into public.edges (
    organization_id,
    analysis_id,
    source_file_id,
    target_file_id,
    kind,
    specifier,
    is_type_only
  )
  select
    p_organization_id,
    p_analysis_id,
    source_file.id,
    target_file.id,
    edge.value->>'kind',
    edge.value->>'specifier',
    (edge.value->>'is_type_only')::boolean
  from jsonb_array_elements(p_edges) as edge(value)
  join public.files as source_file
    on source_file.organization_id = p_organization_id
    and source_file.analysis_id = p_analysis_id
    and source_file.path = edge.value->>'from_path'
  join public.files as target_file
    on target_file.organization_id = p_organization_id
    and target_file.analysis_id = p_analysis_id
    and target_file.path = edge.value->>'to_path';

  get diagnostics inserted_count = row_count;
  if inserted_count <> expected_count then
    raise exception 'Stored % of % requested edges.', inserted_count, expected_count using errcode = '23503';
  end if;
  return inserted_count;
end;
$$;

revoke all on function public.insert_analysis_edges(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_analysis_edges(text, uuid, jsonb) to service_role;
