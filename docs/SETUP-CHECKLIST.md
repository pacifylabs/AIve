# Setup checklist: what is left for you to do

Status: 2026-11-07. A living list of every step that needs a person (you), not code. Work through it in any order; each
section stands alone. When a step is done, tick it here so the next session knows.

Where things live: [DEPLOYMENT.md](DEPLOYMENT.md) describes the hosted environment and every setting. This file is the
to-do list that sits on top of it.

**Three rules for all of it**

1. Secrets (app secrets, API keys, passwords, tokens) go straight into Render's **Environment** page for the service
   `ai-staff-staging`. Never paste them into chat, a commit, or a document. Saving a variable redeploys the service
   (about two to three minutes).
2. If something fails, send the message you saw (not the keys). Most errors name what is missing.
3. Nothing in the app has been run against a real Threads, TikTok or LinkedIn account yet. They were written from each
   network's documentation. Expect the first real connection to turn up a fix or two.

## At a glance

| # | What | Needs from you | State |
|---|---|---|---|
| 1 | Housekeeping on Render and Neon | Two deletions, one password change | [ ] |
| 2 | Anthropic API key on Render | Paste one key | [ ] |
| 3 | Telegram | Nothing, already connected | [x] |
| 4 | Discord | A webhook address (optional) | [ ] |
| 5 | LinkedIn (own profile) | Create an app, two keys | [ ] |
| 6 | Threads | Create an app, two keys, add yourself as tester | [ ] |
| 7 | TikTok | Create an app, two keys, verify a video domain | [ ] |
| 8 | LinkedIn Company Pages | Apply to LinkedIn, then one switch | [ ] |
| 9 | Facebook and Instagram | Meta app, review, two keys | [ ] |
| 10 | X | Pick a paid plan, two keys | [ ] |
| 11 | Email from its own domain | Verify a domain in Resend | [ ] |
| 12 | A first full test | About 15 minutes | [ ] |

All settings are on Render: dashboard, service `ai-staff-staging`, **Environment**. The API address everything calls back
to is `https://ai-staff-staging.onrender.com` (this is `API_PUBLIC_URL`). The web app is `https://a-ive.vercel.app`.

---

## 1. Housekeeping

- [ ] **Delete the stray Render database `ai-staff-db`.** It was made by mistake before the Neon move. Postgres for this
      project is on Neon only. Render dashboard, the database, Settings, Delete. (There is no tool for me to do it.)
