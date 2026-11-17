# Environments

What the Admin UI talks to in each environment, and the rules for stubs and
writes. Read this when you change config, add an integration, add a stub, or
add anything that writes to a backend.

## What runs where

| Environment | User sign-in               | Accreditation API and Case Management API                                                        | Writes to backends |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| Local       | Stubbed                    | Stubbed, or real services run from the `DEFRA/epr-register-enrol` umbrella repo's Docker Compose | Allowed            |
| Dev         | Stubbed                    | Real, deployed                                                                                   | Allowed            |
| Test        | Dev Entra ID tenant        | Real, deployed                                                                                   | Allowed            |
| Ext-test    | Dev Entra ID tenant        | Real, deployed. As close to production as possible                                               | Allowed            |
| Prod        | Production Entra ID tenant | Real, deployed                                                                                   | Refused            |

Local development against real backends: the umbrella repo's `compose.yml`
runs `epr-register-enrol-backend` (Accreditation API) and
`case-management-backend` (Case Management API) with their databases.

## Stubs

- Each stub is switched on by its own config value, set per environment in
  `cdp-app-config`. Defaults are off.
- Stubs exist for local and dev only. The app refuses to start in production
  when any stub is enabled, and that guard has a test.
- Automated tests in test and ext-test sign in with a real Entra test account,
  with its credentials held as CDP secrets. Stubbing sign-in there is a last
  resort, agreed with the team first, because it breaks the "no stubs from
  test onwards" rule above.

## Writes

The Admin UI is read-only in production. Any feature that writes to a backend:

1. sits behind its own config flag, default off, switched on per non-production
   environment in `cdp-app-config`;
2. is refused server-side in production regardless of that flag (check the
   environment, not only the flag);
3. emits an audit event with who wrote what;
4. has a test for each of the three points above.

## Config and secrets

- Config lives in `src/config/config.js` (convict). Each value names its
  environment variable and has a safe default.
- Per-environment values are set in `DEFRA/cdp-app-config`; secrets are set in
  the CDP portal and arrive as environment variables. See CDP's
  `how-to/secrets.md`.
