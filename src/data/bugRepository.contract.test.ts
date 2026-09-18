import { describe, it } from 'vitest'
import { expectBugRepositoryBehavior } from '../test/bugRepositoryContract'
import { LocalStorageBugRepository } from './localStorageBugRepository'

describe('BugRepository contract: local storage', () => {
  it('registers, updates, deletes, and resets workspace data', async () => {
    await expectBugRepositoryBehavior(new LocalStorageBugRepository())
  })
})
