import type { SupabaseClient } from '@supabase/supabase-js'

export type WorkspaceRole = 'owner' | 'member'

export type Workspace = {
  id: string
  name: string
  role: WorkspaceRole
}

export type WorkspaceMember = {
  userId: string
  email: string
  role: WorkspaceRole
  joinedAt: string
}

export type InvitationPreview = {
  workspaceId: string
  workspaceName: string
  expiresAt: string
}

export type WorkspaceInvitation = {
  id: string
  expiresAt: string
  createdAt: string
  revokedAt: string | null
  redeemedAt: string | null
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

export class WorkspaceService {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<Workspace[]> {
    const { data, error } = await this.client.rpc('list_my_workspaces')
    throwIfError(error)
    return (data ?? []).map((row: Record<string, string>) => ({
      id: row.workspace_id,
      name: row.workspace_name,
      role: row.workspace_role as WorkspaceRole,
    }))
  }

  async create(name: string): Promise<string> {
    const { data, error } = await this.client.rpc('create_workspace', {
      workspace_name: name.trim(),
    })
    throwIfError(error)
    return data as string
  }

  async rename(id: string, name: string) {
    const { error } = await this.client
      .from('workspaces')
      .update({ name: name.trim() })
      .eq('id', id)
    throwIfError(error)
  }

  async remove(id: string) {
    const { error } = await this.client.from('workspaces').delete().eq('id', id)
    throwIfError(error)
  }

  async previewInvitation(token: string): Promise<InvitationPreview | null> {
    const { data, error } = await this.client.rpc(
      'preview_workspace_invitation',
      {
        raw_token: token,
      },
    )
    throwIfError(error)
    const row = data?.[0] as Record<string, string> | undefined
    return row
      ? {
          workspaceId: row.workspace_id,
          workspaceName: row.workspace_name,
          expiresAt: row.expires_at,
        }
      : null
  }

  async acceptInvitation(token: string): Promise<string> {
    const { data, error } = await this.client.rpc(
      'accept_workspace_invitation',
      {
        raw_token: token,
      },
    )
    throwIfError(error)
    return data as string
  }

  async createInvitation(workspaceId: string) {
    const token = createToken()
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
    const { data, error } = await this.client.rpc(
      'create_workspace_invitation',
      {
        target_workspace_id: workspaceId,
        raw_token: token,
        invitation_expires_at: expiresAt,
      },
    )
    throwIfError(error)
    return {
      id: data as string,
      url: `${window.location.origin}/?invite=${encodeURIComponent(token)}`,
      expiresAt,
    }
  }

  async listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const { data, error } = await this.client
      .from('workspace_invitations')
      .select('id,expires_at,created_at,revoked_at,redeemed_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    throwIfError(error)
    return (data ?? []).map((row) => ({
      id: row.id as string,
      expiresAt: row.expires_at as string,
      createdAt: row.created_at as string,
      revokedAt: row.revoked_at as string | null,
      redeemedAt: row.redeemed_at as string | null,
    }))
  }

  async revokeInvitation(id: string) {
    const { error } = await this.client.rpc('revoke_workspace_invitation', {
      invitation_id: id,
    })
    throwIfError(error)
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const { data, error } = await this.client.rpc('list_workspace_members', {
      target_workspace_id: workspaceId,
    })
    throwIfError(error)
    return (data ?? []).map((row: Record<string, string>) => ({
      userId: row.member_user_id,
      email: row.member_email,
      role: row.member_role as WorkspaceRole,
      joinedAt: row.member_joined_at,
    }))
  }

  async removeMember(workspaceId: string, userId: string) {
    const { error } = await this.client.rpc('remove_workspace_member', {
      target_workspace_id: workspaceId,
      target_user_id: userId,
    })
    throwIfError(error)
  }
}
