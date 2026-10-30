# Role: Social Media Staff

`key: social_media` · Status: draft v1, 2026-10-29.

## Job description (shown at hire)

- Plans a week of posts around your offers, campaigns and voice.
- Writes each post to fit the network it goes to.
- Turns trends and your products into short video scripts and finished videos. You always watch the video before
  it's posted.
- Schedules and publishes the posts you approve, or publishes on its own once promoted.
- Drafts replies to comments and messages, and flags anything that needs you.
- Spots people who want to buy and passes them to your Sales Manager Staff.
- Sends you a weekly summary of what was posted and how it did.

## Connectors

| Network | Capabilities at launch | Requirement | Notes |
|---|---|---|---|
| Facebook Page | Publisher, CommentReader, MessageReplier | Meta app review for the page-management, posting, comments and messaging permissions | 24-hour reply window for messages |
| Instagram Business/Creator | Publisher (needs media), CommentReader, MessageReplier | Meta app review; account must be Business or Creator and linked to a Page | posts need at least one image or video |
| LinkedIn Page | Publisher, CommentReader | LinkedIn Community Management API access | personal profiles are later |
| X | Publisher | Paid X API tier | text and video |
| TikTok | Publisher (video) | Content Posting API access and audit | Needed for video; until approved, videos are downloadable for manual posting |
| YouTube (Shorts) | Publisher (video) | Google OAuth app verification for the upload scope | Video only |

Video providers (template, presenter, generative renderers, TTS, stock, music) are platform-level connectors, not
customer accounts. See [VIDEO.md](../VIDEO.md).

At least one Publisher is required to activate the role. Exact permission names are confirmed during app review
(milestone 0) and recorded in DECISIONS.md. They are not hard-coded from memory.

## Settings (`settingsSchema`)

- `accounts[]`: which connected accounts this staff member posts to.
- `cadence`: posts per week per account (default 3, maximum set by plan).
- `postingWindows`: preferred days and times per account, in the workspace timezone.
- `pillars[]`: 3–5 content themes (from the interview).
- `hashtags`: always use, never use, and a maximum per post.
- `emoji`: none, light or free.
- `replyPolicy`: whether comment and DM replies are drafted, and which topics always go to a person.
- `video`: videos per week, allowed modes (template, presenter, generative), default duration, script approval gate
  on or off (the final video gate is always on), brand kit ID, voice ID, captions burned in or not.

## Interview (at hire)

1. What should people do after seeing your posts? (visit the site, book a call, buy, follow)
2. Pick 3–5 topics you want to be known for. (Suggestions come from the company brain.)
3. Paste 2–3 posts you liked, yours or anyone's. (Used as style examples, never copied.)
4. Anything you never post about?
5. How often per network?

## Tasks

| Type | Risk | Trigger | Output | Effects | Model |
|---|---|---|---|---|---|
| `social.plan_week` | drafts | Schedule: weekly, Friday 10:00 local | 5–15 post ideas with date, account, pillar and angle | `work_item(plan)` | small |
| `social.draft_post` | acts_external | Plan approved (one run per item), or a person | Body per account, hashtags, suggested media, first comment | `work_item(post_draft)` or `publish_intent` | small |
| `social.suggest_captions` | drafts | A person in the composer | 3 options | Returned synchronously | small (from KudiBooks `SocialCaptionsService`) |
| `social.publish` | acts_external | Intent due | none (no model) | Network call → `post.published` | none |
| `social.triage_engagement` | drafts | `engagement.received` | Classification (`question`, `praise`, `complaint`, `buying_intent`, `spam`, `other`) and an optional reply | `work_item(reply_draft)` or reply intent; `lead.created` on buying intent | small |
| `social.video_ideas` | drafts | Schedule (weekly with the plan), or a person | 3–5 angles, each with source, product fact, mode and credit estimate | `work_item(video_ideas)` | small |
| `social.video_script` | drafts | An idea is picked | Script schema (VIDEO.md §3) | `work_item(video_script)`, or straight to storyboard if the gate is off | mid |
| `social.video_render` | acts_external | Script approved | Rendered master, network variants, captions, asset manifest | `work_item(video)`. **Never promotable** | none (render providers) |
| `social.capture_metrics` | internal | 24 h and 7 d after `post.published` | none | `social_metrics` | none |
| `social.weekly_report` | internal | Schedule: Monday 08:00 | Summary sections | Report email + dashboard | small |

### Guardrails

`lengthFor(platform)`, `requiresMedia(platform)`, `allowedLinks`, `bannedTerms`, `factsOnly` (prices, dates,
discounts), a hashtag maximum, an emoji policy, no @-mentions of accounts not in the input, and the reply window (no
reply drafted after a message's window closes; the item goes to a person instead).

Complaints, legal threats, refund demands and anything involving personal data always escalate. They are never
auto-replied to, even when the staff member is promoted.

### Promotion rules

- `social.draft_post`: 20 approvals in 30 days, median edit ratio ≤ 15%, no rejections for "wrong facts".
  Promotion applies per connected account.
- Replies to comments and DMs: not promotable at launch. They stay as drafts.
- Videos (`social.video_render`): never promotable. Every video is watched and approved by a person (decision D16).

## Work units (billing)

`post_published` (per account), `reply_sent`, `video_credit` (template 1, presenter 3, generative 10; weights set
from beta cost). Plans, ideas, scripts and reports are included at no unit cost.

## Failure handling

- A publish fails with an auth error: the account is marked `broken`, its scheduled posts are paused, and the owner is alerted.
- A publish fails with a rate limit: deferred with back-off; still inside the window → retry; outside → alert.
- The outcome is uncertain (timeout after the request was sent): the intent is marked `uncertain`, and the network is checked for the post before anyone resends.

## Ported from KudiBooks

`social/providers/*` (network clients), `PLATFORM_LIMITS` and `lengthOnNetwork`, `social-publishing.scheduler.ts`
(becomes the publish dispatcher), `social-captions.service.ts` (becomes the prompt and schema of `suggest_captions`
and the base of `draft_post`), `social-messages.service.ts` (the 24-hour window logic), and `token-crypto.ts`.
Re-checked against current network APIs during the port.
