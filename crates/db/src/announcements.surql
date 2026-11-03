DEFINE TABLE IF NOT EXISTS announcement SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS uid ON announcement TYPE string;
DEFINE FIELD IF NOT EXISTS revision ON announcement TYPE int;
DEFINE FIELD IF NOT EXISTS value ON announcement TYPE object FLEXIBLE;
DEFINE FIELD IF NOT EXISTS creator ON announcement TYPE string;
DEFINE FIELD IF NOT EXISTS created_at ON announcement TYPE int;
DEFINE FIELD IF NOT EXISTS cancelled ON announcement TYPE bool;
DEFINE INDEX IF NOT EXISTS announcement_uid ON announcement FIELDS uid UNIQUE;
