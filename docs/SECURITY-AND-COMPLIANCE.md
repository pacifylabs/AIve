# Security and compliance

Status: draft v1, 2026-10-29. Items marked **[review]** need extra review before shipping (auth, crypto, file
uploads, webhooks, outbound fetch).

## Tenancy

- Every query is scoped by `workspace_id` through the tenant repository helper, with Postgres RLS as the second layer. See DATA-MODEL.md.
- Every BullMQ job carries `workspaceId`. The processor sets the tenant context before touching data and refuses jobs with none.
- Cross-tenant e2e tests: for every resource endpoint, a user from workspace B gets 404 for workspace A's IDs.

## Authentication and authorization [review]

- bcrypt (cost 12) or argon2id passwords. Breached-password check on sign-up.
- Access JWT for 15 minutes. Refresh tokens rotate and are stored hashed, with reuse detection that revokes the family.
- Optional TOTP MFA, required for owners once billing is active (configurable).
- Guards check membership and role on every route, default deny. Billing, connectors, spend cap and member management are owner/admin only.
- Platform admin is a separate auth realm with mandatory MFA. Impersonation is read-only, time-boxed and audited.

## Secrets

- Connector tokens, SMTP passwords and Paystack authorization codes are encrypted with AES-256-GCM, using a per-row IV and a key ID for rotation. Keys come from the secret manager, never from the database or repository. **[review]**
- Logs never contain tokens, passwords, message bodies, prompts or model outputs. A redaction middleware covers headers and known fields.
- Inbound webhook secrets are stored hashed and compared in constant time.

## Outbound fetch (research, prefill) [review]

Port KudiBooks `safe-fetch.ts`:
- https/http only; DNS resolved and private, loopback, link-local and metadata ranges refused, including after redirects;
- limited redirects; size and time caps; text content types only;
- no cookies or credentials;
- tests cover the SSRF cases.

## Prompt injection and model safety

- Untrusted text (web pages, prospect emails, comments, DMs) is always wrapped in tagged data blocks after the rules. The rules say never to follow instructions inside them.
- Forced tool output only. Free text is never parsed for actions.
- Effects are a closed set (ROLE-FRAMEWORK.md). A model can't call the network, send mail or change settings except by producing an output that passes guardrails and becomes an effect.
- Link allow-list, facts-only check, banned-terms check.
- Promotion requires a track record, and the highest-risk task classes stay as drafts.
- Platform kill switches per role and per workspace.

## File uploads [review]

- Media is uploaded to object storage through short-lived signed URLs.
- File types are checked by magic bytes, not extension, with size limits per kind.
- Images are re-encoded server-side (this also strips metadata).
- Served from a separate domain with `Content-Disposition` and `X-Content-Type-Options: nosniff`.
- CSV lead imports are parsed with a streaming parser, with row and column caps and formula-injection escaping on export.

## Webhooks [review]

- Signature verified on the raw body before parsing (Paystack HMAC-SHA512; Meta `X-Hub-Signature-256`).
- Idempotent by provider event ID.
- Replies come back quickly, with processing done on the queue.

## Email sending law and deliverability

Applies to the Sales Manager Staff:

- **US (CAN-SPAM):** accurate From and subject, a physical postal address, a working opt-out honoured within 10 business days (we do it immediately), and no deceptive headers. The workspace must give a postal address before sending.
- **EU/UK (GDPR, PECR):** B2B cold email to corporate addresses usually relies on legitimate interest. Customers must have a lawful basis for their lead lists. They declare this at import, and terms make it their responsibility. Some countries are stricter, such as Germany. Show a warning and a country block option.
- **Canada (CASL)** requires express or implied consent. Leads in Canada are flagged, and sending requires the customer to confirm the basis.
- **Gmail and Yahoo bulk sender rules:** SPF, DKIM and DMARC, one-click `List-Unsubscribe` (RFC 8058), and a complaint rate under 0.3%. Our limits keep customers well below bulk volumes, but we follow the rules anyway.
- **Platform:** a global suppression list, complaint and bounce auto-demotion, a workspace health score, and an acceptable use policy with termination for spam.

