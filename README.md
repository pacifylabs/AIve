# AI Staff (working name)

A standalone SaaS where businesses "hire" AI staff members who do real work inside limits the business sets.
Launch roles: **Social Media Staff** and **Sales Manager Staff**. The platform is built so new roles are added as
role definitions, not new platforms.

The proof of work is KudiBooks' sales agent and social module (`../kudibooks`). This project ports that machinery
into a multi-tenant product of its own. Nothing here depends on KudiBooks at runtime.

Status: milestone 1 (foundations) in progress. Sign-up, sign-in, two-step sign-in, workspaces, team invitations,
row-level security and the worker queue work locally.

## Running it locally

Requirements: Node 24, pnpm 10, Docker.

```bash
docker compose up -d          # Postgres :5460, Redis :6390, Mailpit :1030 (inbox UI at http://localhost:8030)
pnpm install
cp .env.example apps/api/.env # then fill JWT_ACCESS_SECRET and ENCRYPTION_KEYS (see the comments in the file)
cp apps/api/.env apps/worker/.env
pnpm build
pnpm db:migrate
pnpm --filter @ai-staff/api dev      # API on http://localhost:3100 (rebuild with dev:build in another terminal)
pnpm --filter @ai-staff/web dev      # web app on http://localhost:3101
pnpm --filter @ai-staff/worker dev   # queue worker
```

`pnpm test` runs every suite. The API tests create a throwaway database per run and connect as the
row-level-security-bound app role, so tenant isolation is tested against real Postgres policies.

| Path                 | What                                                                            |
| -------------------- | ------------------------------------------------------------------------------- |
| `apps/api`           | NestJS HTTP API (`/v1`, problem+json errors, `/health/live`, `/health/ready`)   |
| `apps/worker`        | NestJS BullMQ worker (no HTTP)                                                  |
| `apps/web`           | Next.js app; tokens live in httpOnly cookies and only server code calls the API |
| `packages/config`    | The only reader of environment variables, validated with zod                    |
| `packages/contracts` | Request/response schemas and error codes shared by API and web                  |
| `packages/db`        | Entities, SQL migrations, `withTenant` / `asSystem` for row-level security      |

## Documents

Read in this order:

| Doc                                                                    | What it answers                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [docs/PRD.md](docs/PRD.md)                                             | What we are building, for whom, and what launch includes                       |
| [docs/ROLE-FRAMEWORK.md](docs/ROLE-FRAMEWORK.md)                       | What a "staff member" is and how a new role plugs in                           |
| [docs/roles/SOCIAL-MEDIA-STAFF.md](docs/roles/SOCIAL-MEDIA-STAFF.md)   | The social media role: tasks, connectors, guardrails                           |
| [docs/roles/SALES-MANAGER-STAFF.md](docs/roles/SALES-MANAGER-STAFF.md) | The sales role: tasks, connectors, guardrails                                  |
| [docs/VOICE.md](docs/VOICE.md)                                         | The sales voice line: numbers, live AI calls, handoff, consent-gated outbound  |
| [docs/VIDEO.md](docs/VIDEO.md)                                         | The social video pipeline: ideas, scripts, rendering, mandatory review, labels |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                           | System design, components, flows, stack, deployment                            |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md)                               | Tables and how tenancy is enforced                                             |
| [docs/API.md](docs/API.md)                                             | HTTP API surface for the web app, webhooks and workers                         |
| [docs/ONBOARDING.md](docs/ONBOARDING.md)                               | Sign-up to first useful work in under 10 minutes                               |
| [docs/BILLING.md](docs/BILLING.md)                                     | Plans, metering, caps, Paystack integration                                    |
| [docs/SECURITY-AND-COMPLIANCE.md](docs/SECURITY-AND-COMPLIANCE.md)     | Tenancy, secrets, prompt injection, email and privacy law                      |
| [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md)             | Milestones, what is ported from KudiBooks, exit criteria                       |
| [docs/DECISIONS.md](docs/DECISIONS.md)                                 | Settled decisions and open questions                                           |

## Stack (planned)

pnpm + Turborepo monorepo · NestJS + TypeScript (strict) API, worker and voice gateway · Next.js web app ·
PostgreSQL · Redis + BullMQ · Anthropic Claude models behind a provider interface · telephony, STT/TTS and video
renderers behind interfaces (vendors chosen in milestone 0) · FFmpeg · Paystack billing.
