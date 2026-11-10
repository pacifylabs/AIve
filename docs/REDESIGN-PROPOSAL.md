# Layout, footer and dashboard proposal (2026-11-10)

Status: **approved and built 2026-11-10** (commits d0906f6 to 6b03fe3). The "Built" section at the end records what changed from the plan. The visual proposal is the canvas "AI as a Staff — layout
and dashboard proposal" (claude.ai/artifact/Te9h7jdBHXtyw573g5WcU2). It follows `DESIGN-CRITIQUE.md`, whose stepped
forms, saved drafts and dashboard order shipped earlier the same day.

## Owner's choices

- Page content on public pages lines up with the **nav bar's outer edge**.
- The footer gains a **product updates signup** and a **social and contact block**.
- The signed-in app goes **full width**, while forms keep a readable column.
- The desktop sidebar **collapses to icons**, and the choice is remembered.

## Phase 1: audit

### Public site

| Finding | Evidence | Severity |
|---|---|---|
| Three different left edges on every page | At a 1,776px window: nav border at 272px, logo at 290px, page text at 328px. `.nav` has `max-width: 1232px` and `width: calc(100% - 32px)`. `.wrap` has `max-width: 1200px` and `padding: 0 40px`, which leaves 1,120px of content. | High: it is the first thing seen on every page |
| The edges also drift apart at tablet widths | The nav sits 16px from the window edge and the text 40px, so the two never share a gutter | Medium |
| The footer leaves an empty block under its link columns | The brand column is 2.3 fr and the four link columns hold 3–4 links each. The early-access card makes the left side tall and the right side empty. | Medium |
| The footer has no way to stay in touch except email | No signup, no social links. `/data-deletion` exists but is not linked from the footer. | Medium |
| One fix covers every page | Every public page uses the shared `.wrap`, so the fix is in `marketing.css` only | — |

### Signed-in app

| Finding | Evidence | Severity |
|---|---|---|
| Wide screens are wasted | `main` and the top bar stop at `max-w-6xl` (1,152px). Most pages then cap themselves at `max-w-2xl` (672px): calendar, results, accounts, templates, hire, feeds, suppressions. At 1,440px, two thirds of the content area is empty. | High |
| The sidebar is grouped by data type, not by job | 19 items in 5 groups. "Company" mixes setup (Company, Settings) with work (Hire) and records (Audit log). New post sits among pages. Two items share the shield icon and two share the templates icon. | Medium |
| The sidebar is fixed at 280px | No way to give the space back on a laptop | Medium |
| Lists sit in narrow single columns | The calendar, audit log and media library cannot use extra width | Medium |
| Already fixed in the earlier pass | Stepped forms, saved drafts, alerts, setup checklist, last 7 days, links straight to the item | — |

## Phase 2: proposal

### Public site (`app/(marketing)/marketing.css`, `components/marketing/site-footer.tsx`)

1. Two shared tokens on `.page`: `--page-max: 1232px` and `--gutter: clamp(16px, 3vw, 40px)`.
   `.nav` becomes `width: calc(100% - 2 * var(--gutter)); max-width: var(--page-max)`.
   `.wrap` becomes `max-width: var(--page-max); padding-inline: var(--gutter); box-sizing: content-box`.
   Remove the 600px override that sets `.wrap` padding, because the clamp covers it.
   Result: the nav border and the page text share one line at every width.
2. The footer gets a new structure:
   - A top band with the brand, the blurb and early-access status on one side, and an email signup on the other.
   - A five-column grid: Staff, Product, Company, Legal (plus Data deletion) and Contact (email and social links).
   - A bottom bar with © 2026, "Earth imagery: NASA" and a back-to-top link.
   The signup posts to the existing `POST /early-access` with only `email` (role defaults to "both"), so there is no new backend.
3. Social links come from one constant. A link renders only once it has a real address, so nothing points nowhere.
   **Blocked on the owner: the profile addresses.**

### Signed-in app

