begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'member@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'outsider@example.com', '', now(), '{}', '{}', now(), now());

insert into public.workspaces (id, name, creator_id) values
  ('20000000-0000-0000-0000-000000000001', 'Alpha', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'Beta', '10000000-0000-0000-0000-000000000003');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'member'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'owner');

insert into public.environments (id, workspace_id, name, color) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Production', '#123456'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Secret', '#654321');

insert into public.bug_registrations (
  id, workspace_id, environment_id, severity, registered_at, created_by
) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'High', '2025-01-01T00:00:00Z', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'Critical', '2026-06-01T00:00:00Z', '10000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Low', '2026-06-01T00:00:00Z', '10000000-0000-0000-0000-000000000001');

insert into public.workspace_invitations (
  workspace_id, token_hash, expires_at, created_by
) values (
  '20000000-0000-0000-0000-000000000001',
  extensions.digest('existing-invitation-token-with-entropy', 'sha256'),
  now() + interval '1 day',
  '10000000-0000-0000-0000-000000000001'
);

select ok(
  (
    select bool_and(not has_table_privilege('anon', 'public.' || table_name, privilege))
    from unnest(array[
      'workspaces', 'workspace_members', 'environments', 'bug_registrations',
      'workspace_invitations', 'local_imports'
    ]) table_name
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege
  ),
  'anonymous users have no privileges on any application table'
);

set local role anon;
select throws_ok(
  $$ select * from public.workspaces $$,
  '42501', null, 'anonymous users cannot read workspaces'
);
select throws_ok(
  $$ select * from public.environments $$,
  '42501', null, 'anonymous users cannot read environments'
);
select throws_ok(
  $$ select * from public.bug_registrations $$,
  '42501', null, 'anonymous users cannot read registrations'
);
select throws_ok(
  $$ insert into public.environments (workspace_id, name) values ('20000000-0000-0000-0000-000000000001', 'Blocked') $$,
  '42501', null, 'anonymous users cannot create environments'
);
select throws_ok(
  $$ update public.environments set color = '#000000' $$,
  '42501', null, 'anonymous users cannot update environments'
);
select throws_ok(
  $$ delete from public.environments $$,
  '42501', null, 'anonymous users cannot delete environments'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.workspaces), 1::bigint, 'members see their workspace');
select is((select count(*) from public.environments), 1::bigint, 'members cannot see another workspace environments');
select is((select count(*) from public.bug_registrations), 2::bigint, 'aggregate counts are isolated by workspace');
select is(
  (select count(*) from public.bug_registrations where registered_at >= '2026-01-01T00:00:00Z'),
  1::bigint,
  'date-filtered counts include only recent registrations from the selected workspace'
);
select is(
  (select count(*) from public.workspace_invitations),
  0::bigint,
  'members cannot read workspace invitations'
);
select lives_ok(
  $$ insert into public.environments (workspace_id, name) values ('20000000-0000-0000-0000-000000000001', 'Staging') $$,
  'members can create environments in their workspace'
);
select lives_ok(
  $$ insert into public.bug_registrations (
    workspace_id, environment_id, severity, description
  ) select
    workspace_id, id, 'Medium', 'Cascade test'
  from public.environments
  where workspace_id = '20000000-0000-0000-0000-000000000001' and name = 'Staging' $$,
  'members can create registrations in their workspace'
);
select throws_ok(
  $$ insert into public.environments (workspace_id, name) values ('20000000-0000-0000-0000-000000000002', 'Blocked') $$,
  '42501', null, 'members cannot create environments in another workspace'
);
select lives_ok(
  $$ update public.environments set color = '#000000' where id = '30000000-0000-0000-0000-000000000002' $$,
  'non-members cannot update another workspace, without leaking whether the row exists'
);
select lives_ok(
  $$ update public.environments set color = '#abcdef' where id = '30000000-0000-0000-0000-000000000001' $$,
  'members can update environment colors'
);
select throws_ok(
  $$ delete from public.environments where id = '30000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'members cannot bypass the owner-only environment delete function'
);
select throws_ok(
  $$ delete from public.bug_registrations where id = '40000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'members cannot bypass the single-registration delete function'
);
select throws_ok(
  $$ update public.bug_registrations set severity = 'Low' where id = '40000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'members cannot update registrations directly'
);
select lives_ok(
  $$ select public.delete_bug_registration('40000000-0000-0000-0000-000000000001') $$,
  'members can delete one registration through the guarded function'
);
select throws_ok(
  $$ select public.reset_workspace_registrations('20000000-0000-0000-0000-000000000001') $$,
  'P0001', 'Only workspace owners can reset a workspace', 'members cannot reset a workspace'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ select public.reset_workspace_registrations('20000000-0000-0000-0000-000000000001') $$,
  'owners can reset their workspace'
);
select lives_ok(
  $$ select public.delete_workspace_environment('20000000-0000-0000-0000-000000000001', 'Staging') $$,
  'owners can delete an environment through the guarded function'
);
select is(
  (select count(*) from public.environments where workspace_id = '20000000-0000-0000-0000-000000000001' and name = 'Staging'),
  0::bigint,
  'environment deletion removes the environment'
);
select is(
  (select count(*) from public.bug_registrations where description = 'Cascade test'),
  0::bigint,
  'environment deletion cascades to its registrations'
);
select throws_ok(
  $$ select public.remove_workspace_member('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001') $$,
  'P0001', 'The final owner cannot be removed', 'the final owner cannot be removed'
);
select lives_ok(
  $$ select public.remove_workspace_member('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002') $$,
  'owners can remove members'
);

