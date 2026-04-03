-- Auth user IDs are Firebase UIDs (e.g. yNmZnHVO9cQlSclMgCL05MygCKV2), not PostgreSQL UUIDs.
ALTER TABLE embedding_datasets
  ALTER COLUMN created_by TYPE TEXT USING created_by::text;
