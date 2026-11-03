-- Additive chapter/metadata/taxonomy documents; updates use revisioned transactions.
DEFINE TABLE IF NOT EXISTS work_details SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS work ON work_details TYPE string;
DEFINE FIELD IF NOT EXISTS revision ON work_details TYPE int;
DEFINE FIELD IF NOT EXISTS value ON work_details TYPE object FLEXIBLE;
DEFINE INDEX IF NOT EXISTS work_details_work ON work_details FIELDS work UNIQUE;
DEFINE TABLE IF NOT EXISTS taxonomy SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS revision ON taxonomy TYPE int;
DEFINE FIELD IF NOT EXISTS value ON taxonomy TYPE object FLEXIBLE;
DEFINE TABLE IF NOT EXISTS chapter_cover_retirement SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS uid ON chapter_cover_retirement TYPE string;