1. **Width**
   - `app-shell.tsx` and `topbar.tsx` drop `max-w-6xl`.
   - Each page picks one of two wrappers:
     - `PageWide`: full width. Used by the dashboard, inbox, calendar, results, media, audit, pipeline and leads.
     - `PageForm`: a 720px column, plus an optional side panel shown at 1,280px and up. Used by compose, hire,
       templates, company, autopilot, mailboxes, accounts, feeds, recurring, suppressions and settings.
2. **Sidebar**
   - Regrouped by job:
     - Home: Dashboard, Inbox
     - Social: Calendar, Recurring, Results, Templates and tags, Media library, Feeds
     - Sales: Pipeline, Leads
     - Staff: Hire, Autopilot
     - Setup: Company, Social accounts, Mailboxes, Do not contact, Settings, Audit log
   - New post becomes a button at the top. The same 19 pages remain and no route changes.
   - Each item gets its own icon.
   - A collapse button switches the sidebar to a 64px icon rail. Labels show as tooltips, the choice is kept in
     `localStorage`, and if storage is unavailable the sidebar stays open.
3. **Dashboard**
   - The same data and the same 12 calls, laid out for width:
     - The header has two actions: New post, and the state-driven primary button.
     - Then alerts, then the setup checklist with steps in a row.
     - Then four "last 7 days" tiles.
     - Then a 2:1 split. Needs you and Up next on the left; staff, calendar and accounts on the right.
   - Below 900px the columns stack.
4. **Form pages**
   - New post gets a preview panel showing the text as typed and the character count against X's 280 limit.
   - Other forms use the panel for short help.
   - This is display only, with no new data.

### Design system

No new palette. Both surfaces keep the current tokens (`marketing.css` and `globals.css`), the Geist font, the dark
sidebar, and light and dark modes. New: the two layout tokens, the two page wrappers, and one sidebar width variable.

### Implementation order, after approval

1. The `marketing.css` edge tokens, checked at 375, 768, 1,280 and 1,776px on every public page.
2. The footer, with a test for the signup action and for "a social link without an address does not render".
3. The app shell width, `PageWide` and `PageForm`, and the per-page wrapper swap.
4. The sidebar regroup and collapse, with a test for the nav grouping and for reading and writing the stored choice.
5. The dashboard layout, then a browser check in light and dark at four widths. Commit and push after each step.

## Not in this proposal

- No new pages, features or endpoints.
- A dashboard summary endpoint to cut the 12 calls stays a separate follow-up.
- Calendar times in UTC stay a separate follow-up, as in `DESIGN-CRITIQUE.md`.

## Built (2026-11-10)

| Step | Commit | Notes |
|---|---|---|
| Shared page edge | d0906f6 | `--page-max` and `--gutter` on `.page`. Checked at 375, 1,280, 1,440 and 1,776px on every public page: the nav border and the text share one line, with no sideways scroll |
| Email-only sign-up stays safe | 204c985 | Found while building: a footer sign-up with only an email would have reset `role`, `website` and `first_task` for an address already on the list. `role` is now optional in the contract. With no role, the insert does nothing on conflict. New e2e test |
| Footer | ee0b5f6 | Brand and sign-up on top, five columns (Data deletion and Contact added), back to top. `SOCIAL_PROFILES` in `lib/site.ts` holds empty addresses, so no social link shows yet. Checked: bad email error, success, light and dark, phone |
| App width | a20d6e6 | Shell and top bar uncapped. Calendar, results, media, audit and inbox use grids on wide screens. Every form page uses `max-w-3xl`. Utility classes were used instead of `PageWide` and `PageForm` components: less code, same rule |
| Sidebar | 23dfa53 | Grouped by job. New post is a button. Distinct icons for the media library and the audit log. Collapse state lives in a `sidebar` cookie read by the layout (not `localStorage`), so the first paint is right. The phone drawer never collapses |
| Dashboard | c58a6ec | Last 7 days spans the full width, then a 2:1 split. Setup steps sit two to a row at `xl` |
| New post preview | 6b03fe3 | Panel at `xl` and up: the text as typed, and the grapheme count against X's 280. **Not checked in a browser**: the local test workspace has no connected social account |

Still open:

- The footer social links need real addresses from the owner. Fill `SOCIAL_PROFILES`.
- In development, the Next.js dev badge covers the collapsed sidebar's collapse button. Production has no badge.
