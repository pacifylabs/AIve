# Ideas backlog

Status: living list, started 2026-11-04. Ideas that are not yet in IMPLEMENTATION-PLAN.md. Nothing here is a commitment.
When an item is scheduled, move it into a milestone and mark it here as `planned (Mn)`.

Source tags: `postiz` = reviewed gitroomhq/postiz-app (AGPL-3.0, commit bd8353f, 2026-11-03); `postiz-cheap` = reviewed
SamurAIGPT/postiz-cheap (MIT, commit 2c42b7a, 2026-10-26).

**Licence rule.** Postiz is AGPL-3.0: take ideas and public API facts, never its code. Using its code would put our
network-served platform under AGPL. postiz-cheap is MIT but has nothing worth copying (see the end).

## Social Media Staff

| # | Idea | Source | Why it helps | Notes |
|---|------|--------|--------------|-------|
| S1 | More networks that need no app review: Bluesky, Mastodon, Telegram, Discord, Nostr, Lemmy | postiz | Real publishing and demos while Meta, LinkedIn and X approvals are pending | Token or app-password auth. Each is a new `SocialProvider`. **Suggested first.** **Built 2026-11-06:** Bluesky, Mastodon, Telegram and Discord. **Bluesky and Mastodon were removed the same day** at the owner's request (in git history, commit before `0012` if they are wanted back); Telegram and Discord stay (text and links; pictures on both). Not built: Nostr, Lemmy. |
| S2 | Pending publish contract: provider returns "accepted, still processing", worker polls until done | postiz, postiz-cheap | Replaces our inline ~1 min Reel polling. Fits the no-auto-resend rule: timeouts stay `uncertain` | Add `pending` and `check` to `SocialProvider`. postiz-cheap also does it (publish returns a request id, then polls a result endpoint). **Built 2026-11-06:** the contract (`pending` result with a ticket, `checkPublish`), the publisher and worker side, and Instagram Reels on it. |
| S3 | Posts from an RSS feed or URL | postiz, postiz-cheap | A second source of ideas beside `plan_week`, grounded in company facts | Approval-first like every other post. Per-feed options: draft only vs schedule, add picture, generate text. **Built 2026-11-06 (RSS, Atom, RDF feeds):** Feeds page, polling every 30 minutes with back-off and a stop after five failures, one draft per article per account, the article link attached by the platform, and the article text treated as untrusted data. Not built: a plain web page as a source, a picture from the article, and per-feed drafting options. |
| S18 | Threads and TikTok | owner request | Two more places to post | **Built 2026-11-06, not yet run against real accounts.** Threads: text with a link card, or one picture or video; needs its own app id and secret (`THREADS_APP_ID`, `THREADS_APP_SECRET`); until Meta approves `threads_content_publish` it posts only for the app's listed Threads testers. TikTok: video only, pulled from a web address that must be on a domain verified in the TikTok app; until TikTok audits the app it can only post to a private account (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`). TikTok's audit also asks that the person sees and chooses privacy and disclosure options before posting, which our approval screen does not show yet. WhatsApp was considered and skipped: its API cannot publish a public post. |
| S4 | LinkedIn client | postiz | Biggest gap for B2B users | Verify against LinkedIn's current docs: versioned `/rest/` endpoints, `X-Restli-Protocol-Version` header, `initializeUpload` then `finalizeUpload` for media. |
| S5 | X media upload | postiz | Our X client refuses pictures | Chunked upload; limit of 4 images or 1 video per post. Verify against current X docs. |
| S6 | Reply chains (threads) | postiz, postiz-cheap | Many X and Threads posts are chains | A post can hold ordered child posts, published in order. Failure mid-chain needs an explicit rule (stop, mark `uncertain`). |
| S7 | Signatures | postiz, postiz-cheap | Saved sign-offs added to a post per account | Treat as a company fact kind so guardrails see the final text. **Built 2026-11-06:** one sign-off per account, kept in the Social staff's settings (`signatures`, by account id), edited on the Accounts page. Added after the hashtags by a guardrail, so length, banned-word and link checks see the final text; the model is told the room it takes; figures in it pass the facts check. A link in it must be on a company domain. |
| S8 | Post sets (templates) and colour tags | postiz, postiz-cheap | Faster planning, calendar filtering | Low risk, UI-heavy. **Not built, deliberately:** templates only help where a person writes posts by hand, and we have no manual composer yet (the staff member writes drafts). Build the composer first, then templates and colour tags on top. |
| S9 | Missed-post recovery sweep | postiz | Finds posts that should have gone out but did not | Complements `reconcile()`, which only handles posts we know are uncertain. |
| S10 | Account-level analytics (daily series with percentage change) | postiz, postiz-cheap | We capture per-post metrics only | KudiBooks already had a daily follower capture to port. |
| S11 | Top-posts leaderboard with "repurpose with AI" | postiz-cheap | Closes the loop from results back to planning | Needs reliable metrics (S10) first. Repurposing must still go through approval. |
| S12 | Plugs: automations on our own posts (e.g. repost at N likes, follow-up post) | postiz | Optional scheduled tasks for the staff member | Cap total runs. Default off. Needs reliable metrics first. |
| S13 | Recurring posts and per-channel time slots | postiz-cheap (roadmap only) | Evergreen content, "next free slot" | Planned there, not built. Our `plan_week` already picks times, so this is lower priority. |
| S14 | Drag-and-drop rescheduling on the calendar | postiz-cheap | Faster edits | Must go through the same approval and stale-version check as other edits. |
| S15 | Media library with aspect-ratio presets (1:1, 9:16, 16:9) and crop | postiz-cheap | Unblocks auto-planned Instagram posts, which are escalated today | Already a known gap. Presets are the useful part. |
| S16 | First comment per post | postiz-cheap (roadmap), already in our publisher | Already built (`firstComment`); only the composer field is missing | Listed so it is not rebuilt. |
| S17 | Safe @mentions: look up the real account, save it for reuse | postiz (cached mentions) | Lets drafts tag people without inventing handles | Works with the existing `noUnknownMentions` guardrail. Not every network allows account search. |

