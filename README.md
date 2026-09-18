# Bug Counter

A shared bug counter for small teams. Sign in with an email link, create a workspace, and register bugs by environment and severity.

## Setup

Install dependencies, then run the setup wizard:

```sh
npm install
./scripts/setup-cloud.sh
npm run dev
```

The wizard creates `.env.local`, applies the Supabase migration, and walks through the Supabase Auth and Vercel settings. The browser receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never add a Supabase secret key or service-role key to the app.

## Data and authorization

Shared data lives in Supabase Postgres. Every exposed table uses row-level security backed by current workspace membership. Owner-only destructive actions and invitation redemption use narrow database functions.

The UI uses `BugRepository` as its persistence boundary:

- `SupabaseBugRepository` stores the selected workspace's environments and registrations.
- `LocalStorageBugRepository` reads browser data for the explicit, one-time import flow.
- The date filter and last selected workspace remain device-local preferences.

Database changes live in `supabase/migrations`. Apply them with `npx supabase db push` rather than editing the remote database directly.

## Tests

```sh
npm test
npm run test:db
npm run test:e2e
```

`test:db` requires the local Supabase stack. `test:e2e` resets that disposable local database and uses its Mailpit inbox for passwordless sign-in links. Copy the local API URL and publishable key from `npx supabase status` into `.env.local` before running the browser flow.
