import type { SupabaseClient } from '@supabase/supabase-js'
import { defaultData, type BugRepository } from './bugRepository'
import type { BugCounterData, NewBugRegistration } from '../types'

type EnvironmentRow = { id: string; name: string; color: string }
type RegistrationRow = {
  id: string
  severity: string
  description: string | null
  registered_at: string
  environments: { name: string } | Array<{ name: string }> | null
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

function environmentName(row: RegistrationRow) {
  if (Array.isArray(row.environments)) return row.environments[0]?.name ?? ''
  return row.environments?.name ?? ''
}

export class SupabaseBugRepository implements BugRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly workspaceId: string,
  ) {}

  async load(): Promise<BugCounterData> {
    const [environmentsResult, registrationsResult] = await Promise.all([
      this.client
        .from('environments')
        .select('id,name,color')
        .eq('workspace_id', this.workspaceId)
        .order('name'),
      this.client
        .from('bug_registrations')
        .select('id,severity,description,registered_at,environments(name)')
        .eq('workspace_id', this.workspaceId)
        .order('registered_at', { ascending: false }),
    ])

    throwIfError(environmentsResult.error)
    throwIfError(registrationsResult.error)

    return {
      severities: defaultData.severities,
      environments: ((environmentsResult.data ?? []) as EnvironmentRow[]).map(
        ({ name, color }) => ({ name, color }),
      ),
      registrations: (
        (registrationsResult.data ?? []) as RegistrationRow[]
      ).map((row) => ({
        id: row.id,
        severity: row.severity,
        environment: environmentName(row),
        description: row.description ?? undefined,
        registeredAt: new Date(row.registered_at).toISOString(),
      })),
    }
  }

  async register(bug: NewBugRegistration) {
    const environmentName = bug.environment.trim()
    const { data: environment, error: environmentError } = await this.client
      .from('environments')
      .upsert(
        {
          workspace_id: this.workspaceId,
          name: environmentName,
          color: '#4f6bed',
        },
        { onConflict: 'workspace_id,name', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle()
    throwIfError(environmentError)

    let environmentId = environment?.id as string | undefined
    if (!environmentId) {
      const result = await this.client
        .from('environments')
        .select('id')
        .eq('workspace_id', this.workspaceId)
        .eq('name', environmentName)
        .single()
      throwIfError(result.error)
      environmentId = result.data!.id as string
    }

    const { error } = await this.client.from('bug_registrations').insert({
      workspace_id: this.workspaceId,
      environment_id: environmentId,
      severity: bug.severity.trim(),
      description: bug.description?.trim() || null,
    })
    throwIfError(error)
    return this.load()
  }

  async delete(id: string) {
    const { error } = await this.client.rpc('delete_bug_registration', {
      registration_id: id,
    })
    throwIfError(error)
    return this.load()
  }

  async deleteEnvironment(name: string) {
    const { error } = await this.client.rpc('delete_workspace_environment', {
      target_workspace_id: this.workspaceId,
      environment_name: name,
    })
    throwIfError(error)
    return this.load()
  }

  async updateEnvironmentColor(name: string, color: string) {
    const { error } = await this.client
      .from('environments')
      .update({ color })
      .eq('workspace_id', this.workspaceId)
      .eq('name', name)
    throwIfError(error)
    return this.load()
  }

  async reset() {
    const { error } = await this.client.rpc('reset_workspace_registrations', {
      target_workspace_id: this.workspaceId,
    })
    throwIfError(error)
    return this.load()
  }

}
