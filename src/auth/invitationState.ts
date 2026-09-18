const PENDING_INVITATION_KEY = 'bug-counter:pending-invitation'

export function captureInvitationFromUrl() {
  const url = new URL(window.location.href)
  const token = url.searchParams.get('invite')?.trim() || null

  if (token) window.localStorage.setItem(PENDING_INVITATION_KEY, token)
  url.searchParams.delete('invite')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)

  return token
}

export function getPendingInvitation() {
  return window.localStorage.getItem(PENDING_INVITATION_KEY)
}

export function clearPendingInvitation() {
  window.localStorage.removeItem(PENDING_INVITATION_KEY)
}

export function consumeAuthenticationError() {
  const parameters = new URLSearchParams(window.location.hash.slice(1))
  const description = parameters.get('error_description')?.trim()
  if (!description) return ''

  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${window.location.search}`,
  )
  return `${description} Request a new sign-in link.`
}
