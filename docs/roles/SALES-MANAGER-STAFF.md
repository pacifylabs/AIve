# Role: Sales Manager Staff

`key: sales_manager` · Status: draft v1, 2026-10-29.

## Job description (shown at hire)

- Reads each lead's website so the first email is about them, not a template.
- Writes the first email and polite follow-ups, inside your sending hours and limits.
- Reads replies, answers questions using only your facts, and stops immediately for anyone who opts out.
- Answers its own phone number, tells callers it's an AI assistant, and puts them through to you live when they need
  a person.
- Calls back leads who asked to be called. It never cold-calls.
- Hands you anything about pricing beyond your approved offers, contracts, complaints, or anyone who wants a person.
- Keeps a simple pipeline and sends you a weekly report.

## Connectors

| Connector | Capabilities | Requirement |
|---|---|---|
| SMTP + IMAP mailbox on the customer's own domain | MailSender, MailReader | SPF, DKIM and DMARC records present; test send succeeds; a dedicated address recommended (for example `sales@`) |
| Inbound forwarding (alternative to IMAP) | MailReader | Customer forwards replies to `/v1/inbound/mail/:mailboxId/:secret` |
| Google / Microsoft OAuth | (later) | Google restricted-scope verification and security assessment |
| Phone number (platform-provisioned) | CallReceiver, CallPlacer, CallTransferrer | Country regulatory approval; see [VOICE.md](../VOICE.md) §7 |
| Forwarded existing number | CallReceiver, CallTransferrer | Customer sets call forwarding to the platform number |
| Booking link (Calendly, Cal.com or any URL) | none (a link in facts) | Must be on an allowed link domain |

We do not send from shared platform domains. Each customer's reputation stays their own, and one bad sender can't
damage the others.

## Settings (`settingsSchema`)

- `mailboxId`, `displayName`, `signature`, `disclosure`.
- `dailyNewContacts`: default 20. The ceiling comes from the plan and mailbox age (warm-up ramps from 10 to the cap over 3 weeks).
- `sendingHours`: in the recipient's timezone if known, otherwise the workspace's. Weekdays by default.
- `followUps`: 0–3 (default 2), with gaps in days (default 3, 5).
- `offers`: which company facts of kind `offer` or `price` may be quoted.
- `escalateWhen`: free text plus defaults (discounts, contracts, legal, security, upset, asks for a human).
- `cta`: book a call (with a link), reply, or visit a page.
- `voice`:
  - number ID, voice ID and greeting;
  - business hours and after-hours mode (answer, message only, or forward);
  - handoff list (phones and web users, sequential or simultaneous, ring timeout);
  - recording on or off;
  - maximum call length;
  - outbound on or off, with calling window and daily cap.

## Interview (at hire)

1. Who is your ideal customer? (industry, size, role)
2. What problem do you solve for them, in one sentence?
3. What may this staff member offer without asking you? (for example, a free trial or a demo call)
4. What must always come to you?
5. Where should interested people go? (a booking link or a page)

## Tasks

| Type | Risk | Trigger | Output | Effects | Model |
|---|---|---|---|---|---|
| `sales.research_lead` | internal | `lead.created` | Dated excerpts from the lead's own site | `lead_research` | none (fetch + summarise, from KudiBooks `safe-fetch`) |
| `sales.first_touch` | acts_external | Research done, or a daily schedule picks queued leads | subject, body | `work_item(email_draft)` or `send_intent`; follow-up scheduled after sending | small (from `draftOutreach`) |
| `sales.follow_up` | acts_external | Scheduled after a send, if no reply and the conversation version is unchanged | subject, body | same as above | small |
| `sales.triage_reply` | acts_external | `lead.replied` | classification, action (`reply`, `escalate`, `stop`, `wait`), optional body, reason | `suppress`/close; `escalate`; wait; or `work_item(reply_draft)` / `send_intent` | small (from `decideReply`) |
| `sales.social_handoff` | drafts | `lead.created` with `source = social` and no email | A suggested DM reply for the owner | `work_item` | small |
| `sales.answer_call` | acts_external (realtime) | `call.incoming` | Live conversation; tool effects (capture contact, booking link, message, transfer, opt-out) | Runs in the voice gateway; see the realtime section of ROLE-FRAMEWORK | small, streaming |
| `sales.call_summary` | internal | `call.ended` | Summary, outcome, next step, lead fields | Updates lead and conversation; callback task if a message was taken | small |
| `sales.call_lead` | acts_external (realtime) | Callback task, or the owner's call list | Live outbound conversation | Consent, DNC, hours and limit checks before dialling (VOICE.md §6). Default `draft`: a person approves each call or list | small, streaming |
| `sales.weekly_report` | internal | Schedule: Monday 08:00 | Contacted, replied, interested, meetings, escalations, spend | report | small |

### Deterministic rules (never left to the model)

- Suppressed addresses and domains (workspace and global) are never contacted.
- An opt-out classification, an `unsubscribe` reply, or a `List-Unsubscribe` hit suppresses the address immediately and closes the conversation.
- A hard bounce suppresses the address. A complaint suppresses it and counts toward auto-demotion and the workspace health score.
- One active conversation per lead. A new inbound reply supersedes unsent drafts in that conversation.
- When a person takes over, the staff member stops on that conversation until it is given back.
- No follow-up after a reply of any kind, unless a person explicitly asks for one.
- Free-mail domains (gmail.com and similar) are not researched for a company website.
- Every email carries a `List-Unsubscribe` header (mailto + one-click URL) and a plain opt-out line on the first touch.
- Links may only point to the company's allowed domains.

### Guardrails

`factsOnly`, `allowedLinks`, `bannedTerms`, `optOutPresent`, `noSignatureInBody`, `disclosure`, a subject length of
200 or less, a body length of 4,000 or less, and no attachments.

### Promotion rules

- `sales.first_touch` and `sales.follow_up`: 25 approvals in 30 days, median edit ratio ≤ 15%, bounce rate < 3%,
  zero complaints.
- `sales.triage_reply`: promotable only for the `question` and `interested` classes, after 15 approved replies.
  Objections and escalations stay as drafts.
- `sales.answer_call`: inbound answering is on from activation. A person listening is optional, and handoff rules always apply.
- `sales.call_lead`: 20 approved outbound calls with zero complaints and zero consent issues. Consent and DNC checks
  apply at every autonomy level.

### Auto-demotion and pauses

- A complaint, or a bounce rate of 5% or more over the last 100 sends: demote to `draft` and alert the owner.
- 3 complaints in 30 days: pause the staff member, and platform review is required.
- DNS checks fail on the daily re-check: pause sending.

## Work units (billing)

`email_sent` (first touch and follow-ups), `reply_handled` (any triage outcome), `voice_minute` (inbound and
outbound, rounded up per call), `phone_number_month` (beyond the one included per seat). Research and call summaries
are included.

## Ported from KudiBooks

`sales-agent-worker.service.ts` (job execution, research, `withBudget`, outreach, respond), `sales-agent-model.service.ts`
(rules, tool schemas, clamping), `sales-agent-mail.service.ts` (intents, dispatch, receive, threading),
`sales-agent-policy.service.ts` (send checks), `sales-agent.service.ts` (reserve, settle, release, suppression),
`safe-fetch.ts`, `sales-agent-crypto.ts`, `email-thread` helpers, and the Jackson inbound worker (as the
platform-hosted inbound option). KudiBooks-specific parts are dropped: CRM module coupling, plan/module checks, and
cloud drafting.
