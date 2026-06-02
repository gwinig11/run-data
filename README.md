# FIT Activity Dashboard

A Next.js app for displaying the latest FIT activity uploaded by Make.com.

## Local Development

```bash
npm run dev
```

Open `http://localhost:3000/?key=dev-secret`.

If `FIT_WEBHOOK_SECRET` is not set, local development uses `dev-secret`. If `BLOB_READ_WRITE_TOKEN` is not set, local development stores the latest upload in `uploads/`.

## Vercel Environment

Set these environment variables in Vercel:

```text
FIT_WEBHOOK_SECRET=your-shared-secret
BLOB_READ_WRITE_TOKEN=provided-by-vercel-blob
```

Connect a private Vercel Blob store to the project so runtime uploads are persisted without exposing FIT file URLs publicly.

## Make.com Webhook

Send the Dropbox FIT file to:

```text
POST https://YOUR_VERCEL_DOMAIN/api/webhook/fit
```

Headers:

```text
x-fit-webhook-secret: YOUR_FIT_WEBHOOK_SECRET
```

Body:

- Recommended: `multipart/form-data` with a file field named `file`
- Also accepted: raw `application/octet-stream` with optional `x-filename`

Uploads are limited to 4 MB to stay within Vercel Function request limits.

## Dashboard

Visit:

```text
https://YOUR_VERCEL_DOMAIN/?key=YOUR_FIT_WEBHOOK_SECRET
```

The app stores a secure HttpOnly cookie and redirects to `/`.

The dashboard shows activity details, metrics, laps, and metrics-over-distance charts in miles.
