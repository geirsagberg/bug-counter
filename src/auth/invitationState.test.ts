import { describe, expect, it } from 'vitest'
import {
  captureInvitationFromUrl,
  clearPendingInvitation,
  consumeAuthenticationError,
  getPendingInvitation,
} from './invitationState'

describe('invitation state', () => {
  it('keeps an invitation across the authentication redirect and removes it from the URL', () => {
    window.history.replaceState({}, '', '/?invite=invite-token')

    expect(captureInvitationFromUrl()).toBe('invite-token')
    expect(getPendingInvitation()).toBe('invite-token')
    expect(window.location.search).toBe('')

    clearPendingInvitation()
    expect(getPendingInvitation()).toBeNull()
  })

  it('ignores blank invitation tokens', () => {
    window.history.replaceState({}, '', '/?invite=%20%20')

    expect(captureInvitationFromUrl()).toBeNull()
    expect(getPendingInvitation()).toBeNull()
  })

  it('turns an authentication redirect failure into recovery guidance', () => {
    window.history.replaceState(
      {},
      '',
      '/#error=access_denied&error_description=The+link+has+expired',
    )

    expect(consumeAuthenticationError()).toBe(
      'The link has expired Request a new sign-in link.',
    )
    expect(window.location.hash).toBe('')
  })
})
