# Product requirements: AI Staff

Status: draft v1, 2026-10-29. Owner: founder. Working name only.

## 1. Summary

Businesses hire AI staff members by role. Each staff member is briefed once, connected to the accounts it needs,
starts on probation (everything it produces waits for a person), and earns the right to act on its own as the
owner approves its work. Businesses pay a monthly fee per staff member with a hard spending cap.

Launch roles:

- **Social Media Staff**: plans, writes, schedules and publishes posts. It turns trends and products into video scripts
  and finished short videos, which are always approved by a person before posting. It drafts replies to comments
  and DMs, and reports.
- **Sales Manager Staff**: researches leads, writes first emails and follow-ups, and handles replies. It answers its own
  phone number with a voice AI, calls back leads who agreed to be called, hands hot or risky conversations to a person
  (live, on calls), and reports.

## 2. Problem

Small and mid-size businesses need consistent social presence and consistent outbound sales, but cannot afford, or
do not want, to hire for both. Today they choose between:

- **Doing it themselves**, inconsistently, in whatever time is left.
- **Freelancers and agencies**: expensive, slow to brief, and hard to measure.
- **Point AI tools** (caption generators, email writers): these produce text but don't do the job. Someone still has to plan, schedule, send, follow up, read replies and remember context.

The gap is a worker, not a writing tool: something that owns a job end to end, inside rules the owner controls.

## 3. Target customer (launch)

Global, English-language, small and mid-size businesses that sell to other businesses or to consumers online.

- **Owner-led companies with 1 to 50 staff:** agencies, consultancies, SaaS, professional services, e-commerce brands, training providers.
- **They have** a website, at least one active social account, and a business email domain.
- **The buyer is** the owner or head of marketing/sales. The daily user is the same person, or one team member.

Not for launch: enterprises (SSO, procurement, custom contracts), regulated industries that need message
pre-approval by compliance (finance, health, legal), and businesses without their own email domain.

## 4. Jobs to be done

- "Keep our social accounts active with posts that sound like us, without me writing every one."
- "Turn interest on social into conversations I can close."
- "Contact the leads I already have, follow up properly, and tell me who is worth my time."
- "Don't embarrass us: no made-up claims, no spam, nothing sent that I wouldn't send."

## 5. Goals and success metrics

| Goal | Metric | Launch target |
|---|---|---|
| Fast time to value | Sign-up → first approved piece of work | Median under 10 minutes |
| Staff produce usable work | Drafts approved with light or no edits | ≥ 70% after week 1 |
| Trust grows | Staff promoted to act on their own within 30 days | ≥ 40% of active staff |
| Customers pay | Trial → paid conversion | ≥ 15% |
| Customers stay | Monthly logo churn | ≤ 6% |
| Unit economics | Model + infrastructure cost / revenue per staff member | ≤ 20% |
| Safety | Spam complaints per 1,000 sales emails | < 1 |
| Voice feels natural | Response latency, from when the caller stops talking to when audio starts | p50 ≤ 1.1 s, p95 ≤ 1.6 s |
| Voice hands off well | Calls that needed a person and were transferred or got a message | ≥ 95% |
| Videos are usable | Rendered videos approved without re-render | ≥ 60% |

## 6. Scope

### 6.1 Platform (shared by all roles)

- **P1 Sign-up and workspaces:** email + password with verification, MFA optional. A user can own or belong to several workspaces.
- **P2 Team:** invite teammates with owner, admin and member roles.
- **P3 Company brain:** one profile shared by every staff member. It holds what the business sells, offers and prices, tone of voice, audience, banned claims and words, links that may be used, and an escalation contact. It is prefilled from the website.
- **P4 Hire a staff member:** choose a role, complete its short interview, connect the required accounts, and set the schedule and a spending cap.
- **P5 Approval inbox:** one queue of everything awaiting a person, across all staff. Approve, edit and approve, reject with a reason, or take over.
- **P6 Autonomy levels:** each task type has a level: `draft` (always approve), `act` (runs on its own), or `off`. Promotion is offered when a task type meets its role's promotion rule. Demotion is automatic on complaints or bounces above a threshold.
- **P7 Activity log:** what every staff member did and why, readable by people. No hidden actions.
- **P8 Work reports:** a weekly email and dashboard per staff member covering work done, results and spend.
- **P9 Billing:** plans, trial, upgrade and downgrade, Paystack checkout and subscriptions, invoices, a usage meter, and a hard cap. See [BILLING.md](BILLING.md).
- **P10 Notifications:** email, plus in-app alerts when a person is needed.
- **P11 Platform admin:** an operator console with tenants, usage, kill switches per tenant and per role, and support impersonation (read-only and audited).

### 6.2 Social Media Staff (launch)

Full spec: [roles/SOCIAL-MEDIA-STAFF.md](roles/SOCIAL-MEDIA-STAFF.md).

- Connect Facebook Pages, Instagram Business, LinkedIn Pages and X accounts, plus TikTok and YouTube (Shorts) for video.
- A weekly content plan built from the company brain and any campaigns the owner adds.
- Platform-aware post drafts, respecting character limits, media rules and hashtag limits.
- A media library for owner uploads, plus a brand kit (logo, colours, fonts, voice).
- **Video**: trend- and product-based video ideas, scripts, and rendered short videos in three modes (template,
  AI presenter, generative scenes). There are two approval gates, script and final video; the final video gate can never be skipped.
  Published with AI-content labels. Full spec: [VIDEO.md](VIDEO.md).
