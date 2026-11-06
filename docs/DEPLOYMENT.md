# Hosted environment (staging)

Status: 2026-11-06. One hosted environment for manual review. It follows the `feat/m4-social-media` branch.

| Piece | Where | Address |
|---|---|---|
| Web app | Vercel project `a-ive` (root `apps/web`) | https://a-ive.vercel.app |
| API and worker | Render web service `ai-staff-staging` (free plan, Ohio) | https://ai-staff-staging.onrender.com |
| Database | Neon project `ai-staff` (`winter-unit-57325987`, Postgres 17, `us-east-2`) | database `ai_staff` |
| Redis | Render Key Value `ajo-redis`, shared with another project | database 1, prefixes `ai-staff` and `ai-staff-rl` |

Postgres for every implementation is on Neon, never on Render.

## How it fits together

- The browser talks only to the web app. The web app calls the API from the server (`API_URL`), so the API needs no CORS for browsers.
- The free Render plan has no background worker, so `infra/render/start.mjs` runs the API and the worker in one service. If either stops, both stop and Render restarts them.
- The free API sleeps after about 15 minutes idle. The first request after that takes about a minute, and scheduled work pauses while it sleeps. A paid plan with a separate worker fixes both.

## Database roles

- `ai_staff_owner` owns the schema and runs migrations. Its password is never given to Render.
- `ai_staff_app` is what the API and worker connect as. It cannot bypass row-level security, which is what keeps workspaces apart.

## Deploying

- **API and worker:** push to `feat/m4-social-media`. Render builds and deploys by itself (`autoDeploy`).
- **Migrations:** run before pushing a change that adds one, from your machine, with the owner's settings in the environment:
  `DB_HOST=… DB_NAME=ai_staff DB_ADMIN_USER=ai_staff_owner DB_ADMIN_PASSWORD=… DB_SSL=true pnpm db:migrate`
- **Web app:** Vercel builds a preview for every push. To publish to https://a-ive.vercel.app run `vercel deploy --prod` from the repo root (the project is linked; `.vercelignore` keeps the upload small). Git deploys to the main address only come from `main`.

## Settings the API needs on Render

`NODE_ENV=production`, `API_PORT=10000`, `TRUST_PROXY_HOPS=1`, `APP_URL` and `WEB_ORIGIN` (the web address), `API_PUBLIC_URL` (the API address), `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_SSL=true`, `DB_APP_USER`, `DB_APP_PASSWORD`, `REDIS_URL` (with `/1`), `BULL_PREFIX`, `RATE_LIMIT_PREFIX`, `JWT_ACCESS_SECRET`, `ENCRYPTION_KEYS`, `ENCRYPTION_ACTIVE_KID`, `EMAIL_PROVIDER`, `MAIL_FROM`, `RESEND_API_KEY`, `RUN_MIGRATIONS=false`.

The web app on Vercel needs `API_URL` and `SITE_URL`.

## Social network keys

Each network is listed as "not available yet" until its keys are set on Render. Callbacks to register are `API_PUBLIC_URL` + `/v1/social/callback/<network>`.

- **Threads:** `THREADS_APP_ID`, `THREADS_APP_SECRET`, from the Threads use case of a Meta app. Until Meta approves `threads_content_publish`, only people added as Threads testers on the app can connect.
- **TikTok:** `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, from a TikTok developer app with Login Kit and Content Posting API. Videos are fetched from a web address, which must be on a domain verified in the TikTok app. Until TikTok audits the app, posts only go to a private TikTok account.
- **Telegram and Discord** need no keys: the person pastes a bot token or webhook.

## Known gaps

- **Email** goes through Resend, sent from `AI Staff <no-reply@dosinex.com>` (`EMAIL_PROVIDER=resend`, `MAIL_FROM`, and `RESEND_API_KEY` in Render's settings). The sender is a domain from another product, so give AI Staff its own verified domain before real customers see it.
- No `ANTHROPIC_API_KEY`, so model tasks fail and retry. No Meta or X keys, so no networks can be connected.
- Redis is shared and has no persistence. Queued jobs are lost if it restarts.
