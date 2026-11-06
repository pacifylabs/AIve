# Role framework

Status: draft v1, 2026-10-29.

A role is a package that tells the platform what a staff member of that kind does. The platform supplies
everything else: hiring, the company brain, scheduling, approvals, autonomy, budgets, connectors, the activity log
and billing. **Adding a role should not touch platform code.** If it does, the platform is missing an extension point,
and we add that extension point rather than special-casing the role.

## Role definition

```ts
export interface RoleDefinition {
  key: string;                       // 'social_media', 'sales_manager' — stable, never renamed
  version: number;                   // bump when settings schema or task contracts change
  name: string;                      // 'Social Media Staff'
  summary: string;                   // one line for the hire screen
  jobDescription: string[];          // bullet points shown before hiring

  settingsSchema: ZodSchema;         // role-specific settings stored on staff_members.settings
  interview: InterviewQuestion[];    // asked at hire; answers map to settings or company facts
  requiredConnectors: ConnectorRequirement[];  // e.g. { capability: 'Publisher', min: 1 }
  optionalConnectors: ConnectorRequirement[];

  tasks: TaskDefinition[];
  subscribes: EventSubscription[];   // e.g. { event: 'lead.created', task: 'sales.first_touch', when: ... }
  emits: EventName[];                // e.g. 'lead.created' from social

  workUnits: WorkUnitDefinition[];   // billable units, e.g. 'post_published'
  readiness(ctx): ReadinessItem[];   // extra checks before activation
  report(ctx, period): ReportSection[];
}

export interface TaskDefinition<I = unknown, O = unknown> {
  type: string;                      // 'social.draft_post'
  name: string;
  risk: 'internal' | 'drafts' | 'acts_external';  // drives allowed autonomy
  defaultAutonomy: 'off' | 'draft' | 'act';       // 'act' never allowed as default for acts_external
  triggers: Array<{ schedule: string } | { event: EventName } | { person: true }>;
  model?: { default: string; maxTokens: number; temperature: number };
  inputSchema: ZodSchema<I>;
  outputSchema: ZodSchema<O>;        // also used to build the forced tool schema
  buildContext(ctx, input): Promise<PromptContext>;   // loads facts, history, untrusted data (tagged)
  prompt(context): { system: string; user: string };
  guardrails: Guardrail<O>[];        // deterministic checks after the model
  toEffects(ctx, output): Promise<Effect[]>;          // work items, intents, events, state changes
  estimateUsd(context): number;      // worst case, for reservation
  promotion?: PromotionRule;         // e.g. { approvals: 20, maxMedianEditRatio: 0.15, windowDays: 30, noComplaints: true }
  limits?: LimitDefinition[];        // per-day caps the owner can tune within platform maxima
}
```

`Effect` is a closed union that the platform executes:
`createWorkItem | createSendIntent | createPublishIntent | emitEvent | updateEntity | escalate | suppress | alert`.
A role cannot reach the network, the mailer or billing directly. It can only return effects. This rule is what keeps
every role auditable, budgeted and pausable.

## Realtime tasks (voice)

Some tasks are live conversations, not queued jobs. A realtime task (`TaskDefinition.realtime = true`) declares:

```ts
realtime: {
  channel: 'voice';
  tools: RealtimeTool[];          // e.g. capture_contact, send_booking_link, take_message, transfer, end_call, mark_opt_out
  greeting(ctx): string;          // must include disclosure + recording notice (enforced by a guardrail)
  maxDurationSec: number;
  budgetBlockMinutes: number;     // reservation is extended block by block
  handoff: HandoffPolicy;         // when to transfer, ring timeout, fallback to message
}
```

The voice gateway runs the turn loop. Tools return the same closed `Effect` union, executed by the platform.
Guardrails run on every spoken model turn before text-to-speech: `factsOnly`, `bannedTerms`, and a length cap per turn. A
failed guardrail replaces the turn with a safe line ("Let me get someone who can answer that") and triggers a transfer.

## Long-running media tasks (video)

Tasks that call an external renderer declare `media = { pool: 'media', timeoutSec, provider: 'template' | 'presenter' | 'generative' }`.
The platform submits, waits for the webhook or polls, reserves and settles credits, and stores the output with its
asset manifest. A task can declare `promotable: false`, which the platform enforces regardless of settings (used by
`social.video_render`).

## Autonomy rules

| Task risk | Allowed autonomy | Default |
|---|---|---|
| `internal` (plans, reports, research) | off, act | act |
| `drafts` (suggestions shown in-app only) | off, act | act |
| `acts_external` (publishes, sends, replies) | off, draft, act (only after promotion) | draft |