- Schedule and publish approved posts and videos, with retries and failure alerts.
- Draft replies to comments and DMs, within each platform's reply window.
- A lead handoff: a comment or DM showing buying intent becomes a lead for the Sales Manager Staff (if hired).
- A weekly performance summary.

### 6.3 Sales Manager Staff (launch)

Full spec: [roles/SALES-MANAGER-STAFF.md](roles/SALES-MANAGER-STAFF.md).

- Connect a sending mailbox through SMTP/IMAP, plus inbound forwarding or IMAP polling for replies. Google and Microsoft OAuth come later.
- Mandatory domain checks before sending: SPF, DKIM and DMARC present, plus a test send.
- Import leads from CSV or manual entry, or receive them from Social Media Staff.
- Research each lead's public website, kept as dated, quoted evidence.
- A first email and up to N follow-ups, inside sending hours and daily limits.
- Reply triage: interested, question, objection, out of office, opt-out, bounce, or escalate. It answers within the facts and hands off everything else.
- Deterministic opt-out suppression. Unsubscribe links and headers on every email.
- A small pipeline: each lead's state, conversation and next step.
- **Voice line**: its own phone number (US, CA, UK first) or forwarding of the customer's existing number. It includes:
  - AI answering in the business's name, with AI disclosure and a recording notice;
  - booking links, messages, and live transfer to a person's phone or a take-over from the browser;
  - transcripts and summaries saved on the lead;
  - outbound calls only to leads with recorded consent, inside calling hours, and after do-not-call checks.

  Full spec: [VOICE.md](VOICE.md).
- A weekly report covering email and calls.

### 6.4 Not in launch

- Business manager or finance roles. These were dropped.
- WhatsApp and SMS channels.
- Outbound calls to people who have not consented.
- Number porting. Customers forward their existing number instead.
- Lead discovery or scraping of lists, and buying data. Customers bring their own leads.
- Google and Microsoft mailbox OAuth (it needs a security assessment).
- Public API for customers, white-labelling for agencies, enterprise SSO.
- Languages other than English for generated content.

## 7. Key user flows

1. **Sign up → first draft:** see [ONBOARDING.md](ONBOARDING.md).
2. **Daily use:** open the approval inbox, approve or edit 5 to 15 items, and glance at the activity log.
3. **Promotion:** "Your Social Media Staff has had 20 posts approved with light edits. Let it publish on its own?" The owner chooses Yes, Not yet, or Only for this account.
4. **Handoff:** a DM saying "how much for 10 seats?" becomes a lead, and the Sales Manager Staff drafts a reply email or tells the owner to answer in the DM.
5. **Escalation:** a reply asking about a discount puts the conversation in "needs a person", alerts the owner, and the staff member stops on that thread.
6. **Cap reached:** the staff member pauses and the owner is asked whether to raise the cap or wait for the next period.
7. **Call handoff:** a caller asks for volume pricing. The AI says "connecting you now", rings the owner, and whispers a
   one-line summary. The owner picks up and the AI drops off. If nobody answers in 25 s, it takes a message and creates a callback
   task.
8. **Video:** on Monday the owner picks one of 4 video ideas, approves the script, and watches the rendered 30-second
   video. They approve it for Instagram and TikTok but not LinkedIn, and it publishes on schedule with AI labels.

## 8. Requirements that apply everywhere

- **Honesty:** staff never invent prices, features, customers, results or promises. Anything not in the company brain is left out or escalated.
- **Identity:** each business chooses how a staff member presents itself. It may write under a named human with that person's consent, or under an AI-labelled name. The platform never claims a human wrote something when the business configured disclosure.
- **Human control:** every action can be paused per staff member, per task type and for the whole workspace. A pause takes effect before the next action.
- **Explainability:** every action records its inputs (summarised), the decision, the cost and the reason.
- **Cost control:** no model call happens without a budget reservation, and spend can never exceed the cap.
- **Performance:** API p95 under 300 ms for reads. A draft is produced within 60 s of being queued.
- **Availability:** 99.5% monthly for the web app and API. Scheduled posts are published within 5 minutes of their time.
- **Accessibility:** the web app meets WCAG 2.1 AA.

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Social API approvals (Meta app review, LinkedIn Community Management API, paid X API) are slow or refused | Social role can't publish | Apply in milestone 0; launch with platforms approved first; "copy and post" fallback |
| Customers use Sales staff to spam | Shared deliverability damage, legal exposure | Customer's own mailbox and domain, mandatory checks, limits, suppression, auto-demotion, termination policy |
| Model output states something false | Reputation, legal | Facts-only prompting, forced tool output, link allow-list, probation by default |
| Model costs exceed price | Margin | Per-call reservations, small models by default, caps per plan |
| Paystack USD and international coverage | Can't charge some customers | Confirm USD settlement on the merchant account before launch (see DECISIONS) |
| Voice latency or quality feels robotic | Callers hang up; brand damage | Latency budget and harness (VOICE.md §3, §9); transfer early when unsure |
| AI calling law (TCPA, consent, recording) | Fines, carrier blocking | Consent-gated outbound, disclosure, recording notice, DNC checks, legal review |
| Phone number regulatory approval delays | Voice not available at sign-up | Forwarding option works immediately; numbers activate when approved |
| Generated video misrepresents a product or infringes rights | Reputation, takedowns, legal | Real product shots for product scenes, licensed assets only, asset manifest, mandatory watch-before-approve |
| Video and voice costs per unit are much higher than text | Margin | Credits and minutes as separate allowances; reservations per render and per call |

## 10. Open questions

Tracked in [DECISIONS.md](DECISIONS.md#open-questions).
