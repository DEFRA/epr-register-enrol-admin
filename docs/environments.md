# Environments

What the Admin UI talks to in each environment, and the rules for stubs and
writes. Read this when you change config, add an integration, add a stub, or
add anything that writes to a backend.

Sign-in is built (RA-738), and so is the Accreditation API client, used by the
search page (RA-740). Backend stubs, the Case Management API client and write
paths are not built yet: the rules below are for when they are.

## What runs where

| Environment | User sign-in (`AUTH_PROVIDER`) | Accreditation API and Case Management API                                                        | Writes to backends |
| ----------- | ------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------ |
| Local       | `defra-stub`, or `defra-dev`   | Stubbed, or real services run from the `DEFRA/epr-register-enrol` umbrella repo's Docker Compose | Allowed            |
| Dev         | `defra-stub`                   | Real, deployed                                                                                   | Allowed            |
| Test        | `defra-stub`                   | Real, deployed                                                                                   | Allowed            |
| Ext-test    | `defra-stub`                   | Real, deployed. As close to production as possible                                               | Allowed            |
| Perf-test   | TBC                            | TBC                                                                                              | TBC                |
| Prod        | `defra-prod`, and nothing else | Real, deployed                                                                                   | Refused            |

Local development against real backends: the umbrella repo's `compose.yml`
runs `epr-register-enrol-backend` (Accreditation API) and
`case-management-backend` (Case Management API) with their databases. The
README says how to point the Admin UI at them.

## Calling the Accreditation API

The Admin UI calls `epr-register-enrol-backend` as itself, signed with HMAC
(see AGENTS.md, Auth). The backend knows it as the service client named
`admin`, with the client ID `epr-register-enrol-admin` and the secret
`AUTH_SHARED_SECRET__ADMIN`. The two sides must hold the same secret.

| Environment | `BACKEND_URL` (cdp-app-config)                                    | `BACKEND_API_SHARED_SECRET` (CDP secret)      |
| ----------- | ----------------------------------------------------------------- | --------------------------------------------- |
| Local       | `http://localhost:8080` (the default: the umbrella Compose stack) | Set by hand, to match the local backend       |
| Dev         | `epr-register-enrol-backend` in dev                               | The dev backend's `AUTH_SHARED_SECRET__ADMIN` |
| Test        | `epr-register-enrol-backend` in test                              | The test backend's                            |
| Ext-test    | `epr-register-enrol-backend` in ext-test                          | The ext-test backend's                        |
| Perf-test   | TBC                                                               | TBC                                           |
| Prod        | `epr-register-enrol-backend` in prod                              | The prod backend's                            |

Each deployed environment needs `BACKEND_URL` set in `cdp-app-config` and the
secret added in the CDP portal (secrets: RA-799). Production refuses to start
without either. Elsewhere a missing secret sends unsigned calls, which the
backend refuses, and the search page shows its "unavailable" banner.

## Signing in

`AUTH_PROVIDER` says who users sign in with. Every provider runs the same
code (OpenID Connect through `openid-client`); only where it points changes.

| `AUTH_PROVIDER` | Signs users in with                                                               | Set as well                                                                          |
| --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `defra-stub`    | `DEFRA/epr-register-enrol-entra-stub` (the default)                               | `ENTRA_STUB_URL`, `APP_BASE_URL`                                                     |
| `defra-dev`     | The Defra Dev Entra ID tenant                                                     | `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` (secret), `APP_BASE_URL` |
| `defra-prod`    | The Defra Entra ID tenant ([RA-757](https://eaflood.atlassian.net/browse/RA-757)) | `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` (secret), `APP_BASE_URL` |

In production (see "Telling environments apart") the service refuses to start
unless `AUTH_PROVIDER` is `defra-prod` and the tenant ID, client ID, client secret,
session cookie password and an `https` `APP_BASE_URL` are all set, along with
`BACKEND_URL` and `BACKEND_API_SHARED_SECRET`. Elsewhere,
any provider may be used.

## Stubs

- Each stub is switched on by its own config value, set per environment in
  `cdp-app-config`. Defaults are off, except sign-in: `AUTH_PROVIDER` defaults
  to `defra-stub` so the service runs locally with no secrets, and production
  refuses it.
- Stubs are for non-production environments only. The app refuses to start
  in production with any stub enabled (see "Telling environments apart"), and
  that guard has a test.
- Test and ext-test sign in through the Entra stub until they move to the
  Defra Dev tenant
  ([RA-798](https://eaflood.atlassian.net/browse/RA-798)). After that,
  ext-test uses the Defra Dev tenant only, to stay as close to production as
  possible.

## Writes

The Admin UI is read-only in production. Any feature that writes to a backend:

1. sits behind its own config flag, default off, switched on per non-production
   environment in `cdp-app-config`;
2. is refused server-side outside the non-production environments, regardless
   of that flag (see "Telling environments apart");
3. emits an audit event with who wrote what;
4. has a test for each of the three points above.

## Telling environments apart

Use CDP's `ENVIRONMENT` variable, which the platform sets to the environment's
name (`dev`, `test`, `ext-test`, `perf-test`, `prod` and so on). Read it
through a convict value, as `epr-register-enrol-management-fe` does
(`environment`). Its default is `local` for local development, but empty for
a production build (`NODE_ENV=production`), which counts as production, so a
deployed service can never fall back to `local`.

- Don't use `isProduction`. It is `NODE_ENV === 'production'`, which is true in
  every deployed environment, dev included.
- Allow, don't deny. `src/config/environment.js` lists the non-production
  environments. Any other value of `ENVIRONMENT`, or none on a deployed
  service, is treated as production.

## Config and secrets

- Config lives in `src/config/config.js` (convict). Values that change per
  environment name their environment variable, and every value has a safe
  default.
- Per-environment values are set in `DEFRA/cdp-app-config`; secrets are set in
  the CDP portal and arrive as environment variables. See CDP's
  `how-to/secrets.md`.
