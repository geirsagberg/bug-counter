import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { BugRepository } from './data/bugRepository'
import type {
  BugCounterData,
  BugRegistration,
  EnvironmentDefinition,
} from './types'

type AppProps = {
  repository: BugRepository
  canManageWorkspace?: boolean
  workspaceControls?: ReactNode
}
const SINCE_DATE_KEY = 'bug-counter:since-date'

function formatLocalDate(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function parseLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const [, year, month, day] = match
  const parsed = new Date(Number(year), Number(month) - 1, Number(day))
  return formatLocalDate(parsed) === value ? parsed : null
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function initialSinceDate() {
  return (
    window.localStorage.getItem(SINCE_DATE_KEY) || formatLocalDate(new Date())
  )
}

export function App({
  repository,
  canManageWorkspace = true,
  workspaceControls,
}: AppProps) {
  const [data, setData] = useState<BugCounterData | null>(null)
  const [severity, setSeverity] = useState('')
  const [environment, setEnvironment] = useState('')
  const [description, setDescription] = useState('')
  const [since, setSince] = useState(initialSinceDate)
  const [isAdding, setIsAdding] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [deletingEnvironment, setDeletingEnvironment] = useState<string | null>(
    null,
  )
  const [announcement, setAnnouncement] = useState('')
  const [error, setError] = useState('')
  const firstField = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    repository
      .load()
      .then(setData)
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load this workspace.',
        )
      })
  }, [repository])

  useEffect(() => {
    if (isAdding) firstField.current?.focus()
  }, [isAdding])

  useEffect(() => {
    if (since) window.localStorage.setItem(SINCE_DATE_KEY, since)
    else window.localStorage.removeItem(SINCE_DATE_KEY)
  }, [since])

  const filtered = useMemo(() => {
    if (!data) return []
    const cutoff = parseLocalDate(since)
    if (!cutoff) return data.registrations
    return data.registrations.filter(
      (bug) => new Date(bug.registeredAt).getTime() >= cutoff.getTime(),
    )
  }, [data, since])

  async function register(event: FormEvent) {
    event.preventDefault()
    if (!severity.trim() || !environment.trim()) return
    try {
      setError('')
      setData(await repository.register({ severity, environment, description }))
      setDescription('')
      setIsAdding(false)
      setAnnouncement(`${severity} bug registered in ${environment}.`)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not register the bug.',
      )
    }
  }

  async function deleteRegistration(bug: BugRegistration) {
    try {
      setError('')
      setData(await repository.delete(bug.id))
      setAnnouncement('Registration deleted.')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not delete the registration.',
      )
    }
  }

  async function reset() {
    try {
      setError('')
      setData(await repository.reset())
      setIsResetting(false)
      setAnnouncement('All registrations reset.')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not reset the workspace.',
      )
    }
  }

  async function deleteEnvironment() {
    if (!deletingEnvironment) return
    const name = deletingEnvironment
    try {
      setError('')
      setData(await repository.deleteEnvironment(name))
      setDeletingEnvironment(null)
      setAnnouncement(`${name} and its registrations deleted.`)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not delete the environment.',
      )
    }
  }

  async function updateEnvironmentColor(name: string, color: string) {
    try {
      setError('')
      setData(await repository.updateEnvironmentColor(name, color))
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not update the color.',
      )
    }
  }

  function selectEnvironment(value: string) {
    setEnvironment(value)
  }

  if (!data && error) {
    return (
      <main className="loading">
        <p className="error-message" role="alert">
          {error} Reload the page and try again.
        </p>
      </main>
    )
  }
  if (!data) return <main className="loading">Loading…</main>

  return (
    <main className="shell">
      <header className="summary-heading">
        <h1>
          <strong>{filtered.length}</strong>{' '}
          {filtered.length === 1 ? 'bug' : 'bugs'} since
          <label className="date-picker">
            <span
              className={since ? undefined : 'date-placeholder'}
              aria-hidden="true"
            >
              {since || 'YYYY-MM-DD'}
            </span>
            <input
              type="date"
              lang="sv-SE"
              value={since}
              max={formatLocalDate(new Date())}
              onChange={(event) => setSince(event.target.value)}
              onClick={(event) => event.currentTarget.showPicker?.()}
              aria-label="Count bugs since date"
            />
          </label>
        </h1>
        <div className="header-actions">
          {canManageWorkspace && (
            <button
              className="quiet-button"
              type="button"
              onClick={() => setIsResetting(true)}
              disabled={!data.registrations.length}
            >
              Reset
            </button>
          )}
          {workspaceControls}
        </div>
      </header>

      {error && (
        <p className="error-message" role="alert">
          {error} Try again.
        </p>
      )}

      <section
        className="environment-list"
        aria-label="Bug counts by environment and severity"
      >
        {data.environments.map((environmentDefinition) => (
          <EnvironmentSummary
            key={environmentDefinition.name}
            environment={environmentDefinition}
            severities={data.severities}
            registrations={filtered}
            onColorChange={(color) =>
              updateEnvironmentColor(environmentDefinition.name, color)
            }
            onDelete={
              canManageWorkspace
                ? () => setDeletingEnvironment(environmentDefinition.name)
                : undefined
            }
          />
        ))}
      </section>

      <section className="new-bug">
        {!isAdding ? (
          <button
            className="primary-button"
            type="button"
            onClick={() => setIsAdding(true)}
          >
            New bug
          </button>
        ) : (
          <form className="entry-form" onSubmit={register}>
            <label>
              <span>Severity</span>
              <select
                ref={firstField}
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
                required
              >
                <option value="" disabled>
                  Select severity
                </option>
                {data.severities.map((value) => (
                  <option value={value} key={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Environment</span>
              <input
                list="environment-options"
                value={environment}
                onChange={(event) => selectEnvironment(event.target.value)}
                placeholder="Choose or add one"
                required
              />
              <datalist id="environment-options">
                {data.environments.map((value) => (
                  <option value={value.name} key={value.name} />
                ))}
              </datalist>
            </label>
            <label className="description-field">
              <span>
                Description <small>Optional</small>
              </span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What happened?"
              />
            </label>
            <div className="form-actions">
              <button className="primary-button" type="submit">
                Save
              </button>
              <button
                className="quiet-button"
                type="button"
                onClick={() => setIsAdding(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {data.registrations.length > 0 && (
        <details className="registrations">
          <summary>
            Manage registrations <span>{data.registrations.length}</span>
          </summary>
          <ol>
            {data.registrations.map((bug) => (
              <li key={bug.id}>
                <div>
                  <strong>{bug.severity}</strong>
                  <span>{bug.environment}</span>
                  {bug.description && (
                    <span className="bug-description">{bug.description}</span>
                  )}
                </div>
                <time dateTime={bug.registeredAt}>
                  {formatTimestamp(bug.registeredAt)}
                </time>
                <button type="button" onClick={() => deleteRegistration(bug)}>
                  Delete
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}

      {canManageWorkspace && isResetting && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={() => setIsResetting(false)}
        >
          <section
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="reset-title">Reset all registrations?</h2>
            <p>Your environments will stay.</p>
            <div className="dialog-actions">
              <button
                className="quiet-button"
                type="button"
                onClick={() => setIsResetting(false)}
              >
                Cancel
              </button>
              <button className="danger-button" type="button" onClick={reset}>
                Reset all
              </button>
            </div>
          </section>
        </div>
      )}

      {canManageWorkspace && deletingEnvironment && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={() => setDeletingEnvironment(null)}
        >
          <section
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-environment-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="delete-environment-title">Delete {deletingEnvironment}?</h2>
            <p>All bugs registered in this environment will be removed.</p>
            <div className="dialog-actions">
              <button
                className="quiet-button"
                type="button"
                onClick={() => setDeletingEnvironment(null)}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={deleteEnvironment}
              >
                Delete environment
              </button>
            </div>
          </section>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </main>
  )
}

function EnvironmentSummary({
  environment,
  severities,
  registrations,
  onColorChange,
  onDelete,
}: {
  environment: EnvironmentDefinition
  severities: string[]
  registrations: BugRegistration[]
  onColorChange(color: string): void
  onDelete?(): void
}) {
  const { name, color } = environment
  return (
    <article
      className="environment-row"
      style={{ '--environment-color': color } as CSSProperties}
    >
      <div className="environment-name">
        <h2>{name}</h2>
        <div className="environment-actions">
          <input
            type="color"
            value={color}
            onChange={(event) => onColorChange(event.target.value)}
            aria-label={`Change ${name} color`}
          />
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${name} environment`}
            >
              Delete
            </button>
          )}
        </div>
      </div>
      <dl>
        {severities.map((severity) => {
          const count = registrations.filter(
            (bug) => bug.environment === name && bug.severity === severity,
          ).length
          return (
            <div key={severity} data-severity={severity.toLowerCase()}>
              <dt>{severity}</dt>
              <dd>{count}</dd>
            </div>
          )
        })}
      </dl>
    </article>
  )
}