Promotion is offered by default. The owner can instead choose **autopilot** for a task (below), which switches it on by
itself once rules the owner set are met. Demotion back to `draft` is automatic when:
- complaints exceed the role's threshold;
- the bounce rate exceeds it;
- a person rejects 3 consecutive actions taken on its own;
- the connector is reconnected (with new scopes or a new account).

### Autopilot (owner-controlled)

Autopilot is how an owner relieves the review load. It applies to `acts_external` tasks that declare a `promotion` rule
(publish and send tasks; replies have none, so they are never sent unattended). Per task the owner chooses a mode:

| Mode | Effect |
|---|---|
| `ask` (default) | The nightly check offers promotion when the rules are met; a person accepts. |
| `auto` | The task switches to `act` by itself when the rules are met (checked at once on save, then nightly). |
| `off` | Never offered. Every draft waits for approval. |

The rules start from the role's `PromotionRule` and the owner may change them inside platform limits
(`AUTOPILOT_LIMITS` in `packages/core/src/platform/autopilot.ts`): approvals 5 to 200, window 7 to 90 days, median edit
at most 30%, and `maxPerDay` 1 to 50 (default 10). Any rejection inside the window blocks it. An owner may also turn a
task on **now** without the record, with an explicit confirmation.

What autopilot never removes:

- Guardrails keep running. A draft that fails one becomes a flagged inbox item instead of an action.
- `maxPerDay`: past it, the engine runs the task at `draft` until the 24-hour count drops (runs that finished without
  needing a person are counted).
- Demotion (three rejections in a row, and the other triggers above) returns the task to `draft` **and mode `ask`**, so
  it is never switched on again without a person choosing.
- Complaints and sensitive topics escalate, and replies are never auto-sent.

Every change is audited (`autopilot.configured`, `autonomy.promoted_auto`, `autonomy.enabled_now`, `autonomy.stopped`)
and shown in the activity feed.

## Guardrails (shared library)

Roles compose these and add their own:

- `factsOnly`: numbers, prices, percentages and dates in the output must appear in the company facts or the input data.
- `allowedLinks`: every URL's host must be in the company's allowed link domains (from KudiBooks `linksAllowed`).
- `bannedTerms`: the company's banned words and claims.
- `lengthFor(platform)`: per-network limits (from KudiBooks `PLATFORM_LIMITS`).
- `optOutPresent`: first-touch emails carry a plain way to stop. If missing, it is appended (from KudiBooks).
- `noSignatureInBody`: the platform appends the signature.
- `disclosure`: when the staff member is AI-labelled, the disclosure line is present.

A guardrail either fixes the output deterministically (append, trim) or fails the run, which turns it into a work item
flagged for a person. A run never silently drops content.

## Events between roles

Events are typed in `packages/contracts/events.ts`. Launch events:

| Event | Emitted by | Payload | Consumed by |
|---|---|---|---|
| `lead.created` | social (buying intent), import, manual | leadId, source, sourceRef | sales `first_touch` |
| `lead.replied` | inbound mail | leadId, conversationId, messageId | sales `triage_reply` |
| `engagement.received` | social inbound | engagementId | social `triage_engagement` |
| `post.published` | publish dispatcher | postId, accountId | social metrics capture |
| `company.facts_changed` | company brain | changed fact ids | all roles: invalidate pending drafts that used them |
| `call.incoming` | telephony webhook | callId, numberId, from | sales `answer_call` |
| `call.ended` | voice gateway | callId, outcome, durationSec | sales `call_summary`, metering |
| `video.rendered` | media worker | renderId, postId | approval inbox |
| `consent.recorded` · `consent.withdrawn` | forms, calls, replies | leadId, channel, evidence | sales `call_lead` eligibility |

Launch capability interfaces: `Publisher`, `VideoPublisher`, `CommentReader`, `MessageReplier`, `MailSender`,
`MailReader`, `CallReceiver`, `CallPlacer`, `CallTransferrer`, `TemplateRenderer`, `PresenterRenderer`,
`GenerativeRenderer`, `TextToSpeech`, `SpeechToText`, `StockMedia`, `MusicLibrary`, `TrendSource`.

## Checklist for a new role

1. Create a package under `packages/roles/<key>` exporting a `RoleDefinition`.
2. Declare its tasks, with input and output schemas, prompts, guardrails and effects.
3. If it needs a new capability (for example `CalendarReader`), add the capability interface and a connector. That is the one
   allowed platform change.
4. Add its work units and plan allowances to `plans` (see BILLING.md).
5. Add an eval set: at least 20 fixture inputs per external-facing task, with expected properties (not exact text).
6. Register it in the role registry behind a feature flag. Enable it per workspace for beta, then globally.
