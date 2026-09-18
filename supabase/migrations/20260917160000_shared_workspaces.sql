create extension if not exists pgcrypto with schema extensions;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  creator_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members(user_id);

create table public.environments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  color text not null default '#4f6bed' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name),
  unique (workspace_id, id)
);

create index environments_workspace_id_idx on public.environments(workspace_id);

create table public.bug_registrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  environment_id uuid not null,
  severity text not null check (severity in ('Low', 'Medium', 'High', 'Critical')),
  description text check (description is null or char_length(description) <= 500),
  registered_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  imported_source_id text,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, environment_id)
    references public.environments(workspace_id, id) on delete cascade,
  unique (workspace_id, created_by, imported_source_id)
);

create index bug_registrations_workspace_id_idx on public.bug_registrations(workspace_id);
create index bug_registrations_environment_id_idx on public.bug_registrations(environment_id);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz
);

create index workspace_invitations_workspace_id_idx on public.workspace_invitations(workspace_id);

create table public.local_imports (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null,
  imported_at timestamptz not null default now(),
  primary key (workspace_id, user_id, source)
);

create index local_imports_user_id_idx on public.local_imports(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger set_environments_updated_at
before update on public.environments
for each row execute function public.set_updated_at();

revoke all on function public.set_updated_at() from public;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_owner(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.environments enable row level security;
alter table public.bug_registrations enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.local_imports enable row level security;

create policy "members can read workspaces"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

create policy "owners can update workspaces"
on public.workspaces for update to authenticated
using (public.is_workspace_owner(id))
with check (public.is_workspace_owner(id));

create policy "owners can delete workspaces"
on public.workspaces for delete to authenticated
using (public.is_workspace_owner(id));

create policy "users can read their membership and owners can read members"
on public.workspace_members for select to authenticated
using (user_id = auth.uid() or public.is_workspace_owner(workspace_id));

create policy "members can read environments"
on public.environments for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members can create environments"
on public.environments for insert to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "members can update environment colors"
on public.environments for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "members can read registrations"
on public.bug_registrations for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members can create registrations"
on public.bug_registrations for insert to authenticated
with check (
  public.is_workspace_member(workspace_id)
  and created_by = auth.uid()
);

create policy "owners can read invitations"
on public.workspace_invitations for select to authenticated
using (public.is_workspace_owner(workspace_id));

create policy "users can read their import marker"
on public.local_imports for select to authenticated
using (user_id = auth.uid() and public.is_workspace_member(workspace_id));

create policy "users can create their import marker"
on public.local_imports for insert to authenticated
with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

create policy "users can refresh their import marker"
on public.local_imports for update to authenticated
using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

revoke all on public.workspaces from anon, authenticated;
revoke all on public.workspace_members from anon, authenticated;
revoke all on public.environments from anon, authenticated;
revoke all on public.bug_registrations from anon, authenticated;
revoke all on public.workspace_invitations from anon, authenticated;
revoke all on public.local_imports from anon, authenticated;

grant select, update (name), delete on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, insert, update (color) on public.environments to authenticated;
grant select, insert on public.bug_registrations to authenticated;
grant select on public.workspace_invitations to authenticated;
grant select, insert, update on public.local_imports to authenticated;

create or replace function public.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trim(workspace_name)) not between 1 and 80 then
    raise exception 'Workspace name must be between 1 and 80 characters';
  end if;

  insert into public.workspaces (name, creator_id)
  values (trim(workspace_name), auth.uid())
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, auth.uid(), 'owner');

  return new_workspace_id;
end;
$$;

