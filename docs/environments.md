# Environments

What the Admin UI talks to in each environment, and the rules for stubs and
writes. Read this when you change config, add an integration, add a stub, or
add anything that writes to a backend.

These are the rules features must follow. None of them is built yet: there is
no sign-in, backend client, stub or write path today. Sign-in arrives with
RA-738.

## What runs where

| Environment | User sign-in               | Accreditation API and Case Management API                                                        | Writes to backends |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| Local       | Stubbed                    | Stubbed, or real services run from the `DEFRA/epr-register-enrol` umbrella repo's Docker Compose | Allowed            |
| Dev         | Stubbed                    | Real, deployed                                                                                   | Allowed            |
| Test        | Dev Entra ID tenant        | Real, deployed                                                                                   | Allowed            |
| Ext-test    | Dev Entra ID tenant        | Real, deployed. As close to production as possible                                               | Allowed            |
| Perf-test   | TBC                        | TBC                                                                                              | TBC                |
| Prod        | Production Entra ID tenant | Real, deployed                                                                                   | Refused            |

Local development against real backends: the umbrella repo's `compose.yml`
runs `epr-register-enrol-backend` (Accreditation API) and
`case-management-backend` (Case Management API) with their databases.

## Stubs

- Each stub is switched on by its own config value, set per environment in
  `cdp-app-config`. Defaults are off.
- Stubs exist for local and dev only. The app refuses to start with any stub
  enabled outside those environments (see "Telling environments apart"), and
  that guard has a test.
- Automated tests in test and ext-test sign in with a real Entra test account,
  with its credentials held as CDP secrets. Stubbing sign-in there is a last
  resort, agreed with the team first, because it breaks the "no stubs from
  test onwards" rule above.

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
- Allow, don't deny. Writes and stubs are permitted only when `ENVIRONMENT` is
  one of the environments the table above allows them in. Any other value, or
  none, is treated as production.

## Config and secrets

- Config lives in `src/config/config.js` (convict). Values that change per
  environment name their environment variable, and every value has a safe
  default.
- Per-environment values are set in `DEFRA/cdp-app-config`; secrets are set in
  the CDP portal and arrive as environment variables. See CDP's
  `how-to/secrets.md`.
