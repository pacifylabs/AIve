# Billing

Status: draft v1, 2026-10-29. Prices are placeholders (`$P_…`) until pricing is decided. The structure below does not
depend on the numbers.

## Model: a salary per staff member

Customers pay a monthly fee for each staff member they hire. Each fee includes an allowance of work. A spending cap
set by the owner makes sure the bill can never surprise them.

| Plan | Per staff member per month | Social allowance | Sales allowance | Autonomy |
|---|---|---|---|---|
| **Assistant** | `$P_ASSISTANT` | `N_POSTS_A` posts published, all replies drafted | `N_EMAILS_A` emails sent, `N_REPLIES_A` replies handled | Drafts only |
| **Manager** | `$P_MANAGER` | `N_POSTS_M` posts | `N_EMAILS_M` emails, `N_REPLIES_M` replies | Can be promoted to act on its own |
| **Team bundle** | `$P_BUNDLE` (both roles, Manager level) | Manager allowances | Manager allowances | Promotable |

Voice and video are included in every plan with their own allowances, because they cost far more per unit than text:

| Plan | Social: video credits / month | Sales: voice minutes / month | Phone numbers |
|---|---|---|---|
| Assistant | `N_VIDEO_A` (template mode only) | `N_MIN_A` (inbound only) | 1 per Sales seat |
| Manager | `N_VIDEO_M` (all modes) | `N_MIN_M` (inbound + consented outbound) | 1 per Sales seat |
| Team bundle | Manager | Manager | 1 |

- **Video credits:** template = 1, presenter = 3, generative = 10 (weights set from measured vendor cost).
- **Extra numbers:** `$P_NUMBER` per month each, plus any country-specific regulatory fee passed through at cost.
- **Packs:** video credit packs and voice minute packs are sold as prepaid top-ups, like the text-based units.

Annual billing gets 2 months free. The trial is 7 days, with Assistant-level allowances scaled to 7 days. The trial
includes `N_VIDEO_TRIAL` template credits, and voice in **forwarding mode only** with `N_MIN_TRIAL` minutes. No number is
provisioned during the trial, which avoids paying regulatory and number costs for unpaid trials.

### Pricing guidance (to set the numbers)

- Price against the alternative, a part-time freelancer, not against our cost.
- Target model and infrastructure cost at 20% of price or less at full allowance. Measure it in the beta before publishing prices.
- Keep allowances high enough that 80% of customers never hit them. Overage exists for the other 20%.

## Metering

Two meters, both written by the task engine:

1. **Work units** (`work_unit_events`): counted against the plan allowance per staff member per billing period.
   - Social: `post_published` (per account), `reply_sent`.
   - Sales: `email_sent`, `reply_handled`, `voice_minute` (rounded up per call), `phone_number_month`.
   - Social video: `video_credit` (charged on successful render, not on approval, because the cost is incurred
     at render time; failed renders are not charged).
2. **Spend** (`usage_reservations`): actual USD cost of model calls, research and connector fees.
   - Used for the owner's monthly spend cap and our margin reporting.
   - It is not billed directly to the customer.

### Allowance reached

- With the default setting, the staff member pauses that unit type and the owner chooses one of:
  - **Top up**: buy a pack of extra units (prepaid, charged immediately).
  - **Upgrade**: move to the next plan, prorated (see below).
  - **Wait**: carry on next period.
- Optionally the owner enables **auto top-up** up to their spend cap. Packs are then charged as needed, to a maximum of K per month.

We use prepaid top-ups rather than post-paid overage because a declined card at period end becomes uncollectable
debt, and Paystack has no native metered billing.

### Spend cap

- Owner-set monthly cap in USD (default: plan price × 1.5). Alerts go out at 80% and 100%.
- At 100% every staff member pauses until the next period or until the owner raises the cap.
- The platform also enforces a hidden safety cap per workspace (abuse protection). Hitting it alerts platform admins.

