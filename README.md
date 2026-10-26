# Cartograph

Cartograph maps public TypeScript and JavaScript repositories so a team can see how folders, files, and imports fit together.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the Clerk and Supabase values.
2. In Clerk, enable the sign in methods you want, require organization membership, and enable automatic creation of the first organization with a default naming rule. Set the app sign in URL to `/sign-in` so invitation acceptance returns to Cartograph.
3. In Supabase, add Clerk as a third party authentication provider. The server client sends the signed Clerk session token with its publishable key. Do not add a service role key to the app environment.
4. Start the app with `pnpm dev` and open `http://localhost:3000`.

If required values are missing, Cartograph displays their names and keeps workspace routes closed. The schema is tracked in `supabase/migrations/`; local database resets also load the two organization fixtures from `supabase/seed.sql`.

To start the local Supabase stack and load the schema plus fixtures, run `npx --yes supabase@latest start` and then `npx --yes supabase@latest db reset`. These commands require Docker.

## Checks

- `pnpm lint`
- `pnpm build`

The implementation decisions and acceptance criteria are in [`docs/specs/phase-01.md`](docs/specs/phase-01.md) and [`docs/specs/phase-02.md`](docs/specs/phase-02.md).
