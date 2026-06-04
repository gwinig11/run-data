CREATE TABLE IF NOT EXISTS runs (
  id text PRIMARY KEY,
  file_hash text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'webhook',
  filename text NOT NULL,
  content_type text NOT NULL,
  file_size integer NOT NULL,
  raw_storage text NOT NULL DEFAULT 'vercel-blob',
  raw_blob_path text NOT NULL,
  uploaded_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  activity_type text,
  activity_date text,
  distance_miles numeric,
  duration_text text,
  avg_pace text,
  avg_heart_rate integer,
  summary_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runs_uploaded_at_idx ON runs (uploaded_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS runs_activity_date_idx ON runs (activity_date DESC);
