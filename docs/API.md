# API surface

Status: draft v1, 2026-10-29. REST over JSON, versioned under `/v1`. Auth is a bearer JWT plus the
`X-Workspace-Id` header, checked against membership. Errors use RFC 9457 problem details with a stable `code`.
Lists are cursor-paginated (`?cursor=&limit=`). Every mutating endpoint accepts an `Idempotency-Key`.

Request and response schemas live in `packages/contracts` (zod), and OpenAPI is generated from them.

## Auth and account

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/auth/signup` | email, password, name → sends verification |
| POST | `/v1/auth/verify-email` | token |
| POST | `/v1/auth/login` | → access + refresh; MFA challenge if enabled |
| POST | `/v1/auth/refresh` | rotating refresh token |
| POST | `/v1/auth/logout` | |
| POST | `/v1/auth/password/forgot` · `/reset` | |
| POST | `/v1/auth/mfa/enable` · `/verify` · `/disable` | TOTP |
| GET | `/v1/me` | user + workspaces |

## Workspaces and team

| Method | Path | Role |
|---|---|---|
| POST | `/v1/workspaces` | any user |
| GET/PATCH | `/v1/workspace` | read: member · write: admin |
| GET | `/v1/workspace/members` | member |
| POST | `/v1/workspace/invitations` | admin |
| POST | `/v1/invitations/:token/accept` | invited user |
| PATCH/DELETE | `/v1/workspace/members/:userId` | owner |

## Company brain

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/company/prefill` | `{ website }` → queued job; result drafts profile + facts |
| GET/PUT | `/v1/company/profile` | PUT bumps version |
| GET/POST | `/v1/company/facts` | |
| PATCH/DELETE | `/v1/company/facts/:id` | |

## Roles and staff

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/roles` | available roles, interview questions, required connectors, entitlement |
| POST | `/v1/staff` | `{ roleKey, displayName, disclosure, settings }` → `draft` |
| GET | `/v1/staff` · `/v1/staff/:id` | |
| PATCH | `/v1/staff/:id` | settings validated by role schema |
| POST | `/v1/staff/:id/activate` | readiness check (connectors healthy, entitlement, required facts) |
| POST | `/v1/staff/:id/pause` · `/resume` · `/archive` | |
| GET/PATCH | `/v1/staff/:id/tasks` | autonomy, schedule and limits per task type |
| POST | `/v1/staff/:id/tasks/:taskType/run` | "do it now" (person trigger) |
| GET | `/v1/staff/:id/activity` | activity log |
| GET | `/v1/staff/:id/report?period=` | |
| POST | `/v1/staff/:id/promotions/:offerId/accept` · `/decline` | |
| GET | `/v1/autopilot` | Tasks that publish or send, with mode, rules, progress and offers (any member). |
| PUT | `/v1/staff/:id/autopilot/:taskType` | `{ mode: off\|ask\|auto, rules?: { approvals, windowDays, maxMedianEditRatio, maxPerDay } }` (admin). |
| POST | `/v1/staff/:id/autopilot/:taskType/enable` | Turn on now, skipping the record. Body `{ confirm: true }` (owner). |
| POST | `/v1/staff/:id/autopilot/:taskType/stop` | Back to approval, mode `ask` (admin). |

## Connectors

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/connectors` | available kinds + connected accounts + health |
| GET | `/v1/connectors/:kind/oauth/start` | redirect; `state` bound to session and workspace |
| GET | `/v1/connectors/:kind/oauth/callback` | |
| POST | `/v1/connectors/smtp-imap` | credentials → verify, then DNS checks, then test send |
| POST | `/v1/connectors/:id/verify` | re-run health |
| DELETE | `/v1/connectors/:id` | revoke + pause dependent tasks |

