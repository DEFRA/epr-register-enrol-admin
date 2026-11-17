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
npm run dev
```

The app runs on <http://localhost:3000> with vite serving front-end assets, sessions held in memory and readable logs.

To run it as it runs on CDP (production build, Redis sessions):

```bash
docker compose up --build
```

Compose starts Redis and this service. If port 3000 is taken, set `ADMIN_PORT`, for example `ADMIN_PORT=3010 docker compose up --build`.

To run against real Accreditation API and Case Management API instances, start them from the [`epr-register-enrol`](https://github.com/DEFRA/epr-register-enrol) umbrella repo's Compose stack. See [docs/environments.md](docs/environments.md).

## Checks

```bash
npm run git:pre-commit-hook
```

This runs what CI runs: the security audit (fails on high vulnerabilities), format check, lint, and the tests with coverage (100% required). The husky pre-commit hook runs it on every commit.

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
- **Outbound proxy:** CDP sets `HTTPS_PROXY`, `NO_PROXY` and `NODE_USE_ENV_PROXY` when deployed, and Node.js routes outbound requests through it. Nothing to configure in the service.
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
