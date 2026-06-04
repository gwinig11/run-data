# FIT Activity Dashboard

A Next.js app for storing and reviewing historical FIT activity uploads from Make.com.

## Local Development

```bash
npm run dev
```

Open `http://localhost:3000/?key=dev-secret`.

If `FIT_WEBHOOK_SECRET` is not set, local development uses `dev-secret`. Historical storage requires `DATABASE_URL`. If `BLOB_READ_WRITE_TOKEN` is not set, raw FIT files are stored under the ignored local `uploads/` directory.

## Database Setup

Provision Neon Postgres, preferably through the Vercel Marketplace for the deployed project, then set:

```text
DATABASE_URL=your-neon-connection-string
FIT_WEBHOOK_SECRET=your-shared-secret
BLOB_READ_WRITE_TOKEN=provided-by-vercel-blob
```

Create or refresh the `runs` table:

```bash
npm run db:init
```

The schema also lives in `sql/runs.sql` for manual review. Runtime code lazily ensures the same table/indexes exist before reads and writes.

## Legacy Import

If this app already has a latest-only upload from the previous Blob/local storage model, import it once after configuring `DATABASE_URL`:

```bash
npm run import:legacy
```

The import is rerunnable. It stores the legacy FIT through the same historical path with `source = "legacy-import"`, and SHA-256 file-hash deduplication prevents duplicate rows.

## Make.com Webhook

Use a push-only Make.com scenario. Dropbox detects a new `.fit` file, Make.com downloads the file bytes, then sends that file to:

```text
POST https://YOUR_VERCEL_DOMAIN/api/webhook/fit
```

Headers:

```text
x-fit-webhook-secret: YOUR_FIT_WEBHOOK_SECRET
```

Body:

- Recommended: `multipart/form-data` with a file field named `file`
- File name: original Dropbox filename
- File content: downloaded Dropbox FIT binary
- Also accepted: raw `application/octet-stream` with optional `x-filename`

Uploads are limited to 4 MB. Each successful unique upload creates one permanent historical run row and stores the original FIT file privately. If Make.com retries the same FIT bytes, the app returns the existing run instead of creating a duplicate.

## Dashboard

Visit:

```text
https://YOUR_VERCEL_DOMAIN/?key=YOUR_FIT_WEBHOOK_SECRET
```

The app stores a secure HttpOnly cookie and redirects to `/`.

- `/` shows the newest stored run.
- `/runs` shows paginated run history.
- `/runs/[id]` shows a single historical run.
- `/api/latest` and `/api/raw/latest` remain compatibility routes backed by the newest stored run.
- `/api/raw/[id]` downloads a specific authenticated FIT file.

The old global Clear action is retired because history is now permanent.
