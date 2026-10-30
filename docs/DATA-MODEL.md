# Data model

Status: draft v1, 2026-10-29. PostgreSQL 16. All IDs are UUID v7. Timestamps are `timestamptz`. Money is
`numeric(12,6)` USD for cost, `bigint` minor units for billing amounts.

## Tenancy

Every tenant table has `workspace_id uuid not null` and a composite index starting with it. Repositories come from
a tenant-scoped helper that always adds `workspace_id = $ctx` (ported from KudiBooks `TenantScopedEntity`).
Row-level security is enabled as a second line: each request/job sets `app.workspace_id` and RLS policies compare
against it. Platform-admin access uses a separate role with audited bypass.

## Platform

| Table | Key columns | Notes |
|---|---|---|
| `users` | email (citext unique), password_hash, email_verified_at, mfa_secret_enc | |
| `workspaces` | name, slug, timezone, country, state (`active`,`suspended`,`closed`) | |
| `memberships` | workspace_id, user_id, role (`owner`,`admin`,`member`) | unique (workspace_id, user_id) |
| `invitations` | workspace_id, email, role, token_hash, expires_at | |
| `company_profiles` | workspace_id (unique), version, website, summary, voice, audience, escalation_email | one per workspace |
| `company_facts` | workspace_id, profile_version, kind (`offering`,`offer`,`price`,`claim`,`banned`,`link_domain`,`faq`), text, source (`owner`,`website`) | facts are the only ground truth models may use |

## Staff and roles

| Table | Key columns | Notes |
|---|---|---|
| `staff_members` | workspace_id, role_key, role_version, display_name, signature, disclosure (`named_human`,`ai_labelled`), settings jsonb, state, paused_reason | settings validated by role schema |
| `staff_task_settings` | workspace_id, staff_id, task_type, autonomy (`off`,`draft`,`act`), schedule (cron), limits jsonb | unique (staff_id, task_type) |
| `staff_accounts` | workspace_id, staff_id, connected_account_id, purpose | which accounts a staff member may use |
| `promotion_offers` | workspace_id, staff_id, task_type, evidence jsonb, state (`offered`,`accepted`,`declined`) | |

## Connectors

| Table | Key columns | Notes |
|---|---|---|
| `connected_accounts` | workspace_id, kind, external_id, name, secret_enc, scopes, health (`ok`,`degraded`,`broken`), last_checked_at | unique (workspace_id, kind, external_id) |
| `mailbox_settings` | workspace_id, connected_account_id, from_address, domain, spf_ok, dkim_ok, dmarc_ok, daily_limit, sending_hours jsonb, inbound_secret_hash | |

## Work

| Table | Key columns | Notes |
|---|---|---|
| `task_runs` | workspace_id, staff_id, task_type, trigger (`schedule`,`event`,`person`), state (`queued`,`running`,`done`,`deferred`,`cancelled`,`dead`), attempts, run_at, lease_until, error, input_ref jsonb, profile_version | BullMQ job id = task_run id |
| `work_items` | workspace_id, staff_id, task_run_id, kind (`post_draft`,`email_draft`,`reply_draft`,`plan`,`report`), payload jsonb, state (`pending`,`approved`,`edited`,`rejected`,`expired`,`superseded`), decided_by, decided_at, edit_distance, reject_reason | approval inbox |
| `send_intents` | workspace_id, staff_id, mailbox_id, conversation_id, message_id, idempotency_key (unique), state (`pending`,`sending`,`sent`,`failed`,`uncertain`,`cancelled`), not_before, claimed_at, provider_message_id | |
| `publish_intents` | workspace_id, staff_id, post_id, connected_account_id, idempotency_key (unique), state (same as above), scheduled_for, external_post_id | |
| `inbound_events` | workspace_id, source (`email`,`meta`,`linkedin`,`x`), external_id, payload_ref, received_at, processed_at | unique (workspace_id, source, external_id) |
| `activity_events` | workspace_id, staff_id, actor (`staff`,`user:<id>`,`system`), type, summary, detail jsonb, cost_usd | append-only |
| `audit_log` | workspace_id, user_id, action, target, detail jsonb, ip | append-only |

## Social Media Staff

| Table | Key columns |
|---|---|
| `social_campaigns` | workspace_id, name, brief, starts_on, ends_on |
| `social_plans` | workspace_id, staff_id, week_start, items jsonb, work_item_id |
| `social_posts` | workspace_id, staff_id, campaign_id, body, per_account_overrides jsonb, media_ids, link_url, state (`draft`,`approved`,`scheduled`,`published`,`failed`), scheduled_for |
| `media_assets` | workspace_id, storage_key, kind, mime, bytes, width, height, alt_text |
| `social_engagements` | workspace_id, connected_account_id, kind (`comment`,`dm`), external_id, author_handle, text, received_at, classification, reply_window_ends_at, state |
| `social_metrics` | workspace_id, publish_intent_id, captured_at, impressions, reactions, comments, shares, clicks |

## Sales Manager Staff

| Table | Key columns |
|---|---|
| `leads` | workspace_id, name, company, email (citext), website, source (`csv`,`manual`,`social`), source_ref, owner_user_id, assigned_staff_id, state (`new`,`researching`,`contacting`,`replied`,`needs_human`,`won`,`lost`,`stopped`) |
| `lead_research` | workspace_id, lead_id, url, title, excerpt, kind (`observed`,`inferred`), retrieved_at |
| `conversations` | workspace_id, lead_id, staff_id, mailbox_id, subject, state (`active`,`waiting`,`needs_human`,`closed`), handled_by (`staff`,`human`), state_version, last_classification |
| `messages` | workspace_id, conversation_id, direction (`in`,`out`), kind (`first`,`follow_up`,`reply`), author (`staff`,`human`), subject, body, message_id_header, in_reply_to, occurred_at, delivery |
| `suppressions` | workspace_id, value (email or `@domain`), reason (`opt_out`,`bounce`,`complaint`,`manual`), created_at | unique (workspace_id, value) |

