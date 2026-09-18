import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { App } from './App'
import {
  clearPendingInvitation,
  consumeAuthenticationError,
  getPendingInvitation,
} from './auth/invitationState'
import { LocalStorageBugRepository } from './data/localStorageBugRepository'
import { SupabaseBugRepository } from './data/supabaseBugRepository'
import {
  WorkspaceService,
  type InvitationPreview,
  type Workspace,
  type WorkspaceInvitation,
  type WorkspaceMember,
} from './workspaces/workspaceService'

const LAST_WORKSPACE_KEY_PREFIX = 'bug-counter:last-workspace'

export function AuthenticatedApp({ client }: { client: SupabaseClient }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => data.subscription.unsubscribe()
  }, [client])

  if (loading) return <main className="loading">Loading…</main>
  if (!session) return <SignIn client={client} />
  return <WorkspaceApp client={client} session={session} />
}

function SignIn({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(consumeAuthenticationError)
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null)
  const service = useMemo(() => new WorkspaceService(client), [client])

  useEffect(() => {
    const token = getPendingInvitation()
    if (!token) return
    service
      .previewInvitation(token)
      .then(setInvitation)
      .catch(() => setInvitation(null))
  }, [service])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const { error: signInError } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    if (signInError) {
      setError(`${signInError.message} Check the address and try again.`)
      return
    }
    setSent(true)
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Bug Counter</p>
        <h1>{invitation ? `Join ${invitation.workspaceName}` : 'Sign in'}</h1>
        {sent ? (
          <p>
            We sent a sign-in link to <strong>{email}</strong>. Open it on this
            device to continue.
          </p>
        ) : (
          <form onSubmit={submit}>
            <p>
              {invitation
                ? 'Sign in to review and accept the invitation.'
                : 'Use your email. No password needed.'}
            </p>
            <label>
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
              />
            </label>
            <button className="primary-button" type="submit">
              Send sign-in link
            </button>
          </form>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}

function WorkspaceApp({
  client,
  session,
}: {
  client: SupabaseClient
  session: Session
}) {
  const service = useMemo(() => new WorkspaceService(client), [client])
  const lastWorkspaceKey = `${LAST_WORKSPACE_KEY_PREFIX}:${session.user.id}`
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)
  const [selectedId, setSelectedId] = useState(() =>
    localStorage.getItem(lastWorkspaceKey),
  )
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null)
  const [invitationError, setInvitationError] = useState('')

  async function loadWorkspaces(preferredId?: string) {
    const next = await service.list()
    setWorkspaces(next)
    const availableId = preferredId ?? selectedId
    const nextId = next.some((workspace) => workspace.id === availableId)
      ? availableId
      : (next[0]?.id ?? null)
    setSelectedId(nextId)
    if (nextId) localStorage.setItem(lastWorkspaceKey, nextId)
  }

  useEffect(() => {
    loadWorkspaces().catch((cause: unknown) => {
      setInvitationError(
        cause instanceof Error ? cause.message : 'Could not load workspaces.',
      )
    })
    const token = getPendingInvitation()
    if (token) {
      service
        .previewInvitation(token)
        .then((preview) => {
          if (!preview) {
            clearPendingInvitation()
            setInvitationError(
              'This invitation is invalid, expired, or revoked.',
            )
          } else {
            setInvitation(preview)
          }
        })
        .catch(() =>
          setInvitationError('Could not check this invitation. Try again.'),
        )
    }
    // Initial state is intentionally loaded once for this authenticated session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service])

  async function acceptInvitation() {
    const token = getPendingInvitation()
    if (!token) return
    try {
      const workspaceId = await service.acceptInvitation(token)
      clearPendingInvitation()
      setInvitation(null)
      await loadWorkspaces(workspaceId)
    } catch (cause) {
      setInvitationError(
        cause instanceof Error
          ? cause.message
          : 'Could not accept the invitation.',
      )
    }
  }

  function selectWorkspace(id: string) {
    setSelectedId(id)
    localStorage.setItem(lastWorkspaceKey, id)
  }

  if (invitation) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Workspace invitation</p>
          <h1>Join {invitation.workspaceName}</h1>
          <p>
            This invitation expires{' '}
            {new Date(invitation.expiresAt).toLocaleString()}.
          </p>
          <div className="form-actions">
            <button
              className="quiet-button"
              type="button"
              onClick={() => {
                clearPendingInvitation()
                setInvitation(null)
              }}
            >
              Decline
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={acceptInvitation}
            >
              Join workspace
            </button>
          </div>
          {invitationError && (
            <p className="error-message" role="alert">
              {invitationError}
            </p>
          )}
        </section>
      </main>
    )
  }

  if (!workspaces && invitationError) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>Could not load workspaces</h1>
          <p className="error-message" role="alert">
            {invitationError} Reload the page and try again.
          </p>
        </section>
      </main>
    )
  }
  if (!workspaces) return <main className="loading">Loading workspaces…</main>
  if (!workspaces.length) {
    return (
      <Onboarding
        service={service}
        onCreated={loadWorkspaces}
        error={invitationError}
      />
    )
  }

  const workspace =
    workspaces.find((item) => item.id === selectedId) ?? workspaces[0]!
  return (
    <WorkspaceCounter
      key={workspace.id}
      client={client}
      email={session.user.email ?? 'Signed-in user'}
      service={service}
      workspace={workspace}
      workspaces={workspaces}
      isFirstWorkspace={workspace.id === workspaces[0]?.id}
      onSelect={selectWorkspace}
      onChanged={() => loadWorkspaces(workspace.id)}
    />
  )
}

