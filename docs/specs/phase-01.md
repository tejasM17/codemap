# Phase 01: Sign in and organization shell

**Date**: 2026-10-26
**Status**: In Progress

## Summary

This phase gives each signed in person a place to work, lets them switch organizations and invite a teammate, and provides the shared application shell. Clerk remains the identity and session owner, and the organization identifier travels in its signed token for later database policies. The phase adds no application tables.

## Context

Cartograph is an organization based product. Repository analyses will belong to an organization, so organization identity must be available before the application adds data or access policies. Sign in, organization membership, and the database token bridge are therefore prerequisites for later phases.

The project direction names Clerk for identity and Supabase for Postgres. The current app has the Next.js starter page and Supabase packages, but no Clerk dependency, sign in route, or authentication setup. The earlier phase brief described sign in as scaffolded; implementation must first establish that foundation as part of this phase.

The phase also establishes the persistent visual shell and theme preference that later product views will use. No repository map, analysis data, or application table is part of this phase.

## Requirements

**User stories**:
- As a developer, I want to sign in and land in an organization so I can start using Cartograph without setting up a workspace first.
- As a team member, I want to invite a teammate and switch organizations so our work stays with the right team.
- As a signed in user, I want the organization available during server rendering so later server rendered views and database requests use the right organization immediately.
- As a user, I want a persistent theme preference and a stable application shell so the product feels consistent between visits.

**Acceptance criteria**:
- **AC-1**: A new account can sign in with every method enabled in Clerk, and each method lands at the same organization workspace. On first sign in, the account is already a member of an organization without being asked to create one.
- **AC-2**: A user can invite another account to the current organization. The invite acceptance return URL is this application's sign in page. After accepting and signing in, the invitee lands in the invited organization's workspace.
- **AC-3**: The active organization identifier is readable in a server rendered component on its first response. A Supabase server client can send the signed in user's Clerk token on its requests, with the active organization claim included. No application table is created in this phase.
- **AC-4**: A signed out visitor requesting a protected application route is redirected to sign in before protected page content is rendered or sent. Sign in, invite acceptance, and required provider callback routes remain reachable while signed out.
- **AC-5**: The theme control supports system, light, and dark. The selected preference survives reloads, updates the root HTML element, and an explicit light or dark choice wins over the operating system preference without a first paint flash.
- **AC-6**: The authenticated application shell provides a persistent organization switcher, an invitation entry point, a theme control, and a main content area for later phases. The shell works at narrow and wide viewport sizes.
- **AC-7**: Required identity and Supabase public configuration is validated at startup or server initialization and produces a clear error naming the missing variable. No secret key is exposed to browser code.

## Options considered

### Option 1: Keep identity and organization membership in Clerk

Use Clerk for sign in, sessions, organization membership, invitations, and the organization claim. Pass its signed token to Supabase when constructing a database client.

**Pros**:
- Follows the existing project decision and keeps one owner for identity and session refresh.
- Makes the organization claim available to server rendered code and future Supabase policies.

**Cons**:
- Organization setup and claim configuration depend on Clerk dashboard configuration as well as application code.
- A Clerk or token configuration error can block both sign in and organization access.

### Option 2: Use Supabase Auth for identity and organizations in application tables

Use Supabase Auth sessions and represent organizations and memberships in Postgres.

**Pros**:
- Identity and database access share a provider and can use Supabase's native user token.
- Organization data can be modeled with application specific fields.

**Cons**:
- Conflicts with the existing Clerk decision and creates organization tables and policies before repository data exists.
- Requires replacing the chosen organization and invitation experience and would broaden this phase.

### Option 3: Keep identity in Clerk and resolve the organization at runtime

Use Clerk for sign in, but look up the user's active organization separately for server reads and database requests.

**Pros**:
- Avoids depending on organization claim freshness for each organization change.
- Can represent organization context independently of token claims.

**Cons**:
- Adds an identity provider lookup to runtime paths and conflicts with the requirement that downstream code read the token claim.
- Creates a second organization resolution path that later access policies cannot use directly.

## Decision

**Chosen option**: Option 1: Keep identity and organization membership in Clerk.

Use Clerk for sign in, session ownership, organizations, membership, and invitations. Create a default organization membership for a new account, place the active organization identifier in the signed token, and pass that token through the Supabase server client. Keep Supabase limited to client setup in this phase; create no application tables.