A platform-wide `global_suppressions` table holds hard bounces and complaints that apply to every workspace.

### Voice

| Table | Key columns |
|---|---|
| `phone_numbers` | workspace_id, staff_id, e164 (unique), country, provider, provider_sid, kind (`provisioned`,`forwarded`), regulatory_state (`pending`,`approved`,`rejected`), state (`active`,`suspended`,`released`), released_at |
| `regulatory_bundles` | workspace_id, country, provider_ref, business_name, address jsonb, documents (storage keys, encrypted), state |
| `calls` | workspace_id, staff_id, phone_number_id, lead_id, direction (`in`,`out`), from_e164, to_e164, provider_call_sid (unique), started_at, answered_at, ended_at, duration_sec, outcome (`booked`,`message`,`transferred`,`ended`,`no_answer`,`voicemail`,`failed`), handled_by (`staff`,`human`), transferred_to, recording_key, recording_expires_at, summary, cost_usd |
| `call_events` | workspace_id, call_id, at, type (`turn_user`,`turn_staff`,`tool`,`guardrail`,`transfer_start`,`transfer_answered`,`takeover`,`hangup`), detail jsonb | append-only; transcript is the ordered `turn_*` events |
| `call_consents` | workspace_id, lead_id, e164, channel (`web_form`,`inbound_call`,`email_reply`,`manual`), wording, evidence jsonb, granted_at, withdrawn_at |
| `dnc_entries` | workspace_id (null = platform), e164, source (`opt_out`,`registry`,`manual`), created_at | unique (workspace_id, e164) |
| `handoff_targets` | workspace_id, staff_id, kind (`phone`,`web_user`), value, order, hours jsonb |

### Video

| Table | Key columns |
|---|---|
| `brand_kits` | workspace_id, logo_media_id, colors jsonb, fonts jsonb, intro_media_id, outro_media_id, voice_id, caption_style jsonb |
| `video_ideas` | workspace_id, staff_id, title, angle, trend_source jsonb, fact_ids, mode, est_credits, state (`offered`,`picked`,`dismissed`) |
| `video_scripts` | workspace_id, staff_id, idea_id, version, script jsonb (VIDEO.md §3), state (`draft`,`approved`,`changes_requested`) |
| `video_renders` | workspace_id, script_id, mode, provider, provider_job_id, state (`queued`,`rendering`,`done`,`failed`), master_key, variants jsonb (aspect → key), captions_key, thumbnail_key, duration_sec, credits, cost_usd, c2pa boolean |
| `asset_manifests` | workspace_id, render_id, items jsonb (file, source, licence ref, ai_generated, prompt/model if generated) |
| `likeness_consents` | workspace_id, person_name, kind (`avatar`,`voice_clone`), scope, signed_document_key, signed_at, revoked_at |
| `video_reviews` | workspace_id, render_id, user_id, watched_to_end_at, checklist jsonb, decision, networks |

## Billing and metering

| Table | Key columns |
|---|---|
| `plans` | key, name, currency, price_minor, interval, included jsonb (work units per role), max_staff, features jsonb, paystack_plan_code |
| `subscriptions` | workspace_id, plan_key, state (`trialing`,`active`,`past_due`,`cancelled`,`expired`), trial_ends_at, current_period_start, current_period_end, paystack_customer_code, paystack_subscription_code, paystack_email_token_enc |
| `staff_seats` | workspace_id, subscription_id, role_key, quantity |
| `usage_reservations` | workspace_id, staff_id, task_run_id, kind (`model`,`research`,`connector`), reserved_usd, actual_usd, input_tokens, output_tokens, state (`reserved`,`settled`,`released`), expires_at |
| `work_unit_events` | workspace_id, staff_id, unit (`post_published`,`email_sent`,`reply_handled`, …), quantity, period_start, occurred_at, ref |
| `spend_caps` | workspace_id, monthly_cap_usd, alert_at_pct |
| `invoices` | workspace_id, paystack_reference, amount_minor, currency, state, period_start, period_end, pdf_key |
| `billing_events` | provider, external_id (unique), type, payload jsonb, processed_at |

## Indexes worth stating now

- `task_runs (state, run_at)` partial where `state = 'queued'`.
- `work_items (workspace_id, state, created_at desc)` partial where `state = 'pending'`.
- `send_intents (state, not_before)` partial where `state in ('pending','sending')`.
- `usage_reservations (workspace_id, created_at)` for period sums.
- `messages (workspace_id, message_id_header)` for threading.

## Retention

- Activity events and audit log: 2 years.
- Message bodies and engagement text: life of the workspace, and deleted 30 days after the workspace closes.
- Model prompts and outputs are not stored beyond the work item or message they produced.
- Research excerpts: 180 days.
- Call recordings: 30 days by default (configurable 0–90). Transcripts follow message retention unless the owner turns
  transcripts off.
- Video masters and variants: kept while the post exists, plus 90 days. Failed or unapproved renders are deleted after 30 days.
- Consent and DNC records: kept for 5 years after withdrawal (evidence for disputes).