- [ ] **Delete the idle Render service `ai-staff-api`** if it is still listed. The live one is `ai-staff-staging`.
- [ ] **Change the Neon owner password.** The password of the `ai_staff_owner` role appeared in a working session's
      output on 2026-11-06. In the Neon console, project `ai-staff`, Roles, reset the password for `ai_staff_owner`.
      The app does not use this role (it uses `ai_staff_app`), so nothing on Render changes. You only need the new
      password when you run a migration from your own machine:
      `DB_HOST=… DB_NAME=ai_staff DB_ADMIN_USER=ai_staff_owner DB_ADMIN_PASSWORD=… DB_SSL=true DB_PORT=5432 pnpm db:migrate`
      (set `DB_PORT=5432`, or the repo's local `.env` file points the command at the local test database).
- [ ] Optional: Redis `ajo-redis` is shared with another project and has no persistence, so queued jobs are lost if it
      restarts. Fine for review; move to its own instance before real use.

## 2. Anthropic API key

Without it every staff task that writes text (weekly plans, drafts, article posts, replies) fails and retries. The app
itself, the composer and publishing do not need it.

- [ ] Create a key at https://console.anthropic.com, and set a spend limit on the organisation.
- [ ] Add `ANTHROPIC_API_KEY` on Render.
- [ ] Check: on **Feeds**, add a feed and use **Check now**. A draft should reach the **Inbox** within a minute or two.
      If not, Render's **Logs** will say why (look for `ANTHROPIC_API_KEY is not set`).

## 3. Telegram (done)

Connected. If you ever reconnect or add another channel:

1. In Telegram, message @BotFather, send `/newbot`, and copy the bot token.
2. Add the bot to the channel as an **administrator** with **Post messages** on. (If you see
   "member list is inaccessible", the bot is not an administrator yet. That is Telegram's wording for it.)
3. On **Accounts**, Connect Telegram: paste the token and the channel as `@yourchannel` (a private channel uses its
   number, starting `-100`).

## 4. Discord (optional)

1. In the Discord channel: Edit Channel, Integrations, Webhooks, New Webhook, copy the webhook URL.
2. On **Accounts**, Connect Discord and paste it. Only `discord.com` webhook addresses are accepted.

## 5. LinkedIn: your own profile

Needs no approval. About 15 minutes. LinkedIn's own steps and screens can change; the Auth tab always shows what the app
may use.

- [ ] Go to https://www.linkedin.com/developers/apps and **Create app**.
- [ ] Give a name and a **privacy policy URL** (LinkedIn checks it is a real page).
- [ ] **Link a LinkedIn Page.** An app cannot exist without one. Use your company Page, or make a simple one first.
      LinkedIn gives a verification link that the Page's admin opens (you can be the admin).
- [ ] On the **Products** tab, request **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**. Both
      are self-serve and appear at once. Do **not** request the Community Management API yet (see section 8).
- [ ] On the **Auth** tab, under **Authorized redirect URLs for your app**, add exactly (character for character):
      `https://ai-staff-staging.onrender.com/v1/social/callback/linkedin`
- [ ] Copy the **Client ID** and **Primary Client Secret** from the Auth tab.
- [ ] On Render add `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.
- [ ] On **Accounts**, LinkedIn should now show **Connect**. Connect and approve. Your own profile appears as the account.
- [ ] Test: **New post**, tick the account, write a short test post, Post. It should appear on your profile.

What to know:

- Posts go to your **profile**, not a Company Page (section 8).
- The login lasts about 60 days and LinkedIn does not let us renew it in the background. The Accounts page and the
  dashboard warn a week ahead; connect again then.
- Words, one picture, or words with a link. Not yet: video, several pictures, comments and replies.
- `LINKEDIN_VERSION` (default `202610`) is the month of LinkedIn's versioned API. LinkedIn retires old months, so move it
  forward on Render when LinkedIn warns about it.

## 6. Threads

Until Meta approves the app, only people you add as **Threads testers** can connect, which is enough to test with.

- [ ] https://developers.facebook.com/apps, **Create app**, choose the use case **Access the Threads API**. Meta makes two
      ID and secret pairs; we need the **Threads** pair, not the main app one.
- [ ] **Use cases, Customize:** add `threads_content_publish` and `threads_manage_insights` (`threads_basic` is already there).
- [ ] **Settings:** copy the **Threads app ID** and **Threads app secret**.
- [ ] Still in Settings, set:
      - Valid OAuth redirect URI: `https://ai-staff-staging.onrender.com/v1/social/callback/threads`
      - Deauthorize callback URL: `https://ai-staff-staging.onrender.com/v1/social/threads/deauthorize`
      - Data deletion requests URL: `https://ai-staff-staging.onrender.com/v1/social/threads/data-deletion`
      Save.
- [ ] **App roles, Roles, Add People, Threads Tester**: enter your Threads username. Then accept the invite in Threads:
      Settings, Account, Website permissions, Invites (https://www.threads.com/settings/account).
- [ ] On Render add `THREADS_APP_ID` and `THREADS_APP_SECRET`.
- [ ] On **Accounts**, Connect Threads and approve.
- [ ] Test: **New post** to Threads. Text posts publish after a few seconds (the post is made, then published once Threads
      says it is ready). A post with a picture or video can take about half a minute.

What to know:

- Text with a link shows the link as a card. A post with a picture or video cannot carry a link card, and says so.
- Threads takes one picture or one video per post here. Emoji count by the bytes they take (about four each).
- The login lasts 60 days; the app renews it automatically a couple of weeks before it ends.
- To let people who are not testers connect, the app must pass Meta's App Review for `threads_content_publish` and be
  published. That needs a privacy policy URL, an app icon, and a working data-deletion URL (done above). Not needed now.

## 7. TikTok

TikTok is the strictest of the networks. Read the limits first.

**Limits you must plan around**

- **Video only.** TikTok takes videos, not words. A post for TikTok without a video is refused, and the staff member
  does not draft for TikTok yet (that arrives with the video work, Milestone 4b).
- **Videos are fetched from a web address, and that address must be on a domain you have verified** in the TikTok app.
  An unverified address fails with `url_ownership_unverified`.
- **Until TikTok audits the app, posts can only go to a private TikTok account** and only you can see them
  (`unaudited_client_can_only_post_to_private_accounts`). The audit is TikTok's review of the app.
- The audit also expects the app to show the person, before posting, the privacy options TikTok returns for the account
  and any commercial-content disclosure. Our approval screen does not show those yet. Needed before applying for the
  audit, not before testing.
- Logins: the access token lasts a day and the app renews it on use; the refresh token lasts a year.

**Steps** (written from TikTok's documentation; I could not open TikTok's portal pages, so check each against what you see)

- [ ] https://developers.tiktok.com, create a developer account and **Manage apps, Connect an app**.
- [ ] Add the products **Login Kit** and **Content Posting API**. Enable the **Direct Post** option.
- [ ] Request the scopes `user.info.basic` and `video.publish`.
- [ ] Add the redirect URI: `https://ai-staff-staging.onrender.com/v1/social/callback/tiktok`
- [ ] **Verify the domain or URL prefix where your test videos are hosted** (TikTok's page "Media transfer guide, Pull from
      URL"). You need a domain you control and can add a file or DNS record to.
- [ ] TikTok may offer a sandbox with test users that avoids the audit while you test. Check its portal.
- [ ] Copy the **Client key** and **Client secret**. On Render add `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`.
- [ ] On **Accounts**, Connect TikTok and approve. Make the TikTok account **private** while the app is unaudited.
- [ ] Test: **New post**, tick TikTok, put a video address (ending `.mp4`, `.mov`, `.m4v` or `.webm`, on the verified
      domain) in the pictures-or-video box, Post. The post note will say it is only visible to you.

## 8. LinkedIn Company Pages (later)

To post as a Company Page you administer, LinkedIn must approve the **Community Management API** for the app. This is a
review and can take weeks.

- [ ] On the app's **Products** tab, request **Community Management API** and fill in the use-case form.
- [ ] When approved, on Render set `LINKEDIN_PAGES=true`.
- [ ] Connect LinkedIn again on **Accounts**. The Pages you administer now appear next to your profile.

Do not set `LINKEDIN_PAGES=true` earlier: LinkedIn refuses the whole sign-in if the app asks for permissions it does not
have.

## 9. Facebook and Instagram (later)

Needs a Meta app with Facebook Login, and Meta's App Review before anyone but you can connect.

- [ ] https://developers.facebook.com/apps, create an app (business type). Start **business verification** now; it takes
      the longest.
- [ ] Add redirect URIs `https://ai-staff-staging.onrender.com/v1/social/callback/facebook` and `…/instagram`.
- [ ] Permissions the code asks for: Facebook `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`; Instagram
      `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`. Messaging
      (`META_MESSAGING=true`) needs more and is off.
- [ ] On Render add `META_APP_ID` and `META_APP_SECRET`.
- [ ] Until the app passes review, only people with a role on the app can connect.
- Instagram posts need a picture or video, and the account must be a business account linked to a Facebook Page.

- [ ] In the app's settings, set the **Deauthorize callback URL** to
      `https://ai-staff-staging.onrender.com/v1/social/meta/deauthorize` and the **Data deletion requests URL** to
      `https://ai-staff-staging.onrender.com/v1/social/meta/data-deletion`. Both check Meta's signature with
      `META_APP_SECRET`. Accounts connected before 2026-11-09 do not carry the Meta user id these need; connect them
      again (none are connected on the hosted site yet).

## 10. X

- [ ] https://developer.x.com, choose a plan that allows posting at our volume (this is a paid decision).
- [ ] Create an app with OAuth 2.0, redirect `https://ai-staff-staging.onrender.com/v1/social/callback/x`.
- [ ] On Render add `X_CLIENT_ID` and `X_CLIENT_SECRET`.
- Pictures on X are not sent yet (known gap).

## 11. Email from its own domain

Platform email (sign-up codes, invitations) goes through Resend from `AI Staff <no-reply@dosinex.com>`, which is another
product's domain.

- [ ] Choose AI Staff's own domain, add it in Resend, add the DNS records it shows, and wait for it to verify.
- [ ] Change `MAIL_FROM` on Render to an address on it.

## 12. A first full test (about 15 minutes)

After at least one network is connected:

1. **Accounts:** the account shows and is healthy.
2. **Hire** (if there is no Social Media staff member yet): Hire a Social Media Staff member with that account ticked.
3. **New post:** write a post, tick the account, Post. Open **Calendar**: it shows as "Written by you, Scheduled", then
   "Published" within a minute or two. Click **View post** to see it on the network.
4. **Feeds** (needs the Anthropic key): add a blog feed address and the account. A draft for the newest article reaches
   **Inbox** with the article link shown. Approve it; it posts at the next free hour.
5. **Templates and tags:** save a template, start a post from it, tag it, and filter the Calendar by the tag.
6. **Accounts, Add a sign-off:** add one and check the next draft ends with it.
7. **Dashboard:** the account shows Healthy. (A warning or red state names the reason and the date.)
8. **Audit log** (Company, Audit log; owners and admins): every change you just made is listed with who, what, the
   result and the IP. Nothing you typed is stored.
9. **Reply chain:** on **New post**, use **Add another post** once or twice, post to X, Threads or Telegram, and check the
   Calendar shows "Thread: 3 of 3 posted". (Needs a connected account on one of those networks.)
10. **Followers:** the Accounts page shows follower counts after the first daily capture (about 02:10 UTC the next day).
11. The free Render service sleeps after about 15 minutes idle; the first request after a pause takes about a minute.

## What to send me when something fails

- The exact message shown in the app, and which step you were on.
- For a post that did not go out: the account, the time, and what the Calendar says.
- Render's **Logs** lines around the time, if you can copy them (check there is no key or token in what you paste).

## Things I still have to build (not for you)

- TikTok audit screen: show the account's privacy choices and disclosures before posting (section 7).
- LinkedIn video and multiple pictures; X pictures; Threads reply chains (S6).
- Backlog with the full list: [IDEAS-BACKLOG.md](IDEAS-BACKLOG.md).