## Approval inbox

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/inbox?staffId=&kind=&state=pending` | |
| GET | `/v1/inbox/:id` | includes the evidence the staff member used |
| POST | `/v1/inbox/:id/approve` | optional edited payload; records edit distance |
| POST | `/v1/inbox/:id/reject` | `{ reason }` |
| POST | `/v1/inbox/:id/take-over` | conversation → human-handled |

## Social Media Staff

| Method | Path |
|---|---|
| GET/POST | `/v1/social/campaigns` |
| GET | `/v1/social/plans?week=` |
| GET/POST/PATCH | `/v1/social/posts` |
| POST | `/v1/social/posts/:id/schedule` · `/publish-now` · `/cancel` |
| POST | `/v1/social/suggest` (synchronous captions, rate-limited) |
| GET/POST | `/v1/media` (upload via signed URL) |
| GET | `/v1/social/engagements` |
| GET | `/v1/social/metrics?from=&to=` |

## Sales Manager Staff

| Method | Path |
|---|---|
| GET/POST | `/v1/leads` |
| POST | `/v1/leads/import` (CSV upload → validation preview → confirm) |
| PATCH | `/v1/leads/:id` · POST `/v1/leads/:id/assign` |
| GET | `/v1/conversations` · `/v1/conversations/:id` |
| POST | `/v1/conversations/:id/reply` (human) · `/close` · `/give-back` |
| GET/POST/DELETE | `/v1/suppressions` |

## Video (Social Media Staff)

| Method | Path | Notes |
|---|---|---|
| GET/PUT | `/v1/brand-kit` | |
| GET | `/v1/social/video-ideas` · POST `/:id/pick` · `/:id/dismiss` | |
| POST | `/v1/social/video-ideas/generate` | person trigger |
| GET | `/v1/social/video-scripts/:id` · POST `/:id/approve` · `/:id/request-changes` | |
| GET | `/v1/social/video-renders/:id` | status, variants, manifest |
| POST | `/v1/social/video-renders/:id/watched` | records watched-to-end (signed playback token) |
| POST | `/v1/social/video-renders/:id/approve` | `{ checklist, networks, scheduleFor }`; rejected unless watched + checklist complete |
| POST | `/v1/social/video-renders/:id/rerender` | `{ mode? }` |
| GET/POST/DELETE | `/v1/likeness-consents` | owner only |

## Voice (Sales Manager Staff)

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/voice/numbers/available?country=&areaCode=` | |
| POST | `/v1/voice/numbers` | provision; starts regulatory flow if needed |
| POST | `/v1/voice/numbers/forwarded` | register an existing number + verification call |
| GET/PATCH/DELETE | `/v1/voice/numbers/:id` | |
| GET/POST | `/v1/voice/regulatory-bundles` | document upload via signed URL |
| GET/PUT | `/v1/staff/:id/handoff-targets` | |
| GET | `/v1/calls` · `/v1/calls/:id` | transcript, summary, recording (signed URL) |
| GET | `/v1/calls/live` | active calls (SSE stream for live transcript) |
| POST | `/v1/calls/:id/take-over` | returns WebRTC token for the browser |
| POST | `/v1/calls/outbound` | `{ leadId }` or `{ callListId }`; consent/DNC/hours checks; may return a `work_item` if autonomy = draft |
| GET/POST | `/v1/consents` · POST `/v1/consents/:id/withdraw` | |
| GET/POST/DELETE | `/v1/dnc` | |

## Billing

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/billing/plans` | |
| GET | `/v1/billing/subscription` | plan, seats, period, usage vs allowance, spend vs cap |
| POST | `/v1/billing/checkout` | `{ planKey, seats }` → Paystack authorization URL |
| POST | `/v1/billing/change` | upgrade or downgrade (proration rules in BILLING.md) |
| POST | `/v1/billing/cancel` | at period end |
| GET/PUT | `/v1/billing/spend-cap` | owner only |
| GET | `/v1/billing/invoices` | |

## Webhooks (public, signature-verified, idempotent)

| Path | Verification |
|---|---|
| `POST /v1/webhooks/paystack` | `x-paystack-signature` HMAC-SHA512 of the raw body |
| `POST /v1/webhooks/meta` | `X-Hub-Signature-256`, plus GET verify token |
| `POST /v1/webhooks/linkedin` · `/x` | per-provider signatures |
| `POST /v1/inbound/mail/:mailboxId/:secret` | secret compared in constant time, stored hashed |
| `POST /v1/webhooks/telephony/:event` (incoming, status, recording, regulatory) | provider request signature (for example an HMAC over the URL and params) |
| `WS /voice/stream` (voice gateway) | one-time stream token issued in the incoming-call response |
| `POST /v1/webhooks/render/:provider` | provider signature or shared secret, plus job ID lookup |
| `POST /v1/webhooks/tiktok` · `/youtube` | per-provider verification |

## Platform admin (separate auth, audited)

- `GET /v1/admin/workspaces`, `GET /v1/admin/usage`
- `POST /v1/admin/workspaces/:id/suspend`
- `POST /v1/admin/kill-switch` — `{ scope: platform | role | workspace, target }`
- `POST /v1/admin/impersonate/:workspaceId` — read-only, time-boxed, logged
