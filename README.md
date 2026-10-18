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
- Inngest (durable workflows for ingestion/matching/submission — added in a later step)
- Stripe (billing — added in a later step)

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — Supabase Postgres connection string (use the pooled "Transaction" mode URI)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — from the Clerk dashboard
   - `CLERK_WEBHOOK_SECRET` — from Clerk's Webhooks page, once you've added an endpoint pointing at `/api/webhooks/clerk`
   - `ANTHROPIC_API_KEY` — required for resume parsing (`/api/profile/upload`)
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` — a Cloudflare R2 bucket for storing uploaded resume files, required for resume upload

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

6. Run the dev server:
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000`.

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
| `npm run db:studio` | Open Drizzle Studio to browse the database |

## Project structure

```
src/
  app/                    # App Router routes
    (dashboard)/dashboard/ # authenticated dashboard (route group, no URL segment)
    (dashboard)/profile/   # resume upload + parsed-profile review/edit UI
    sign-in/, sign-up/     # Clerk auth pages
    api/webhooks/clerk/    # Clerk → DB user sync
    api/profile/           # GET/PATCH current profile, GET version history
    api/profile/upload/    # resume upload → R2 → text extraction → Claude parse → new profile version
  components/ui/          # shadcn/ui components
  db/
    schema/               # Drizzle table definitions, one file per domain area
    client.ts             # Drizzle client instance
    enable-extensions.ts  # one-off script: CREATE EXTENSION vector
    post-migrate.ts       # one-off script: ivfflat indexes
  lib/
    env.ts                # Zod-validated environment variables
    current-user.ts        # resolves the Clerk session to an app `users` row
    resume-text-extraction.ts # PDF/DOCX → plain text
    storage/r2.ts          # Cloudflare R2 upload/signed-download helpers
    ai/claude.ts            # Anthropic client
    ai/parse-resume.ts      # resume text → structured profile via Claude tool-use, Zod-validated
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
