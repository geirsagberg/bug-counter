import { afterEach, beforeAll, beforeEach, describe, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expectBugRepositoryBehavior } from '../src/test/bugRepositoryContract'
import { SupabaseBugRepository } from '../src/data/supabaseBugRepository'
import { WorkspaceService } from '../src/workspaces/workspaceService'

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
const LOCAL_PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

let client: SupabaseClient
let service: WorkspaceService
let repository: SupabaseBugRepository
let workspaceId: string

beforeAll(async () => {
  client = createClient(LOCAL_SUPABASE_URL, LOCAL_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  })
  const { error } = await client.auth.signUp({
    email: `repository-${crypto.randomUUID()}@example.com`,
    password: `local-test-${crypto.randomUUID()}`,
  })
  if (error) throw error
  service = new WorkspaceService(client)
})

beforeEach(async () => {
  workspaceId = await service.create(`Contract ${crypto.randomUUID()}`)
  repository = new SupabaseBugRepository(client, workspaceId)
})

afterEach(async () => {
  await service.remove(workspaceId)
})

describe('BugRepository contract: Supabase', () => {
  it('registers, updates, deletes, and resets workspace data', async () => {
    await expectBugRepositoryBehavior(repository)
  })
})
