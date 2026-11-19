# epr-register-enrol-admin

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_epr-register-enrol-admin&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_epr-register-enrol-admin)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_epr-register-enrol-admin&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_epr-register-enrol-admin)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_epr-register-enrol-admin&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_epr-register-enrol-admin)

Internal Admin UI for the EPR Registration and Accreditation delivery team, built on the Core Delivery Platform (CDP).

How we build this service (architecture, auth, testing, errors, monitoring, auditing and security) is in [AGENTS.md](AGENTS.md), written for people and AI agents alike. What runs in each environment is in [docs/environments.md](docs/environments.md).

## Requirements

- Node.js: the version in [`.nvmrc`](.nvmrc). With [nvm](https://github.com/nvm-sh/nvm), run `nvm use`.
- Docker, for the Compose stack.

## Running locally

```bash
npm install
STUB_INTERNAL_URL=http://localhost:3010 docker compose up -d epr-register-enrol-entra-stub
npm run dev
```

`STUB_INTERNAL_URL` tells the stub to give out its token endpoint on `localhost`, which the app on your machine can reach. Leave it out when running the whole stack with Compose.

The app runs on <http://localhost:3000> with vite serving front-end assets, sessions held in memory and readable logs.

### Signing in

Every page needs you to sign in. Locally you sign in through [`epr-register-enrol-entra-stub`](https://github.com/DEFRA/epr-register-enrol-entra-stub) on port 3010, which the command above starts. The password for every stub user is `pass`:

- `support.readonly@test.gov.uk` has the `Waste.SupportUser.ReadOnly` role and can use the service.
- `no.role@test.gov.uk` has no role and sees the "You do not have access" page.

The stub issues no refresh tokens, so you sign in again after about an hour.

The stub only knows this service once [DEFRA/epr-register-enrol-entra-stub#25](https://github.com/DEFRA/epr-register-enrol-entra-stub/pull/25) is released. Until then, build the stub from that branch and run it with `EPR_REGISTER_ENROL_ENTRA_STUB=<your tag> docker compose up …`. Who users sign in with in each environment, and the settings for it, are in [docs/environments.md](docs/environments.md#signing-in).

To sign in through real Entra ID on the Defra Dev tenant instead, with a Defra Dev account in `AG-EPR-SUPPORT`:

```bash
AUTH_PROVIDER=defra-dev \
ENTRA_TENANT_ID=<the Defra Dev tenant ID, as in cdp-app-config> \
ENTRA_CLIENT_ID=<the Defra Dev app registration's client ID> \
ENTRA_CLIENT_SECRET=<its client secret> \
npm run dev
```

The registration accepts `http://localhost:3000`, so run on port 3000.

To run the production build with Redis sessions, closer to how it runs on CDP:

```bash
docker compose up --build
```

Compose starts Redis, the Entra ID stub and this service. If port 3000 is taken, set `ADMIN_PORT`, for example `ADMIN_PORT=3001 docker compose up --build`. It differs from CDP in a few ways so it works on a laptop: readable logs instead of ECS, cookies allowed over plain HTTP, and Redis without TLS or a cluster.

The app doesn't call the Accreditation API or Case Management API yet. When it does, real local instances will come from the [`epr-register-enrol`](https://github.com/DEFRA/epr-register-enrol) umbrella repo's Compose stack. See [docs/environments.md](docs/environments.md).

## Checks

```bash
npm run git:pre-commit-hook
```

This runs the security audit (fails on high vulnerabilities), format check, lint, and the tests with coverage (100% required). The husky pre-commit hook runs it on every commit. CI runs the same checks, and also builds the front end, runs the SonarCloud scan and builds the Docker image.

All npm scripts are in [package.json](package.json); `npm run` lists them.

## CI and deployment

| Workflow                                                       | Runs                  | Does                                                                               |
| -------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| [Check Pull Request](.github/workflows/check-pull-request.yml) | Every PR to `main`    | Audit, build, format, lint, tests, coverage comment, SonarCloud scan, Docker build |
| [Publish](.github/workflows/publish.yml)                       | Every merge to `main` | Tests, builds and publishes the image CDP deploys, SonarCloud scan                 |
| [Publish Hot Fix](.github/workflows/publish-hotfix.yml)        | Started by hand       | As Publish, from a hotfix branch                                                   |

Deployments to each environment are made from the [CDP Portal](https://portal.cdp-int.defra.cloud). Dependabot raises grouped dependency updates weekly ([config](.github/dependabot.yml)).

## Platform notes

- **Sessions:** Redis when deployed, in memory locally. Override with `SESSION_CACHE_ENGINE` (`redis` or `memory`). Memory is not suitable for deployed environments: it is not shared between instances.
- **Outbound proxy:** CDP sets `HTTP_PROXY` when deployed. This service's `defaults.env` in [`cdp-app-config`](https://github.com/DEFRA/cdp-app-config) sets `NODE_USE_ENV_PROXY`, `HTTPS_PROXY` and `NO_PROXY`, so Node.js routes outbound requests through the proxy with no code. Change `NO_PROXY` there, not in the service.
- **Dependency overrides:** `overrides` in `package.json` force patched versions of `joi` into `blankie` (which depends on the old `@hapi/joi`) and `hapi-pulse`, to fix high-severity advisories in the versions they ask for. Remove each one once that package depends on a patched `joi` itself.
- **Windows line endings:** if Prettier reports line-ending changes, run `git config --global core.autocrlf false`.

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
