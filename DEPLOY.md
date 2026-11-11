# Deploying Chaos Garden for free

Render runs the backend, Neon holds the databases, and Vercel serves the dashboard. None of them needs a credit card. Plan terms below were checked on each provider's own pages in November 2026; free plans change, so glance at them again before relying on a limit.

```
browser ── dashboard (Vercel) ──▶ control API (Render) ──▶ Neon: chaos-garden-control
   │                                  │  ▲
   │                                  ▼  │ internal key
   └──▶ proxy, Go (Render) ──▶ your API   ingest (Render) ──▶ Neon: chaos-garden-ingest
             │                               ▲
             └──── events ──▶ Redis (Render Key Value) ────┘
```

## What you need

- Accounts on [Render](https://render.com), [Neon](https://neon.com) and [Vercel](https://vercel.com).
- The open PRs merged into `main` in all three repos. CI publishes the images Render runs only from `main`: `ghcr.io/georgi4334/chaos-garden-control-api`, `chaos-garden-ingest` and `chaos-garden-proxy-go`.
- Those images must be **public**. Your repos are public, so they normally are; check on github.com under your profile > Packages. If one is private, open it > Package settings > Change visibility > Public.

## 1. Neon: two databases

Each service owns its database, and Neon's free limits apply per project, so use two projects.

1. In Neon, create a project named `chaos-garden-control` in the region **AWS US West 2 (Oregon)**, next to Render's `oregon` region.
2. Create a second project, `chaos-garden-ingest`, in the same region.
3. For each project, open **Connect** and copy the connection string. It looks like `postgresql://user:password@ep-....us-west-2.aws.neon.tech/neondb?sslmode=require`. Use the direct connection, not the pooled one, and keep both strings private.

The services create their tables themselves when they start.

## 2. Render: the backend

1. In Render, click **New > Blueprint** and connect the `Chaos-Garden` repository. Render reads `render.yaml` and lists four resources: `chaos-garden-redis`, `chaos-garden-control-api`, `chaos-garden-ingest` and `chaos-garden-proxy`.
2. Render asks for the values the file leaves blank:

   | Service | Variable | Value |
   |---|---|---|
   | control API | `DATABASE_URL` | the `chaos-garden-control` connection string |
   | control API | `INGEST_URL` | `https://chaos-garden-ingest.onrender.com` |
   | control API | `CORS_ORIGIN` | `https://chaos-garden-web.vercel.app` (you'll correct it after step 3) |
   | ingest | `DATABASE_URL` | the `chaos-garden-ingest` connection string |
   | proxy | `CONTROL_API_URL` | `https://chaos-garden-control-api.onrender.com` |

   `INTERNAL_API_KEY` and `METRICS_TOKEN` are generated for you, shared by the three services.
3. Click **Apply**. The first deploy takes a few minutes.
4. Open each service and note its real URL at the top of the page. Render adds a suffix when a name is taken, for example `chaos-garden-ingest-x1y2.onrender.com`. If a URL differs from what you entered, fix it under the other service's **Environment** tab, then save, and the service restarts.
5. Check `https://<control-api-url>/health` and `https://<ingest-url>/health`. Each should say `"status":"ok"`.

## 3. Vercel: the dashboard

1. In Vercel, click **Add New > Project** and import `chaos-garden-web`. Vercel detects Next.js.
2. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_CONTROL_API_URL` = your control API URL, e.g. `https://chaos-garden-control-api.onrender.com`
   - `NEXT_PUBLIC_PROXY_URL` = your proxy URL, e.g. `https://chaos-garden-proxy.onrender.com`

   These are compiled into the page, so if you change them later, redeploy.
3. Deploy, and note the dashboard's URL.
4. Back in Render, set the control API's `CORS_ORIGIN` to that exact URL (no trailing slash) and save. Until then, the browser is not allowed to call the API.

## 4. Try it

1. Open the dashboard. **The first visit can take about a minute** while the free Render services wake up; if you see "may be waking up", try again shortly.
2. Create a garden, then add a target with a public API as its base URL, e.g. `https://jsonplaceholder.typicode.com`. Private and local addresses are blocked on purpose.
3. Add a rule and send requests from **Try it**. **Activity** shows them once the ingest service has stored them. If the ingest service was asleep, Activity first says "Request logs are unavailable right now" (the control API waits only 5 seconds for it); it refreshes by itself every 15 seconds and shows the logs once ingest is awake.

## 5. Deploy automatically after merges (optional)

Render doesn't redeploy image-based services when CI pushes a new image, so CI can ask it to:

1. In Render, open each service > **Settings > Deploy Hook** and copy the URL. It is a secret.
2. In GitHub, add the hooks as repository secrets (Settings > Secrets and variables > Actions):
   - `Chaos-Garden`: `RENDER_DEPLOY_HOOK_CONTROL_API` and `RENDER_DEPLOY_HOOK_INGEST`
   - `chaos-garden-proxy`: `RENDER_DEPLOY_HOOK_PROXY`

From then on, each push to `main` builds the image, pushes it, and redeploys that service. Without the secrets, that step just prints that it skipped. Vercel redeploys the dashboard on every push by itself.

## Free-plan limits to know

- **Render web services sleep** after 15 minutes without traffic, and waking takes about a minute. The **ingest service only reads events while awake**, which is when someone opens Activity (the control API wakes it). Until then, events wait in Redis.
- **Render's free Redis is in-memory only.** A restart, which Render may do at any time, loses waiting events and resets rate-limit buckets. The stream is capped at 20,000 events to fit.
- **750 free instance hours per month**, shared by all of your free Render services. Sleeping services don't use any. If they run out, Render suspends free services until next month.
- Render **may suspend a free service that sends unusually high outbound traffic**. The proxy's job is outbound traffic, so keep test runs modest.
- **Neon free:** 1 GB of storage and 100 compute-hours a month per project. Each database sleeps after 5 minutes idle and wakes on the next query. Request logs are kept for 7 days.
- **Vercel Hobby** is for personal, non-commercial use.

## Security notes

- Free Render services can't use the private network, so the control API's and ingest service's `/internal` endpoints are on the public internet. They accept only `INTERNAL_API_KEY`, a generated 256-bit secret. Never put it in the dashboard or share it.
- `/metrics` requires `METRICS_TOKEN` as a bearer token. To scrape it with Prometheus, read the token from the Render environment group.
- The proxy runs with `ALLOW_PRIVATE_TARGETS=false`, so it refuses localhost, private networks and cloud metadata addresses.
- The control API trusts Render's proxy for client addresses (`TRUST_PROXY=true`), so the limit of 10 gardens per hour applies per visitor.
