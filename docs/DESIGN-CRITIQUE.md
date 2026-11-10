# Design critique: the signed-in app (2026-11-09)

Status: review done from the code in `apps/web` (dashboard, New post, both Hire forms, Company). The app was not
running locally (Docker off), so this pass has no screenshots. Changes agreed from it are tracked at the end.

## Overall

The parts are well made: honest copy, approval-first framing, good empty-state wording, labelled progress bars, light
and dark tokens. What's missing is a way through the product. A new workspace lands on six cards of equal weight, and
the forms that matter most (New post, Hire) are one long column. Those forms dead-end when something they need, such as
an account or a mailbox, is missing, and whatever the person typed is lost when they go to set it up.

## Dashboard

| Finding | Severity | Recommendation |
|---|---|---|
| No guided start. A new workspace sees empty staff, accounts and calendar cards, each with its own link, in no order | High | A setup checklist at the top (company profile, connect an account or mailbox, hire, approve the first draft) that hides itself when done |
| A broken account stops posting, but its warning sits at the bottom of the right column | High | An alert strip under the header for broken or expiring accounts and failed posts, each with its fix |
| Every "Needs you" row and its "Review" button go to the inbox list, not the item | Medium | Link to the item. The fake button inside a link becomes plain text or a real link |
| "Open inbox" is the primary button even when nothing is waiting | Medium | The primary action follows the state: Review N drafts, or Finish setup, or New post |
| No numbers, though Results now exists | Medium | A "this week" row: posts out, engagement, reach, drafts approved, each linking to Results |
| Six cards of equal weight, so nothing leads | Medium | Order by urgency: alerts, then needs you, then staff and results, then calendar and activity |
| Mini-calendar days all open the full calendar at today | Low | Open the calendar at that day |
| "Up next" shows UTC while New post uses the workspace time zone | Low | One time zone everywhere: the workspace's |

## Forms

| Form | Today | Problem |
|---|---|---|
| New post | 12 controls in one column: accounts, text, replies, media addresses, picker, link, first comment, tag, repeat, send at | Hard to scan. "Repeat" points to "Send at below", so the order is inverted. Media is a box of raw URLs. Errors show at the top after posting |
| Hire Social Media | 7 questions, one asks you to paste 2–3 posts | Long interview on one screen. With no account connected it shows an empty "Post to" list plus a note |
| Hire Sales Manager | 8 fields | The same, and with no mailbox the select is empty |
| Company profile | 5 fields | Fine as it is |

**The dead end.** Each form needs something set up somewhere else: New post and Hire Social need an account, Hire Sales
needs a mailbox, and media needs the library. The link to set it up leaves the page and loses the form. Connecting an
account goes out to the network and comes back to `/app/accounts`, with no way back to the form.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Buttons | `!px-3 !py-1` overrides scattered across cards | One `btn-sm` size |
| Empty states | `.empty`, `card-flat` notes and plain muted text are all used | Use `.empty` everywhere, with one action |
| Field errors | The Hire Sales mailbox select hand-rolls its label and error | A shared select field, the same as the text fields |
| Card headings | Visible `h2` plus a duplicate `sr-only` div used for `aria-labelledby` | Label each section by its visible heading |

## Accessibility

- Mini-calendar days are 36px, under the 44px touch-target guideline on phones.
- Errors only appear after a server round-trip, at the top of the form. A stepped form must move focus to the first
  error and open the step that holds it.
- Colour-only status dots in Activity and the calendar should have a text equivalent (title or sr-only text).

## What works well

- The copy is plain, specific and honest ("Every post waits in your inbox for approval…").
- Approval-first is visible everywhere: the autopilot progress bar and the "Check first" reasons.
- Form fields are wired correctly (labels, `aria-describedby`, `aria-invalid`), and both themes come from tokens.

## Agreed changes (built 2026-11-10)

Choices made by the owner: steps with jump tabs; drafts kept in this tab only (sessionStorage); every form long enough
to scroll gets steps; the dashboard gets a setup checklist, an alerts strip, last-7-days numbers and a primary action
that follows the state.

| Change | Where | Notes |
|---|---|---|
| Stepped forms with a Review step | `components/step-form.tsx` | New post (Where, Write, Media, When), Hire Social (Name and accounts, Goal and topics, Style, How often), Hire Sales (Name and mailbox, Customer, Limits), post templates (Name and text, Extras, Where), Connect mailbox (Address, Sending, Replies). Every step stays in the page and only the current one shows, so the server actions did not change. Next checks the step (browser rules plus a `check` for things like "pick an account"). Enter means Next until the last step. A refused send opens the step holding the first error and focuses it |
| Saved form input | `lib/form-draft.ts`, `components/form-draft.tsx` | Kept in sessionStorage, per workspace and form, for at most a day. Never a password, file or hidden field. Restored on return with a "Start over" option. Removed once sent, and on sign-out |
| The way back | `SetupLink`, `ResumeBanner` | A link out of a form to set up an account, mailbox or media saves the form. Every page after, including a network sign-in round trip, shows "Back to …" until the person returns or discards it |
| Dashboard | `app/app/page.tsx`, `lib/dashboard.ts` | Order: alerts (broken or expiring accounts, failed posts), setup checklist (company, channel, staff, first approval; hides when done), Needs you (rows open their item), last 7 days (posts out, engagement, reach, new followers), staff, activity; then Up next (workspace time zone), the calendar (days open that day) and accounts |
| Consistency | `form.tsx`, `globals.css` | `SelectField`, `btn-sm`, sections labelled by their visible headings, 40px calendar targets, a text equivalent for the red activity dot |

Not done in this pass, on purpose:

- The setup checklist uses "approvals toward autopilot" as its sign of a first approval. There is no approvals count
  endpoint.
- The Calendar page itself still shows UTC times. Only the dashboard moved to the workspace time zone.
- Company profile (five fields) and Autopilot rules (four numbers) fit on a screen, so they were left as single forms.
- The dashboard now makes 12 API calls per load. A single summary endpoint would cut that if it shows up as slow.
- The New post steps were checked by typecheck and build, not in a browser: the local test workspace has no
  connected account. Hire, Templates and Mailboxes were checked in a browser, including the round trip and a refused
  send.
