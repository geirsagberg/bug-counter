import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthenticatedApp } from './AuthenticatedApp'
import { captureInvitationFromUrl } from './auth/invitationState'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import './styles.css'

captureInvitationFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSupabaseConfigured && supabase ? (
      <AuthenticatedApp client={supabase} />
    ) : (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Bug Counter</p>
          <h1>Setup required</h1>
          <p>
            Add the Supabase project URL and publishable key to{' '}
            <code>.env.local</code>, then restart the app.
          </p>
        </section>
      </main>
    )}
  </StrictMode>,
)