function Onboarding({
  service,
  onCreated,
  error,
}: {
  service: WorkspaceService
  onCreated(id: string): Promise<void>
  error: string
}) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState(error)

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      setMessage('')
      const id = await service.create(name)
      await onCreated(id)
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'Could not create the workspace.',
      )
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">One quick step</p>
        <h1>Name your workspace</h1>
        <form onSubmit={submit}>
          <label>
            <span>Workspace name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoFocus
            />
          </label>
          <button className="primary-button" type="submit">
            Create workspace
          </button>
        </form>
        {message && (
          <p className="error-message" role="alert">
            {message}
          </p>
        )}
      </section>
    </main>
  )
}

function WorkspaceCounter({
  client,
  email,
  service,
  workspace,
  workspaces,
  isFirstWorkspace,
  onSelect,
  onChanged,
}: {
  client: SupabaseClient
  email: string
  service: WorkspaceService
  workspace: Workspace
  workspaces: Workspace[]
  isFirstWorkspace: boolean
  onSelect(id: string): void
  onChanged(): Promise<void>
}) {
  const repository = useMemo(
    () => new SupabaseBugRepository(client, workspace.id),
    [client, workspace.id],
  )

  return (
    <>
      <LocalImportPrompt repository={repository} enabled={isFirstWorkspace} />
      <App
        repository={repository}
        canManageWorkspace={workspace.role === 'owner'}
        workspaceControls={
          <WorkspaceControls
            client={client}
            email={email}
            service={service}
            workspace={workspace}
            workspaces={workspaces}
            onSelect={onSelect}
            onChanged={onChanged}
          />
        }
      />
    </>
  )
}

function LocalImportPrompt({
  repository,
  enabled,
}: {
  repository: SupabaseBugRepository
  enabled: boolean
}) {
  const [localData, setLocalData] = useState<Awaited<
    ReturnType<LocalStorageBugRepository['load']>
  > | null>(null)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled) return
    const local = new LocalStorageBugRepository()
    Promise.all([local.load(), repository.hasImportedLocalData()])
      .then(([data, imported]) => {
        if (
          !imported &&
          (data.registrations.length || data.environments.length)
        ) {
          setLocalData(data)
          setVisible(true)
        }
      })
      .catch(() => setError('Could not check your browser data.'))
  }, [enabled, repository])

  if (!visible && !error) return null
  return (
    <aside className="import-banner">
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <p>
            <strong>Import browser data?</strong> This uploads your saved
            environments and registrations to this workspace.
          </p>
          <div>
            <button
              className="quiet-button"
              type="button"
              onClick={() => setVisible(false)}
            >
              Not now
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={async () => {
                if (!localData) return
                try {
                  await repository.importLocalData(localData)
                  setVisible(false)
                  window.location.reload()
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'Could not import browser data.',
                  )
                }
              }}
            >
              Import
            </button>
          </div>
        </>
      )}
    </aside>
  )
}

