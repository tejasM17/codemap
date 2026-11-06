-- Clerk organization identifiers appear as a top level org_id in custom
-- claims and as o.id in standard session tokens. Accept either signed claim.
drop policy if exists organizations_active_org on public.organizations;
create policy organizations_active_org on public.organizations
  for all to authenticated
  using (id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')))
  with check (id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')));

drop policy if exists projects_active_org on public.projects;
create policy projects_active_org on public.projects
  for all to authenticated
  using (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')))
  with check (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')));

drop policy if exists analyses_active_org on public.analyses;
create policy analyses_active_org on public.analyses
  for all to authenticated
  using (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')))
  with check (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')));

drop policy if exists files_active_org on public.files;
create policy files_active_org on public.files
  for all to authenticated
  using (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')))
  with check (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')));

drop policy if exists edges_active_org on public.edges;
create policy edges_active_org on public.edges
  for all to authenticated
  using (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')))
  with check (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')));

drop policy if exists routes_active_org on public.routes;
create policy routes_active_org on public.routes
  for all to authenticated
  using (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')))
  with check (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')));

drop policy if exists explanations_active_org on public.explanations;
create policy explanations_active_org on public.explanations
  for all to authenticated
  using (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')))
  with check (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')));

drop policy if exists file_roles_active_org on public.file_roles;
create policy file_roles_active_org on public.file_roles
  for all to authenticated
  using (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')))
  with check (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')));

drop policy if exists insights_active_org on public.insights;
create policy insights_active_org on public.insights
  for all to authenticated
  using (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')))
  with check (organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id')));

drop policy if exists analysis_progress_channel_access on realtime.messages;
create policy analysis_progress_channel_access
  on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) ~ '^analysis:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.analyses as analysis
      where analysis.id::text = substring((select realtime.topic()) from 10)
        and analysis.organization_id = coalesce((select auth.jwt() ->> 'org_id'), (select auth.jwt() -> 'o' ->> 'id'))
    )
  );

-- The edge insert helper is invoker-scoped, so normal RLS policies apply.
revoke all on function public.insert_analysis_edges(text, uuid, jsonb) from public, anon, service_role;
grant execute on function public.insert_analysis_edges(text, uuid, jsonb) to authenticated;