create or replace function public.list_my_workspaces()
returns table (workspace_id uuid, workspace_name text, workspace_role text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.name, m.role
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  where m.user_id = auth.uid()
  order by m.joined_at, w.id;
$$;

create or replace function public.create_workspace_invitation(
  target_workspace_id uuid,
  raw_token text,
  invitation_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_invitation_id uuid;
begin
  if not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Only workspace owners can create invitations';
  end if;
  if char_length(raw_token) < 32 then
    raise exception 'Invitation token is invalid';
  end if;
  if invitation_expires_at <= now() or invitation_expires_at > now() + interval '30 days' then
    raise exception 'Invitation expiry must be within 30 days';
  end if;

  insert into public.workspace_invitations (
    workspace_id, token_hash, expires_at, created_by
  ) values (
    target_workspace_id,
    extensions.digest(raw_token, 'sha256'),
    invitation_expires_at,
    auth.uid()
  ) returning id into new_invitation_id;

  return new_invitation_id;
end;
$$;

create or replace function public.preview_workspace_invitation(raw_token text)
returns table (workspace_id uuid, workspace_name text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.name, i.expires_at
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  where i.token_hash = extensions.digest(raw_token, 'sha256')
    and i.expires_at > now()
    and i.revoked_at is null
    and i.redeemed_at is null;
$$;

create or replace function public.accept_workspace_invitation(raw_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.workspace_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into invitation
  from public.workspace_invitations
  where token_hash = extensions.digest(raw_token, 'sha256')
  for update;

  if invitation.id is null then
    raise exception 'Invitation is invalid';
  end if;
  if invitation.redeemed_by = auth.uid() then
    return invitation.workspace_id;
  end if;
  if invitation.revoked_at is not null then
    raise exception 'Invitation has been revoked';
  end if;
  if invitation.expires_at <= now() then
    raise exception 'Invitation has expired';
  end if;
  if invitation.redeemed_at is not null then
    raise exception 'Invitation has already been used';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (invitation.workspace_id, auth.uid(), 'member')
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invitations
  set redeemed_by = auth.uid(), redeemed_at = now()
  where id = invitation.id;

  return invitation.workspace_id;
end;
$$;

create or replace function public.list_workspace_members(target_workspace_id uuid)
returns table (
  member_user_id uuid,
  member_email text,
  member_role text,
  member_joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Only workspace owners can view members';
  end if;
  return query
  select m.user_id, u.email::text, m.role, m.joined_at
  from public.workspace_members m
  join auth.users u on u.id = m.user_id
  where m.workspace_id = target_workspace_id
  order by m.joined_at, m.user_id;
end;
$$;

create or replace function public.remove_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Only workspace owners can remove members';
  end if;
  if exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = target_user_id
      and role = 'owner'
  ) then
    raise exception 'The final owner cannot be removed';
  end if;
  delete from public.workspace_members
  where workspace_id = target_workspace_id and user_id = target_user_id;
end;
$$;

create or replace function public.revoke_workspace_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select workspace_id into target_workspace_id
  from public.workspace_invitations
  where id = invitation_id;
  if not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Only workspace owners can revoke invitations';
  end if;
  update public.workspace_invitations
  set revoked_at = coalesce(revoked_at, now())
  where id = invitation_id and redeemed_at is null;
end;
$$;

create or replace function public.delete_bug_registration(registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select workspace_id into target_workspace_id
  from public.bug_registrations
  where id = registration_id;
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace access required';
  end if;
  delete from public.bug_registrations where id = registration_id;
end;
$$;

create or replace function public.delete_workspace_environment(
  target_workspace_id uuid,
  environment_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Only workspace owners can delete environments';
  end if;
  delete from public.environments
  where workspace_id = target_workspace_id and name = environment_name;
end;
$$;

create or replace function public.reset_workspace_registrations(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Only workspace owners can reset a workspace';
  end if;
  delete from public.bug_registrations where workspace_id = target_workspace_id;
end;
$$;

revoke all on function public.create_workspace(text) from public;
revoke all on function public.list_my_workspaces() from public;
revoke all on function public.create_workspace_invitation(uuid, text, timestamptz) from public;
revoke all on function public.preview_workspace_invitation(text) from public;
revoke all on function public.accept_workspace_invitation(text) from public;
revoke all on function public.list_workspace_members(uuid) from public;
revoke all on function public.remove_workspace_member(uuid, uuid) from public;
revoke all on function public.revoke_workspace_invitation(uuid) from public;
revoke all on function public.delete_bug_registration(uuid) from public;
revoke all on function public.delete_workspace_environment(uuid, text) from public;
revoke all on function public.reset_workspace_registrations(uuid) from public;

grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.list_my_workspaces() to authenticated;
grant execute on function public.create_workspace_invitation(uuid, text, timestamptz) to authenticated;
grant execute on function public.preview_workspace_invitation(text) to anon, authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;
grant execute on function public.delete_bug_registration(uuid) to authenticated;
grant execute on function public.delete_workspace_environment(uuid, text) to authenticated;
grant execute on function public.reset_workspace_registrations(uuid) to authenticated;