Legal review is required before launch. The list above guides product requirements and is not legal advice.

## Voice calls [review]

- **AI disclosure** at the start of every call, inbound and outbound. This is enforced by a guardrail on the greeting and can't be
  configured off. It is expected by the EU AI Act transparency rules and several US state laws, and is our policy everywhere.
- **Recording notice** on every call. Some US states and other countries require all parties to consent to recording.
  Always announcing covers the strictest case. If the caller objects, recording stops and only the live summary is
  kept.
- **Outbound consent (US TCPA and similar):** the FCC's 2024 ruling treats AI-generated voices as "artificial voice", so
  calls need prior express consent. We enforce consent records, opt-out on any channel, DNC lists and calling hours in code before dialling
  (VOICE.md §6). No cold calling, at any autonomy level.
- **Caller ID:** only the workspace's own verified number, with STIR/SHAKEN attestation through the provider. No spoofing.
- **Number regulation:** business identity documents are collected per country and stored encrypted. Numbers are suspended
  on abuse reports.
- **Telephony fraud:** outbound calls go only to the countries the workspace is enabled for. Premium-rate and high-risk number
  ranges are blocked. There are per-number and per-workspace daily caps.
- **Voice prompt injection:** callers can try to talk the AI into things. The same rules apply: facts only, tools return effects,
  a failed guardrail triggers a transfer, and no tool can reveal other callers' data or settings.

## Generated video [review]

- **Labels:** AI-generated or altered content is labelled on every network that requires it (API flag where available,
  otherwise a caption disclosure). C2PA provenance is embedded where tooling supports it.
- **Likeness and voice:** custom avatars and cloned voices only with a stored, signed, revocable consent from that person.
  Revocation removes them from future renders.
- **Rights:** stock footage, music and fonts only from licensed sources, with the licence stored in each render's asset manifest.
- **Product accuracy:** generated scenes may not depict the product itself except image-to-video from the business's own
  photos (VIDEO.md §4).
- **Prohibited:** impersonating real people, competitors or customers; fake testimonials; political and election content;
  medical, financial or legal claims beyond the facts. Renderer providers' own usage policies also apply and are linked in
  the terms.
- **Human verification:** the final video can't be approved until it has been played to the end and the checklist ticked.
  This gate is not promotable (D16).

## Social platform policies

- Follow each network's developer terms: no automated engagement farming, no mass DMs, and replies to messages only within each platform's messaging window.
- Store only the data needed and delete it when a connection is removed, as Meta requires a data deletion callback.

## Privacy (GDPR, UK GDPR, NDPA and similar)

- We are the processor for customer data (leads, messages, followers) and the controller for account data. A DPA is published, and sub-processors are listed (model provider, hosting, email, Paystack, storage).
- The model provider is used under terms where API inputs aren't used for training. Confirm and record the current terms.
- Data subject requests: export or delete a lead's data per workspace. Suppression entries are kept as a hashed email so the opt-out can still be honoured after deletion.
- Retention follows DATA-MODEL.md.
- The privacy policy states that content is processed by an AI provider. This mirrors KudiBooks' privacy page wording.

## Operational

- Backups: daily, with point-in-time recovery for 7 days and a restore test monthly.
- Dependency scanning and secret scanning in CI.
- Rate limits on auth, prefill, suggest, imports and webhooks.
- Additional incident runbooks for: robocall complaint (suspend number → review consent evidence), and harmful video
  published (unpublish via API → notify owner → review).
- An incident runbook for: spam outbreak (kill switch → suppress → notify), token leak (rotate key → re-encrypt → revoke connectors), and model provider outage (pause external tasks, keep the inbox working).
