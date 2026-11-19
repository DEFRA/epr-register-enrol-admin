# Agent and contributor guide

`epr-register-enrol-admin` is the internal Admin UI for the EPR Registration and
Accreditation (Reg-Accred) delivery team. It helps the team support the live
service (find accreditations, organisations, registrations and case management
work items) without direct database access.

This file is the single source of guidance for AI agents and people alike.
`CLAUDE.md` imports it.

## CDP platform first

This is a [Core Delivery Platform (CDP)](https://github.com/DEFRA/cdp-documentation)
tenant service. CDP provides logging, auditing, metrics, alerting, secrets,
the outbound proxy, service-to-service auth patterns and test suites.

Before adding any platform-shaped feature, read the matching CDP page and
follow it. The docs repo is often cloned beside this one at
`../cdp-documentation`; otherwise read it on GitHub.

| Working on                     | Read                                                   |
| ------------------------------ | ------------------------------------------------------ |
| Admin service setup, auth      | `how-to/admin-services.md`                             |
| Audit events                   | `how-to/auditing.md`, `faq/soc-audit-logging.md`       |
| Logging, personal data in logs | `how-to/logging.md`, `how-to/pii-exposure-in-logs.md`  |
| Dashboards, alerts             | `how-to/monitoring.md`, `faq/monitoring-alerting.md`   |
| Custom metrics                 | `how-to/custom-metrics.md`                             |
| Calling another service        | `how-to/service-to-service-auth.md`, `how-to/proxy.md` |
| Secrets and config             | `how-to/secrets.md`, `faq/config-and-secrets.md`       |
| Journey or performance tests   | `how-to/testing/testing.md`                            |
| General standards              | `how-to/software-standards.md`                         |

Reach for the CDP library before writing your own: `@defra/cdp-auditing`,
`@defra/cdp-metrics`, `@defra/hapi-tracing`, `@defra/hapi-secure-context`.
Auditing is the model to copy: one library call, and the platform does the
routing.

When this repo and the CDP docs disagree, raise it in the PR rather than
picking one silently.

## Architecture

- Server-side rendered hapi frontend: Nunjucks views, GOV.UK Frontend, sessions
  in Redis. No client-side app.
- It will read from two Reg-Accred backends (no backend client exists yet).
  More may follow.
  - **Accreditation API**: `DEFRA/epr-register-enrol-backend` (operator journey data).
  - **Case Management API**: `DEFRA/epr-register-enrol-management-be`.
- Internal only: served on `*.cdp-int.defra.cloud` URLs, reachable over the
  CDP VPN. There is no public route.
- Users hold SC clearance. That is a people and process control; the code
  must enforce sign-in and Entra group membership (below).

### Read-only in production

The Admin UI reads. Write behaviour (changing data in a backend) is allowed in
non-production environments only, to help testing and support rehearsals.
Every write path is:

1. behind a config flag that defaults to off, and
2. guarded server-side so it refuses in production whatever the flag says
   (decided from CDP's `ENVIRONMENT`, never `NODE_ENV`), and
3. audited.

Each of the three has a test. The full rules are in
[docs/environments.md](docs/environments.md).

### New data needs

The data this app needs may not be exposed by any endpoint yet. When that
happens, add the endpoint to the backend that owns the data, designed as a
general read endpoint that other consumers can use later. Name it for what it
returns, not for the Admin UI.

## Auth: user auth and service-to-service auth are separate

Keep the two apart in code, config and conversation.

- **User auth** answers "who is using the Admin UI?". Microsoft Entra ID
  sign-in, app role `Waste.SupportUser.ReadOnly`, group `AG-EPR-SUPPORT`.
  Every route must require an authenticated user with the role; access is denied
  by default. The only exceptions are the reviewed public list in
  `src/server/plugins/route-protection.test.js`: platform needs (`/health`,
  static assets, the favicon), home (which only redirects), the sign-in and
  sign-out pages, and the cookie pages.
- **Service-to-service auth** answers "is this caller the Admin UI?". The
  Admin UI calls each backend as itself, using a client ID and an HMAC
  signature, with read-only credentials in production. The user's Entra token
  stays inside the Admin UI. When a backend needs to know which person acted
  (for its own audit trail), send the user's identity as a separate, named
  value.

HMAC is the agreed choice for this service (epic RA-639). CDP's
service-to-service guide also describes AWS web identity tokens, and its
admin-services guide lists forwarding the user's Entra token to the backend.
We have chosen HMAC deliberately, so the backends never have to accept or
validate a user token.

**User auth is built** (RA-738):

- `openid-client` runs the sign-in (authorisation code with PKCE, state and
  nonce) and token refresh. It checks the ID token; the user's roles come
  from its `roles` claim.
- The session lives in Redis through yar. `src/server/plugins/auth.js` makes
  every route need the role by default.
- `AUTH_PROVIDER` picks the stub, the Defra Dev tenant or the Defra tenant;
  see [docs/environments.md](docs/environments.md).
- A new route needs nothing to be protected. Making one public means
  `auth: false` (or `publicRoute`, to show who is signed in) plus an entry,
  with its reason, in `route-protection.test.js`.

Service-to-service auth arrives with the first backend integration. Reuse what
the team already has rather than writing a second version that will drift:
HMAC request signing and the backend client in
`epr-register-enrol-management-fe`, `src/server/common/helpers/backend-api/`
(`sign-request.js`, `backend-api.js`).

## Errors: tell the user, keep them on the page

Load is low, so every error matters and every error is visible.

- When a backend call fails, render the page with a GOV.UK notification banner
  that says what failed in plain words ("Case management data is unavailable
  right now"), and keep the rest of the page working. The user stays where
  they are.
- Log every failure at `error` level, with the upstream service named and the
  trace ID carried by `@defra/hapi-tracing`. A failure shown in a banner still
  returns a 200, so CDP's default metric alerts (status codes, response time,
  tasks, CPU, memory) won't see it. An OpenSearch alert matching `error` logs
  is what catches it; that alert is built in Grafana (see below), not
  automatic.
- Banners and error pages show our own wording only: stack traces and upstream
  response bodies stay in the logs.
- The catch-all error handler (`src/server/common/helpers/errors.js`) handles
  every error response. A 401 goes to sign-in, coming back to the page
  afterwards. A 403 for a signed-in user without the role is the access-denied
  page. Anything else (404s, other 403s, CSRF 400s and, as a last resort,
  unhandled exceptions) renders the error page. A 5xx reaching it is a bug to
  fix.

## Monitoring and alerting

Any error, 5xx, upstream failure or timeout should reach the team.

- Dashboards and alerts live in CDP Grafana, not in this repo. Build them in
  the dev `Playground/epr-register-enrol-admin-monitoring` folder and ask
  `#cdp-support` to promote them. Check the CDP monitoring docs before adding
  anything alerting-related to the repo.
- Alerts go to the team's shared Slack channels,
  `epr-register-enrol-team-alerts-non-prod` and
  `epr-register-enrol-team-alerts-prod`, as for the other `epr-register-enrol-*`
  services. They are set in `cdp-tenant-config`, not in this repo.
- Custom metrics are unlikely to be needed. If they are, use `request.metrics`
  from `@defra/cdp-metrics` with low-cardinality dimensions (route, outcome),
  never user or record IDs.

## Auditing

Use `audit()` from `@defra/cdp-auditing`. Audit events go to the CDP SOC
pipeline, not OpenSearch, and can be read from CDP Terminal in dev, test and
perf-test only.

Audit these events:

- sign-in, sign-out and access denied
- every record view: who viewed which record
- every search
- every write (non-production only)

Search terms and record contents can contain personal data. Record identifiers
and the minimum context needed; agree any personal data with SOC first.

## Testing

### Coverage: 100%

Unit test coverage is 100% for statements, branches, functions and lines, and
the build fails below that. There are no coverage exclusions for source code:
code that cannot be run by a test is dead, and gets deleted.

Coverage comes from tests that would fail if the code were wrong. Every test
asserts an outcome someone relies on: what the user sees, what is logged or
audited, what is sent to another service. A test that only runs a line
(checking a listener exists, that a call doesn't throw, or that a config value
is set when nothing reads it) is not a test. Write a real assertion, or, if the
code has no observable effect, delete the code. Name each test for the
behaviour it checks.

### Test behaviour from the user's view

Test what a user sees and does. Drive a route with `server.inject()`, parse the
HTML with `cheerio`, and assert on what the user would see: headings, table
rows, links, banners, and what an unauthorised user gets. This applies to
browser-side scripts too: test them in a jsdom environment.

Build the server with `createServer()` then `server.initialize()`.
`server.inject()` needs no open port, so tests run alongside anything else on
the machine.

Save assertions about internal functions for complex logic, such as search
parsing or record linking, where the algorithm itself is the behaviour.

### Mock at the app boundary

Mock only what lies outside this application, and mock it at the outermost
layer:

- Outbound HTTP (backend APIs, Entra ID): mock at the network with `msw`, so
  our own client code runs in every test. The shared server is
  `test-helpers/msw-server.js`, and any request a test hasn't set up fails the
  test. For sign-in, `test-helpers/fake-entra.js` serves a fake provider and
  `signIn()` signs a user in through the real routes.
- `@defra/cdp-auditing`, `@defra/cdp-metrics`, Redis: mock the dependency
  itself.

msw, not a `fetch` mock, because it also catches requests made with Node's
`http` module, which some libraries use instead of `fetch`.

Every module inside this repo runs for real in new tests. If one genuinely
cannot, mock it and leave a comment saying why. Some tests that came with the
CDP template mock in-repo modules (`context.test.js`, `cache-engine.test.js`,
`start-server.test.js`); don't copy them, and bring them into line when you
touch them.

> **Deliberate contradiction:** `epr-register-enrol-frontend`'s `CLAUDE.md`
> tells agents to mock `apiClient` with `vi.spyOn`. This repo does not follow
> that convention. Mocking at the HTTP layer tests the real request building,
> error handling and response parsing.

### Test against deployed services

Prefer real integrations wherever an environment has them. What the Admin UI
talks to changes by environment (stubs locally, real backends from dev, the
Entra stub up to ext-test until RA-798 moves test and ext-test to the Defra Dev
tenant). See [docs/environments.md](docs/environments.md).

## Security

- Personal data stays out of logs, metrics dimensions and error messages. If
  it leaks into OpenSearch, follow CDP's `how-to/pii-exposure-in-logs.md`.
- Pages that show personal data send `Cache-Control: no-store`.
- Validate every input (query, params, payload) with Joi.
- Keep the template's CSRF protection (`@hapi/crumb`) and Content Security
  Policy (`blankie`) on every route.
- Secrets come from CDP secrets as environment variables; config files hold
  names and defaults only.
- Production credentials for backends are read-only.

### Mask personal data by default

Personal data is masked on screen. Unmasking a field later is easy; a leak
cannot be taken back, so masking is the default until a field is explicitly
cleared for display.

- Personal data means anything about an individual: names, email addresses,
  phone numbers, personal or home addresses, dates of birth, and any free text
  that might contain them. When unsure whether a field is personal, mask it.
- Mask on the server, before rendering. The full value never reaches the HTML,
  hidden fields, data attributes, browser-side scripts or the session.
- **Exception: the signed-in user's own name and email.** They are kept in the
  session and shown unmasked in the header and on the access-denied page
  (RA-738, AC06 and AC08), because they tell users which account they are
  using and need no protection from the person they belong to.
- All masking goes through one shared helper, used by views and by anything
  that logs or audits a value, so the rules live in one place and are tested
  there.
- Showing a personal field unmasked is a deliberate, reviewed change: name the
  field and the reason in the PR. The question of masking stays open on epic
  RA-639; until it is settled, masking applies everywhere, prod and non-prod.

## Quality gates

Before pushing, run `npm run git:pre-commit-hook` (security audit, format
check, lint, tests with coverage). CI also builds the front end, runs the
SonarCloud scan and builds the Docker image. The husky pre-commit hook runs
it on every commit.
