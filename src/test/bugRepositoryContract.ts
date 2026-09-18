import { expect } from 'vitest'
import type { BugRepository } from '../data/bugRepository'

export async function expectBugRepositoryBehavior(repository: BugRepository) {
  let data = await repository.register({
    severity: 'High',
    environment: 'Production',
    description: 'Checkout failed',
  })

  expect(data.registrations).toHaveLength(1)
  expect(data.registrations[0]).toMatchObject({
    severity: 'High',
    environment: 'Production',
    description: 'Checkout failed',
  })
  expect(data.environments).toEqual([{ name: 'Production', color: '#4f6bed' }])

  data = await repository.updateEnvironmentColor('Production', '#123456')
  expect(data.environments[0]?.color).toBe('#123456')

  data = await repository.delete(data.registrations[0]!.id)
  expect(data.registrations).toEqual([])

  await repository.register({ severity: 'Low', environment: 'Staging' })
  data = await repository.deleteEnvironment('Staging')
  expect(data.environments).toEqual([{ name: 'Production', color: '#123456' }])
  expect(data.registrations).toEqual([])

  await repository.register({
    severity: 'Critical',
    environment: 'Production',
  })
  data = await repository.reset()
  expect(data.registrations).toEqual([])
  expect(data.environments).toEqual([{ name: 'Production', color: '#123456' }])
}
