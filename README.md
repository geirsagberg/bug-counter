# Bug counter

A small local-first app for registering and counting bugs.

## Run locally

```sh
npm install
npm run dev
```

Registrations, severities, and environments are stored in the browser's local storage.

## Persistence boundary

The UI depends on the `BugRepository` interface in `src/data/bugRepository.ts`. `LocalStorageBugRepository` is the current implementation. A future authenticated API or Cloudflare D1 implementation can replace it without changing the UI or domain types.
