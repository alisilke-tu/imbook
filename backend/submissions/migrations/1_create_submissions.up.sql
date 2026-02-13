CREATE TABLE submissions (
  id BIGSERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_submissions_submitted_at ON submissions(submitted_at DESC);
