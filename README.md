# JobsAutoApply

Quality-over-quantity job application automation: AI-matched jobs, human-reviewed
applications, ATS-compliant sourcing, full audit trail. See `PRD.md`/architecture
notes from the build conversation for product/architecture detail; this README
covers local setup only.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- Clerk (auth)
- PostgreSQL via Supabase + pgvector, Drizzle ORM
- Claude API (resume parsing + tailoring)
- Cloudflare R2 (resume file storage)
- Inngest (durable workflows for ingestion/matching/submission)
- Playwright (headless submission to Greenhouse/Lever-hosted application forms)
- Stripe (billing — added in a later step)

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — Supabase Postgres connection string (use the pooled "Transaction" mode URI)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — from the Clerk dashboard
   - `CLERK_WEBHOOK_SECRET` — from Clerk's Webhooks page, once you've added an endpoint pointing at `/api/webhooks/clerk`
   - `ANTHROPIC_API_KEY` — required for resume parsing (`/api/profile/upload`)
   - `VOYAGE_API_KEY` — required for job/profile embeddings (Anthropic has no embeddings endpoint; Voyage AI is Anthropic's recommended embeddings partner). Get a key at https://dashboard.voyageai.com
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` — a Cloudflare R2 bucket for storing uploaded resume files, required for resume upload
   - `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — from the Inngest dashboard, required for job ingestion/matching to run on a schedule in production (not required for local dev, which uses the Inngest Dev Server)

2. Install dependencies:
   ```bash
   npm install
   ```

3. Enable the `pgvector` extension on your Supabase project (required before the schema can be pushed, since `profiles.embedding` and `jobs.embedding` are `vector` columns):
   ```bash
   npm run db:enable-extensions
   ```

4. Push the schema to your database:
   ```bash
   npm run db:push
   ```
   (Or use `npm run db:generate` + `npm run db:migrate` if you want versioned migration files instead of a direct push — `db:generate` has already produced `drizzle/0000_*.sql` matching the current schema.)

5. Add the pgvector similarity-search indexes (ivfflat; not expressible in Drizzle's schema DSL):
   ```bash
   npm run db:post-migrate
   ```

6. Seed a couple of job sources to ingest from (edit `src/db/seed-job-sources.ts` to add real Greenhouse board tokens / Lever site names first):
   ```bash
   npm run db:seed-job-sources
   ```

7. Run the dev server, and in a second terminal run the Inngest Dev Server so cron/event-triggered functions execute locally:
   ```bash
   npm run dev
   npx inngest-cli@latest dev
   ```
   Visit `http://localhost:3000`. The Inngest dev UI (`http://localhost:8288`) lets you manually trigger `ingest-jobs` instead of waiting for its 6-hour cron.

### Wiring up the Clerk webhook locally

The `/api/webhooks/clerk` route syncs Clerk users into the app's `users` table. To
test it locally, use the Clerk CLI or a tunnel (e.g. `ngrok http 3000`) and point a
webhook endpoint at `https://<tunnel>/api/webhooks/clerk`, subscribed to
`user.created`, `user.updated`, `user.deleted`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run db:enable-extensions` | Enable the `pgvector` Postgres extension |
| `npm run db:generate` | Generate a new Drizzle migration from schema changes |
| `npm run db:migrate` | Apply generated migrations |
| `npm run db:push` | Push schema directly (no migration files) — convenient for early-stage dev |
| `npm run db:post-migrate` | Create ivfflat vector indexes on `jobs`/`profiles` |
| `npm run db:seed-job-sources` | Insert initial Greenhouse/Lever `job_sources` rows to ingest from |
| `npm run db:studio` | Open Drizzle Studio to browse the database |

## Project structure

```
src/
  app/                    # App Router routes
    (dashboard)/dashboard/ # authenticated dashboard (route group, no URL segment)
    (dashboard)/profile/   # resume upload + parsed-profile review/edit UI
    (dashboard)/jobs/      # ranked job match feed
    sign-in/, sign-up/     # Clerk auth pages
    api/webhooks/clerk/    # Clerk → DB user sync
    api/profile/           # GET/PATCH current profile, GET version history
    api/profile/upload/    # resume upload → R2 → text extraction → Claude parse → new profile version
    api/jobs/              # GET current user's ranked job matches
    api/inngest/           # Inngest serve() handler — registers all background functions
  components/ui/          # shadcn/ui components
  db/
    schema/               # Drizzle table definitions, one file per domain area
    client.ts             # Drizzle client instance
    enable-extensions.ts  # one-off script: CREATE EXTENSION vector
    post-migrate.ts       # one-off script: ivfflat indexes
    seed-job-sources.ts   # one-off script: seed initial Greenhouse/Lever sources
  inngest/
    client.ts              # Inngest client instance
    functions/ingest-jobs.ts # cron: pull jobs from Greenhouse/Lever, embed, upsert; prune stale jobs
    functions/match-jobs.ts  # event-triggered: embed profile, score candidate jobs, upsert job_matches
  lib/
    env.ts                # Zod-validated environment variables
    current-user.ts        # resolves the Clerk session to an app `users` row
    resume-text-extraction.ts # PDF/DOCX → plain text
    storage/r2.ts          # Cloudflare R2 upload/signed-download helpers
    ai/claude.ts            # Anthropic client
    ai/parse-resume.ts      # resume text → structured profile via Claude tool-use, Zod-validated
    ai/embeddings.ts        # Voyage AI embeddings client (profile + job text → vector(1536))
    ingestion/greenhouse.ts # Greenhouse public job board API → normalized job rows
    ingestion/lever.ts      # Lever public postings API → normalized job rows
    matching/score.ts       # explainable match scoring: embedding similarity + seniority/location/salary heuristics
  middleware.ts            # Clerk route protection
```

### Resume parsing design notes

- Parsing goes through Claude's tool-use (forced `tool_choice`) rather than
  free-form JSON-in-text, so the output shape is enforced at the API level and
  then re-validated with Zod before it touches the database.
- The parsing system prompt explicitly forbids inventing or embellishing any
  experience, skill, or credential not present in the source text — fields
  without evidence in the resume come back `null`/empty rather than guessed.
- Every edit via `PATCH /api/profile` inserts a new `profiles` row (incrementing
  `version`) instead of mutating the existing one, so applications submitted
  against an earlier profile version remain auditable against what was true
  when they were sent.

### Job ingestion & matching design notes

- **Sources**: Greenhouse and Lever both expose public, unauthenticated job
  board APIs intended for embedding postings on a company's careers page
  (`boards-api.greenhouse.io/v1/boards/{token}/jobs`,
  `api.lever.co/v0/postings/{site}`). No ToS violation, no scraping, no
  authentication bypass — this is the documented, intended use of those
  endpoints. `job_sources.configJson` stores the board token / site slug.
- **Ingestion** (`ingestJobs`, cron every 6h): fetches each active source,
  strips HTML from Greenhouse's rich-text descriptions, embeds the
  title+description via Voyage, and upserts into `jobs` keyed on
  `(sourceId, externalId)`. On success it emits a `jobs/ingested` event.
- **Embeddings**: Anthropic's API has no embeddings endpoint, so job/profile
  embeddings go through Voyage AI (`voyage-large-2`, which natively outputs
  1536 dimensions — matching the existing `vector(1536)` columns with no
  schema change). Job text uses `input_type: "document"`, profile text uses
  `input_type: "query"`, per Voyage's asymmetric retrieval guidance.
- **Matching** (`matchJobsForProfile`, triggered by `profile/updated`):
  re-embeds the profile, finds the top 50 jobs by pgvector cosine similarity
  (`cosineDistance` from `drizzle-orm`), then scores each candidate on four
  explainable sub-scores — skills (embedding similarity), seniority (title
  keyword heuristic), location (remote preference vs. job location), and
  salary (range overlap) — blended into `overallScore`. `matchJobsAfterIngest`
  re-triggers matching for every user's latest profile whenever new jobs land,
  so existing users see new postings without re-editing their profile.
- **Job feed** (`/jobs`): reads `job_matches` joined with `jobs`, sorted by
  `overallScore` descending, showing the sub-score breakdown and which of the
  user's skills were found in the job description.
