# Environments

What the Admin UI talks to in each environment, and the rules for stubs and
writes. Read this when you change config, add an integration, add a stub, or
add anything that writes to a backend.

Sign-in is built (RA-738). The backend clients, backend stubs and write paths
are not yet: the rules below are for when they are.

## What runs where

| Environment | User sign-in (`AUTH_PROVIDER`) | Accreditation API and Case Management API                                                        | Writes to backends |
| ----------- | ------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------ |
| Local       | `defra-stub`, or `defra-dev`   | Stubbed, or real services run from the `DEFRA/epr-register-enrol` umbrella repo's Docker Compose | Allowed            |
| Dev         | `defra-stub`                   | Real, deployed                                                                                   | Allowed            |
| Test        | `defra-dev`, or `defra-stub`   | Real, deployed                                                                                   | Allowed            |
| Ext-test    | `defra-dev`                    | Real, deployed. As close to production as possible                                               | Allowed            |
| Perf-test   | TBC                            | TBC                                                                                              | TBC                |
| Prod        | `defra-prod`, and nothing else | Real, deployed                                                                                   | Refused            |

Local development against real backends: the umbrella repo's `compose.yml`
runs `epr-register-enrol-backend` (Accreditation API) and
`case-management-backend` (Case Management API) with their databases.

## Signing in

`AUTH_PROVIDER` says who users sign in with. Every provider runs the same
code (OpenID Connect through `openid-client`); only where it points changes.

| `AUTH_PROVIDER` | Signs users in with                                                               | Set as well                                                       |
| --------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `defra-stub`    | `DEFRA/epr-register-enrol-entra-stub` (the default)                               | `ENTRA_STUB_URL`, `APP_BASE_URL`                                  |
| `defra-dev`     | The Defra Dev Entra ID tenant                                                     | `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` (secret), `APP_BASE_URL` |
| `defra-prod`    | The Defra Entra ID tenant ([RA-757](https://eaflood.atlassian.net/browse/RA-757)) | `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` (secret), `APP_BASE_URL` |

In production (see "Telling environments apart") the service refuses to start
unless `AUTH_PROVIDER` is `defra-prod` and the client ID, client secret,
session cookie password and an `https` `APP_BASE_URL` are all set. Elsewhere,
any provider may be used.

## Stubs

- Each stub is switched on by its own config value, set per environment in
  `cdp-app-config`. Defaults are off, except sign-in: `AUTH_PROVIDER` defaults
  to `defra-stub` so the service runs locally with no secrets, and production
  refuses it.
- Stubs are for non-production environments only. The app refuses to start
  in production with any stub enabled (see "Telling environments apart"), and
  that guard has a test.
- Test may sign in through the Entra stub as well as the Defra Dev tenant.
  Ext-test uses the Defra Dev tenant only, to stay as close to production as
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
(`environment`, default `local`).

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