### Allowance reached during a live call

A call in progress is never cut off because the minute allowance runs out. The voice gateway reserves budget in
5-minute blocks. When the allowance is exhausted mid-call, the call may continue up to the spend cap. The overage is
recorded as a negative minute balance, deducted from the next period or a top-up. New calls after that get the
after-hours behaviour (message or forward) until the owner tops up. The spend cap is the only hard stop, and even then the
AI ends the call politely with a message option.

## Paystack integration

### Approach: our own billing schedule plus Paystack charges

Paystack Subscriptions are built around one plan per subscription. They don't handle quantities (seats), mixing
roles, prorations or top-ups well. Instead:

1. **First payment:** `POST /transaction/initialize` with the amount for the selected seats, `channels: ['card']`, and
   metadata `{ workspaceId, planKey, seats, period }`. The customer pays on Paystack's page.
2. **On `charge.success`** (webhook, signature-verified): store the reusable `authorization_code` (encrypted),
   `customer_code` and card details (last 4 digits, expiry, brand). Activate the subscription and seats.
3. **Renewal:** a daily billing job finds subscriptions due and calls `POST /transaction/charge_authorization` with the stored
   authorization and an idempotent reference `ws:<id>:period:<yyyy-mm>`.
4. **Upgrades and top-ups:** an immediate `charge_authorization` for the prorated or pack amount.
5. **Failures:** a payment failure moves the subscription to `past_due`. Retries run on days 1, 3 and 5. Staff pause on day 7. The
   owner can update the card through a new `initialize` (if a zero-amount authorization isn't supported, a small
   refundable verification charge or the next real charge is used; confirm with Paystack).
6. **Invoices and receipts:** our own PDF invoice per charge (stored), and Paystack's receipt email stays on.

Keep the Paystack plan/subscription objects out of the design unless Paystack confirms quantity support. This is
recorded as a decision in DECISIONS.md.

### Currency

- Prices are in **USD**. This requires USD to be enabled on the Paystack merchant account. Paystack offers USD to
  eligible merchants, and international cards must be enabled. **Confirm both before building checkout.** If USD isn't
  available, show USD prices and charge the converted local currency at a disclosed rate. That is worse for customers and is the fallback only.
- Store all billing amounts in minor units with an explicit currency.

### Webhooks handled

`charge.success`, `charge.failed` (if sent), `refund.processed`, `refund.failed`, `charge.dispute.create`,
`charge.dispute.resolve`. Every event is:
1. Verified with HMAC-SHA512 of the raw body using the secret key (`x-paystack-signature`).
2. Stored in `billing_events` keyed by `(provider, id/reference)`, unique, so a replayed event does nothing.
3. Processed in a transaction. The transaction is verified with `GET /transaction/verify/:reference` before anything is granted.

Optional hardening: accept webhooks only from Paystack's published source IPs.

## Plan changes

| Change | When | Money |
|---|---|---|
| Upgrade (Assistant → Manager, add a seat) | Immediately | Prorated charge for the rest of the period |
| Downgrade or remove a seat | At period end | None. Staff over the new limit are paused at period end, with the owner choosing which |
| Cancel | At period end | None. Data is kept 30 days after expiry, then deleted |
| Refunds | Manual by admin | Through the Paystack refund API, then logged in `audit_log` |

## Tax

Global sales may create VAT/GST obligations in customer countries. Collect the billing country and tax ID at
checkout from day one, and show prices exclusive of tax. Decide registration (or a merchant-of-record partner) with an
accountant before launch. Listed as an open question.

## Entitlement checks (enforced in code)

- Hire flow: seat available for the role on the current plan.
- Task engine: subscription is `trialing` or `active`, allowance left (or auto top-up on), and spend cap not reached.
- Promotion offers: Manager plan only.
- All checks happen inside the budget reservation transaction, so concurrent runs can't overshoot.