function WorkspaceControls({
  client,
  email,
  service,
  workspace,
  workspaces,
  onSelect,
  onChanged,
}: {
  client: SupabaseClient
  email: string
  service: WorkspaceService
  workspace: Workspace
  workspaces: Workspace[]
  onSelect(id: string): void
  onChanged(): Promise<void>
}) {
  return (
    <div className="workspace-controls">
      {workspaces.length > 1 && (
        <select
          value={workspace.id}
          onChange={(event) => onSelect(event.target.value)}
          aria-label="Workspace"
        >
          {workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      )}
      <details className="workspace-menu">
        <summary aria-label="Workspace menu">•••</summary>
        <section>
          <p>
            <strong>{workspace.name}</strong>
            <small>{email}</small>
          </p>
          {workspace.role === 'owner' && (
            <OwnerControls
              service={service}
              workspace={workspace}
              onChanged={onChanged}
            />
          )}
          <button type="button" onClick={() => client.auth.signOut()}>
            Sign out
          </button>
        </section>
      </details>
    </div>
  )
}

function OwnerControls({
  service,
  workspace,
  onChanged,
}: {
  service: WorkspaceService
  workspace: Workspace
  onChanged(): Promise<void>
}) {
  const [name, setName] = useState(workspace.name)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([])
  const [inviteUrl, setInviteUrl] = useState('')
  const [error, setError] = useState('')

  async function refreshAdmin() {
    try {
      const [nextMembers, nextInvitations] = await Promise.all([
        service.listMembers(workspace.id),
        service.listInvitations(workspace.id),
      ])
      setMembers(nextMembers)
      setInvitations(nextInvitations)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load workspace settings.',
      )
    }
  }

  useEffect(() => {
    refreshAdmin()
    // Refresh whenever the selected workspace changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id])

  return (
    <div className="owner-controls">
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          try {
            await service.rename(workspace.id, name)
            await onChanged()
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Could not rename the workspace.',
            )
          }
        }}
      >
        <label>
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit">Rename</button>
      </form>

      <h3>Members</h3>
      <ul>
        {members.map((member) => (
          <li key={member.userId}>
            <span>
              {member.email} <small>{member.role}</small>
            </span>
            {member.role !== 'owner' && (
              <button
                type="button"
                onClick={async () => {
                  if (
                    !confirm(`Remove ${member.email} from ${workspace.name}?`)
                  )
                    return
                  try {
                    await service.removeMember(workspace.id, member.userId)
                    await refreshAdmin()
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : 'Could not remove the member.',
                    )
                  }
                }}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3>Invitations</h3>
      <button
        type="button"
        onClick={async () => {
          try {
            const invitation = await service.createInvitation(workspace.id)
            setInviteUrl(invitation.url)
            await refreshAdmin()
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Could not create an invitation.',
            )
          }
        }}
      >
        Create invitation
      </button>
      {inviteUrl && (
        <div className="invite-link">
          <input value={inviteUrl} readOnly aria-label="Invitation link" />
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(inviteUrl)}
          >
            Copy
          </button>
        </div>
      )}
      {invitations.some(
        (invitation) => !invitation.revokedAt && !invitation.redeemedAt,
      ) && (
        <ul>
          {invitations
            .filter(
              (invitation) => !invitation.revokedAt && !invitation.redeemedAt,
            )
            .map((invitation) => (
              <li key={invitation.id}>
                <span>
                  Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await service.revokeInvitation(invitation.id)
                      await refreshAdmin()
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : 'Could not revoke the invitation.',
                      )
                    }
                  }}
                >
                  Revoke
                </button>
              </li>
            ))}
        </ul>
      )}
      <button
        className="danger-link"
        type="button"
        onClick={async () => {
          if (
            !confirm(
              `Delete ${workspace.name} and all of its data? This cannot be undone.`,
            )
          )
            return
          try {
            await service.remove(workspace.id)
            await onChanged()
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Could not delete the workspace.',
            )
          }
        }}
      >
        Delete workspace
      </button>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