Caution on a "Unicode bold/italic" text formatter (postiz-cheap roadmap 2.4): the styled characters are mathematical
symbols, which screen readers read badly and search can miss. Not recommended without a clear opt-in.

## Platform

| # | Idea | Source | Why it helps | Notes |
|---|------|--------|--------------|-------|
| P1 | MCP server and public API with API keys | postiz | Lets a person run their staff from Claude or ChatGPT, still behind our approval inbox | Tools only create drafts and read state; approvals stay in the inbox. Needs OAuth and scoped keys. |
| P2 | Vendor adapters for media: storage (local, R2), upload from URL, short links with click tracking | postiz | Pattern for the M4b video vendors | Short-link click data can feed lead scoring. |
| P3 | Outbound webhooks | postiz | Integrations without polling | Sign payloads with the keyring HMAC. Retries with backoff. |
| P4 | Per-publish failure log with redacted request | postiz | Easier support | Must redact tokens and personal data before storing. |
| P5 | Digest and streak emails, in-app notifications | postiz | Re-engagement | After M5. |
| P6 | Agency mode: client profiles, roles, approver role | postiz-cheap (roadmap) | Agencies manage many brands | We already have workspaces and RLS; this is a UI and roles question. |
| P7 | Aggregator for hard networks (TikTok, YouTube, Pinterest) via a paid third-party API | postiz-cheap (uses MuAPI) | Skips per-network app review | **Trade-offs:** vendor holds the user's tokens, lock-in, per-use cost, and their terms bind us. Only as a deliberate Milestone 0 decision. Not planned. |
| P8 | Browser extension: send a highlighted passage to the staff member as an idea | postiz | Captures ideas where people read | Uses the API from P1 with an "ideas only" key. Page text is untrusted. |
| P9 | Account health: refresh tokens early, warn before expiry, one-click reconnect | postiz (token refresh) | Today an account only turns `broken` after a post fails | Builds on the existing `broken` state. **Built 2026-11-06:** every six hours a login that runs out within 14 days (Meta, Threads: renewed by trading it for another) is renewed; if that fails, the account is `degraded` three days ahead with the date, `broken` when refused or expired, each with an activity event. Reconnect was already on the Accounts page. Not built: warning by email, and tracking when a refresh token itself runs out (X, TikTok). |

Plain-language write-up with user stories and flowcharts for every item: [IDEAS-EXPLAINED.md](IDEAS-EXPLAINED.md).

## Not adopting

- Temporal workflows (Postiz). Our Postgres plus BullMQ design with idempotent runs does the same job more simply.
- Autonomous agent scheduling (Postiz). Our approval-first autonomy ladder is the product's edge.
- Anything from postiz-cheap's code. See below.

## postiz-cheap review (2026-11-04)

A small Next.js app (about 77 files) that is a thin front end over MuAPI, a paid third-party aggregator. MuAPI does the
publishing, account connection, uploads and AI. Not affiliated with Postiz. MIT licensed. Read only, nothing run.

Worth noting as ideas only: the aggregator model (P7), request-id polling (S2), colour tags, the leaderboard (S11), and
aspect presets (S15).

Do not copy anything from it. Problems found while reading:

- **Auth bypass.** A "Demo / Admin" credentials provider accepts any email, checks no password, and creates the user on
  first login. Anyone can sign in as anyone. The README admits it does not validate a password.
- **Hardcoded fallback session secret** in `src/lib/auth.js` when `NEXTAUTH_SECRET` is unset.
- **Open download proxy** (`/api/download?url=`): fetches any URL for any caller, with no auth check, so it is a
  server-side request forgery risk.
- **No worker.** Due posts are published inside an authenticated `GET /api/posts`. A read request that sends posts, and
  nothing runs if nobody opens the page.
- **Credit deducted before the publish call.** It is refunded when the network later reports failure, but not when the
  submit call itself throws (that path marks the post failed and returns no credit).
- **Fallback account list is one in-memory array shared by every user**, seeded with demo accounts. The accounts,
  rename, delete and analytics routes fall back to it when no remote accounts are found.
