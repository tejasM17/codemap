-- Demo tenants make the organization isolation scenario reproducible locally.
-- These Clerk IDs are local fixtures and are not production organizations.
insert into public.organizations (id, name)
values
  ('org_demo_alpha', 'Northstar Studio'),
  ('org_demo_beta', 'Fieldnotes Labs')
on conflict (id) do update set name = excluded.name;

insert into public.projects (id, organization_id, name, repository_url)
values
  ('10000000-0000-4000-8000-000000000001', 'org_demo_alpha', 'web-client', 'https://github.com/northstar/web-client'),
  ('20000000-0000-4000-8000-000000000001', 'org_demo_beta', 'api-service', 'https://github.com/fieldnotes/api-service')
on conflict (id) do update
set organization_id = excluded.organization_id,
    name = excluded.name,
    repository_url = excluded.repository_url;

insert into public.analyses (id, organization_id, project_id, status, created_at)
values
  ('10000000-0000-4000-8000-000000000002', 'org_demo_alpha', '10000000-0000-4000-8000-000000000001', 'completed', now() - interval '1 day'),
  ('10000000-0000-4000-8000-000000000003', 'org_demo_alpha', '10000000-0000-4000-8000-000000000001', 'running', now()),
  ('20000000-0000-4000-8000-000000000002', 'org_demo_beta', '20000000-0000-4000-8000-000000000001', 'failed', now() - interval '2 hours')
on conflict (id) do update
set organization_id = excluded.organization_id,
    project_id = excluded.project_id,
    status = excluded.status,
    created_at = excluded.created_at;