reset role;
delete from public.workspace_members
where workspace_id = '20000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.workspaces), 0::bigint, 'removed membership blocks reads in the existing session');
select throws_ok(
  $$ insert into public.environments (workspace_id, name) values ('20000000-0000-0000-0000-000000000001', 'After removal') $$,
  '42501', null, 'removed membership blocks writes in the existing session'
);
select lives_ok(
  $$ update public.environments set color = '#000000' where id = '30000000-0000-0000-0000-000000000001' $$,
  'removed membership cannot update rows, without leaking whether they exist'
);
select throws_ok(
  $$ select public.delete_workspace_environment('20000000-0000-0000-0000-000000000001', 'Production') $$,
  'P0001', 'Only workspace owners can delete environments', 'removed membership cannot delete environments'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.workspaces), 1::bigint, 'an owner cannot see another workspace');
select is(
  (select color from public.environments where id = '30000000-0000-0000-0000-000000000002'),
  '#654321',
  'a non-member update did not change the other workspace'
);
select has_trigger(
  'public',
  'workspaces',
  'set_workspaces_updated_at',
  'workspace updates maintain the updated timestamp'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ select public.create_workspace_invitation(
    '20000000-0000-0000-0000-000000000001',
    'valid-invitation-token-with-enough-entropy',
    now() + interval '7 days'
  ) $$,
  'owners can create invitations'
);
select isnt(
  (select encode(token_hash, 'escape') from public.workspace_invitations
   where token_hash = extensions.digest('valid-invitation-token-with-enough-entropy', 'sha256')),
  'valid-invitation-token-with-enough-entropy',
  'only the invitation token hash is stored'
);
select lives_ok(
  $$ select public.revoke_workspace_invitation((
    select id from public.workspace_invitations
    where token_hash = extensions.digest('existing-invitation-token-with-entropy', 'sha256')
  )) $$,
  'owners can revoke invitations'
);
select ok(
  (select revoked_at is not null from public.workspace_invitations
   where token_hash = extensions.digest('existing-invitation-token-with-entropy', 'sha256')),
  'revoked invitations are recorded immediately'
);
select lives_ok(
  $$ select public.create_workspace('Delete me') $$,
  'owners can create another workspace'
);
select lives_ok(
  $$ delete from public.workspaces where name = 'Delete me' $$,
  'owners can delete a workspace'
);
select is(
  (select count(*) from public.workspaces where name = 'Delete me'),
  0::bigint,
  'workspace deletion removes the workspace'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(
  public.accept_workspace_invitation('valid-invitation-token-with-enough-entropy'),
  '20000000-0000-0000-0000-000000000001'::uuid,
  'an authenticated user can accept a valid invitation'
);
select is(
  public.accept_workspace_invitation('valid-invitation-token-with-enough-entropy'),
  '20000000-0000-0000-0000-000000000001'::uuid,
  'accepting the same invitation again is idempotent'
);
select is(
  (select count(*) from public.workspace_members where workspace_id = '20000000-0000-0000-0000-000000000001'),
  1::bigint,
  'invitation acceptance creates one membership for the user'
);

reset role;
delete from public.workspace_members
where workspace_id = '20000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000002';
insert into public.workspace_invitations (
  workspace_id, token_hash, expires_at, created_by, revoked_at
) values
  (
    '20000000-0000-0000-0000-000000000001',
    extensions.digest('expired-invitation-token-with-entropy', 'sha256'),
    now() - interval '1 hour',
    '10000000-0000-0000-0000-000000000001',
    null
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    extensions.digest('revoked-invitation-token-with-entropy', 'sha256'),
    now() + interval '1 hour',
    '10000000-0000-0000-0000-000000000001',
    now()
  );
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ select public.accept_workspace_invitation('expired-invitation-token-with-entropy') $$,
  'P0001', 'Invitation has expired', 'expired invitations cannot be accepted'
);
select throws_ok(
  $$ select public.accept_workspace_invitation('revoked-invitation-token-with-entropy') $$,
  'P0001', 'Invitation has been revoked', 'revoked invitations cannot be accepted'
);
select throws_ok(
  $$ select public.accept_workspace_invitation('malformed') $$,
  'P0001', 'Invitation is invalid', 'malformed invitations cannot be accepted'
);
select is(
  (select count(*) from public.workspace_members where workspace_id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'failed invitation acceptance does not create membership'
);

reset role;
insert into public.workspace_members (workspace_id, user_id, role) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'member'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ insert into public.bug_registrations (
    workspace_id, environment_id, severity, imported_source_id
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'Medium',
    'local-registration-1'
  ) on conflict (workspace_id, created_by, imported_source_id) do nothing $$,
  'local import can insert a registration'
);
select lives_ok(
  $$ insert into public.bug_registrations (
    workspace_id, environment_id, severity, imported_source_id
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'Medium',
    'local-registration-1'
  ) on conflict (workspace_id, created_by, imported_source_id) do nothing $$,
  'retrying local import succeeds'
);
select is(
  (select count(*) from public.bug_registrations where imported_source_id = 'local-registration-1'),
  1::bigint,
  'retrying local import does not duplicate registrations'
);

select * from finish();
rollback;
