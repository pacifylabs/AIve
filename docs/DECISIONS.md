# Decisions

Settled decisions are not reopened without new information. Add new ones at the bottom with a date.

## Settled

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-10-29 | AI Staff is a **standalone business**, not a KudiBooks add-on | Sell to any business; KudiBooks is the proof of work and code template only |
| D2 | 2026-10-29 | Launch roles: **Social Media Staff** and **Sales Manager Staff**. Business manager dropped | Clear jobs, existing proven code, and they hand work to each other |
| D3 | 2026-10-29 | **Roles are definitions (plugins)** on a shared platform; roles return effects and never call the outside world | New roles without platform changes; every action stays auditable, budgeted and pausable |
| D4 | 2026-10-29 | **Global** market, English content at launch | Founder decision |
| D5 | 2026-10-29 | **Paystack** for payments, prices in USD | Founder decision; USD availability to be confirmed (Q1) |
| D6 | 2026-10-29 | Our own billing schedule using Paystack `charge_authorization`, not Paystack Subscriptions | Seats, bundles, proration and top-ups |
| D7 | 2026-10-29 | Prepaid top-ups instead of post-paid overage | Avoids uncollectable debt; no metered billing in Paystack |
| D8 | 2026-10-29 | Probation by default: external actions are drafts until a person accepts a promotion | Trust built from the owner's own approvals; the core product idea |
| D9 | 2026-10-29 | Sales sends from the **customer's own mailbox and domain** (SMTP/IMAP at launch) | Isolates reputation; avoids Google/Microsoft restricted-scope review at launch |
| D10 | 2026-10-29 | Customers bring their own leads; no list scraping or data buying | Legal exposure and deliverability |
| D11 | 2026-10-29 | Stack: pnpm/Turborepo, NestJS, Next.js, PostgreSQL, Redis + BullMQ, Anthropic behind a provider port | Founder's usual stack; matches KudiBooks code being ported |
| D12 | 2026-10-29 | Separate `api` and `worker` deployables from one codebase | Independent scaling; model latency never blocks HTTP |
| D13 | 2026-10-29 | One shared **company brain** per workspace; facts are the only ground truth | One onboarding for all roles; the facts-only guardrail needs a source |
| D14 | 2026-10-29 | Port KudiBooks code by copying, not sharing packages | KudiBooks stays stable; the new product evolves freely |
| D15 | 2026-10-29 | **Voice line is in launch scope** for Sales Manager Staff: own or forwarded number, inbound AI answering, live handoff to a person (phone or browser), and outbound calls **only with recorded consent** | Founder decision; consent gating because AI-voice calls without consent are unlawful in key markets |
| D16 | 2026-10-29 | **Video is in launch scope** for Social Media Staff: trend/product ideas, scripts, rendering in template, presenter and generative modes. **The final video is always watched and approved by a person; this gate is not promotable** | Founder decision; generated video carries the highest reputation and rights risk |
| D17 | 2026-10-29 | Voice uses a cascaded streaming pipeline (STT → LLM → TTS) in a separate `apps/voice` service | Tool calls, guardrails and transcripts per turn; swappable vendors; isolates stateful call load |
| D18 | 2026-10-29 | Voice and video have their own allowances (minutes, credits) inside plans, with prepaid packs | Unit costs are far above text; keeps margins predictable |
| D19 | 2026-10-29 | AI disclosure at the start of every call and AI-content labels on generated video are mandatory and not configurable | Law in several markets and network policy; trust |
| D20 | 2026-10-29 | No number provisioning during the trial; forwarding only | Avoids regulatory and number costs on unpaid trials |

## Open questions

| # | Question | Needed by | Owner |
|---|---|---|---|
| Q1 | Does our Paystack merchant account support USD charging and international cards? If not, what is the fallback? | Before M5 | Founder |
| Q2 | Product name and domain | Before M6 | Founder |
| Q3 | Prices and allowances (`$P_*`, `N_*` in BILLING.md) | End of beta | Founder, from beta data |
| Q4 | Tax: register for VAT/GST where required, or use a merchant-of-record partner? | Before M7 | Founder + accountant |
| Q5 | Default identity: may staff write under a named human (with consent), or must they always be AI-labelled? Legal view per market | Before M3 exit | Founder + lawyer |
| Q6 | Which social networks are approved in time for beta? Launch with what's approved | M4 | Founder |
| Q7 | Platform-hosted inbound addresses (Cloudflare email worker) vs. customer forwarding only at launch | M3 | Engineering |
| Q8 | Hosting provider and region (data residency for EU customers) | M1 | Engineering |
| Q10 | Voice vendors (telephony, STT, TTS), and when to revisit speech-to-speech models | M0 bake-off | Engineering |
| Q11 | Video vendors per mode, and template rendering via an API vs self-hosted (Remotion licence) | M0 bake-off | Engineering |
| Q12 | Do-not-call registry checks: integrate a scrubbing provider, or require customer attestation only at launch? | M3b | Founder + lawyer |
| Q13 | Which trend data sources we may legally use, per network | M0 | Engineering |
| Q14 | Countries for phone numbers after US, CA and UK | After beta | Founder |
| Q15 | Allowance numbers for minutes, video credits and credit weights | End of beta | Founder, from beta data |
| Q9 | Should the KudiBooks AI-service extraction plan (`kudibooks/docs/AI-SERVICE-EXTRACTION-PLAN.md`) still happen, or does KudiBooks become a customer of AI Staff later? | After launch | Founder |