**Implementation skills**: `supabase` (`supabase/supabase`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/supabase`, `.agents/skills/supabase-postgres-best-practices/`)

## Rationale

The project already names Clerk as the identity provider, Supabase as the database, and the organization claim as the authorization boundary. Keeping those responsibilities avoids two session systems and makes the eventual database policy read the same organization value as server rendered application code. A runtime organization lookup would weaken that contract, while Supabase Auth would replace rather than build on the documented direction.

The exact active organization claim and its Supabase trust configuration must be set consistently in Clerk and the Supabase project. The application must fail closed if that claim is unavailable; it must not silently fall back to an anonymous database client.

## Feature design

**Data model sketch**:
- Clerk user: managed by Clerk. The application does not mirror user records in this phase.
- Clerk organization: managed by Clerk. Its stable organization identifier is the tenant identity.
- Clerk organization membership: managed by Clerk. A new account receives membership in a default organization; an invitation creates membership in the invited organization after acceptance.
- Signed session token: managed and signed by Clerk. It carries the active organization identifier used by server rendering and passed to Supabase.
- Theme preference: browser local storage value `system`, `light`, or `dark`. No database row or server profile is created.
- Supabase schema: unchanged. No application tables, migrations, or row policies are added.

**State transitions**:
- Account: signed out → signed in with active organization.
- Invitation: pending → accepted, after which the invitee signs in and enters the invited organization; expired or revoked invitations remain provider managed and cannot grant membership.
- Theme: system ↔ light ↔ dark. The selected value is stored locally and applied to the root HTML element.

**API surface**:

| Endpoint or action | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Sign in | Provider managed route | enabled sign in method; safe return path | signed in session; active organization; redirect to workspace | public | invalid credentials; provider unavailable; no active organization |
| Invite member | Clerk organization action | active organization; invitee email; provider default role | invitation sent; acceptance URL returns to app sign in | organization member with invite permission | invalid email; permission denied; provider unavailable |
| Accept invitation | Provider managed route | invitation token; app sign in return URL | accepted membership; sign in continuation | public until accepted, then authenticated | expired or revoked invitation; wrong signed in account |
| Switch organization | Clerk organization action | selected organization identifier | refreshed active organization context and token | authenticated member of target organization | not a member; organization unavailable; token refresh pending |
| Read request identity | Server helper | current Clerk session | user identifier and active organization identifier | authenticated | signed out; missing organization claim |
| Create Supabase server client | Server helper | validated Supabase URL and public key; Clerk session token | request client carrying the signed token | authenticated for protected reads | missing configuration; token unavailable |
| Set theme | Browser action | `system`, `light`, or `dark` | saved preference and root element theme attribute | public | unavailable local storage falls back to system for that visit |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Sign in | user identity and session | Clerk authenticated session |
| First sign in | initial organization membership | Clerk organization state created by the first sign in flow |
| Workspace landing | active organization name and identifier | Clerk active organization in the authenticated session |
| Invite member | target organization | active organization in Clerk session |
| Invite member | invitee address | user supplied email input |
| Invite member | invitation acceptance return URL | application sign in route, configured by the application |
| Accept invitation | resulting organization | organization attached to the accepted Clerk invitation |
| Switch organization | target organization | user selection from Clerk organizations for which the user is a member |
| Server identity read | user identifier | verified Clerk session |
| Server identity read | organization identifier | active organization claim in the verified Clerk session token |
| Supabase request | bearer token | verified Clerk session token for the active organization |
| Supabase request | Supabase URL and public key | validated server environment configuration |
| Theme application | effective theme | saved local preference; when `system`, operating system color preference |
| Theme control | selected theme label | saved local preference, defaulting to `system` |
| Protected route | redirect destination | configured sign in route plus safe same application return path |

**Key invariants**:
- Clerk owns sign in, session creation, session refresh, organization membership, and invitations. No Supabase Auth session or parallel application session cookie is installed.
- The active organization claim comes from a verified Clerk token. Client supplied organization identifiers never establish authorization.
- The Supabase server client forwards the signed user token. The service role key is never used in browser code or as the normal user request identity.
- Missing identity, organization claim, or required Supabase configuration fails closed with a clear server side error; no anonymous client fallback is permitted for protected work.
- Provider errors do not partially grant membership. Invitation acceptance only grants access after Clerk confirms the accepted membership.
- Theme values are limited to `system`, `light`, and `dark`; the root element is the single styling source for the effective theme.
- No application database table or migration is introduced.

**Security model**:
- Public routes are limited to sign in, provider callbacks, and invitation acceptance needed before authentication. All workspace routes require a valid Clerk session.
- Organization switching is limited to organizations returned by Clerk for the signed in user. Inviting members requires the provider's invite permission for the active organization.
- Server authorization reads the verified session and its organization claim. Later database policies remain responsible for row access; this phase creates no table and no policy.
- Only publishable Supabase configuration may reach the browser. Clerk secret credentials and Supabase service role credentials remain server side.

**Configuration required**:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk browser SDK configuration.
- `CLERK_SECRET_KEY`: server side Clerk configuration.
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`: application's sign in route.
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`: application's sign up route if the selected Clerk flow uses a distinct route.
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`: common post sign in destination.
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`: common post sign up destination.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase publishable anonymous key used with the signed user token. Do not use a service role key here.
- Clerk dashboard configuration: enable the chosen sign in methods, configure organization support and invitations, and issue a token template whose organization claim is accepted by Supabase.

**Critical test scenarios**:
- Happy path: each enabled sign in method reaches the same workspace with an active organization claim; verifies **AC-1**, **AC-3**.
- Invitation path: invite a second account, accept the invitation, sign in from the app route, and verify the invited organization's workspace; verifies **AC-2**.
- Server rendering: read the organization in a server rendered component on the initial response and verify the Supabase client sends the signed token; verifies **AC-3**.
- Route protection: request a workspace route signed out and verify a redirect without protected HTML; verify sign in and invitation routes remain reachable; verifies **AC-4**.
- Theme persistence: exercise all three theme values, reload, and confirm an explicit light choice overrides a dark system preference; verifies **AC-5**.
- Responsive shell: confirm organization switching, invitation entry, theme control, and the content area are usable at narrow and wide widths; verifies **AC-6**.
- Configuration failure: omit a required key or organization claim and confirm the server reports the missing requirement without exposing a secret or falling back to anonymous access; verifies **AC-3**, **AC-7**.
- Authorization failure: attempt to switch to an organization where the current user is not a member or invite without permission; verify access is denied; verifies **AC-2**, **AC-3**.

## Build plan

Use a tracer bullet approach: prove the signed Clerk organization context reaches a protected server rendered workspace and the Supabase client first, then add the surrounding organization flows and shell. This catches token and session ownership mistakes before they are hidden behind UI work.

- [x] Configure Clerk for the application and add protected route handling, sign in, and sign up routes. Preserve provider callback and invitation routes as public. Remove any database generated session refresh setup if introduced, so Clerk remains the only session owner. **Satisfies AC-1, AC-4, AC-7**.
- [ ] Implement first sign in organization provisioning, common post sign in routing, and an organization context helper that reads the verified organization claim during server rendering. Configure Supabase token trust and a server client that forwards the Clerk token. Keep database schema unchanged. **Satisfies AC-1, AC-3, AC-7**.
- [ ] Add organization switching and invitation flow through Clerk, including the app sign in acceptance return URL and safe landing in the invited organization. **Satisfies AC-1, AC-2, AC-3**.
- [x] Replace the starter page with the responsive application shell, organization controls, invitation entry point, and a main content slot. **Satisfies AC-6**.
- [x] Add the three state theme control, persistence, root element application before first paint, and system preference behavior. **Satisfies AC-5**.
- [ ] Verify the full acceptance flows, denied access cases, missing configuration behavior, and absence of application tables or migrations. **Satisfies AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7**.

## Consequences

**Positive**:
- Later phases can use one organization identifier in server code and database policies.
- One provider owns sessions, membership, and invitations, avoiding competing cookie refresh behavior.
- The application has a stable shell and theme contract before later views are added.

**Negative / tradeoffs**:
- The Clerk dashboard, token template, allowed sign in methods, and invitation settings are deployment dependencies that must stay aligned with application configuration.
- Organization claims can change when a user switches organizations, so code must use the current verified session token and handle token refresh timing.
- Client side theme persistence can briefly fall back to system preference if browser storage is unavailable.

**Neutral**:
- This phase does not create application data or row level security policies. Supabase token forwarding is prepared for later policies, but no user data is queried yet.
- The exact workspace content and future panel layout belong to later phase specs; this phase supplies the shared shell and its content area.

## Follow-up

- [ ] Confirm in the Clerk project that the organization claim is included in the token format Supabase will validate before adding the first application table or row policy.
- [ ] Set the deployment environment variables and Clerk dashboard settings for every target environment before end to end sign in verification.

## References

**Project sources**:
- `docs/project-doc.md`, Clerk identity, Supabase database, organization claim authorization, and theme requirements.
- `AGENTS.md`, Next.js version specific documentation requirement before implementation.
- Existing `package.json` and `app/` files, current baseline uses Next.js 16.4.3 and Supabase packages but has no identity provider dependency or authentication routes.

**Practices & standards**:
- Single session owner for authentication and refresh.
- Fail closed when trusted identity or tenant context is absent.
- Never expose server secrets or service role credentials to browser code.
- Theme preference must be applied before paint to avoid a visible flash.
