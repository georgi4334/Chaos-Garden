-- The ingest service owns its own database on the same Postgres server.
-- Runs only when the data volume is first created.
CREATE DATABASE chaos_ingest OWNER chaos;
