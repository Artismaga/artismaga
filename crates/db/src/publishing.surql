-- Public metadata snapshots are separate from private drafts and manuscripts.
DEFINE TABLE IF NOT EXISTS work_publication SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS work ON work_publication TYPE string;
DEFINE FIELD IF NOT EXISTS value ON work_publication TYPE object FLEXIBLE;
DEFINE INDEX IF NOT EXISTS publication_work ON work_publication FIELDS work UNIQUE;
