-- A private channel is available only for analysis topics that belong to the
-- organization claim in the subscriber's Clerk token.
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
        and analysis.organization_id = (select auth.jwt() ->> 'org_id')
    )
  );

create or replace function public.broadcast_analysis_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.stage is not distinct from old.stage
    and new.stage_message is not distinct from old.stage_message then
    return new;
  end if;

  perform realtime.send(
    jsonb_build_object('stage', new.stage, 'message', new.stage_message),
    'stage',
    'analysis:' || new.id::text,
    true
  );
  return new;
end;
$$;

revoke all on function public.broadcast_analysis_stage() from public, anon, authenticated;

create trigger analyses_broadcast_stage
  after insert or update of stage, stage_message on public.analyses
  for each row execute function public.broadcast_analysis_stage();
