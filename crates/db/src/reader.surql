-- Additive reader/public manuscript tables. No direct record access.
DEFINE TABLE IF NOT EXISTS chapter_publication SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS work ON chapter_publication TYPE string;
DEFINE FIELD IF NOT EXISTS chapter ON chapter_publication TYPE string;
DEFINE FIELD IF NOT EXISTS value ON chapter_publication TYPE object FLEXIBLE;
DEFINE INDEX IF NOT EXISTS public_chapter_identity ON chapter_publication FIELDS work,chapter UNIQUE;
DEFINE TABLE IF NOT EXISTS reader_state SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS account ON reader_state TYPE string;
DEFINE FIELD IF NOT EXISTS work ON reader_state TYPE string;
DEFINE FIELD IF NOT EXISTS chapter ON reader_state TYPE string;
DEFINE FIELD IF NOT EXISTS value ON reader_state TYPE object FLEXIBLE;
DEFINE INDEX IF NOT EXISTS reader_identity ON reader_state FIELDS account,work,chapter UNIQUE;
DEFINE TABLE IF NOT EXISTS reaction_configuration SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS revision ON reaction_configuration TYPE int;
DEFINE FIELD IF NOT EXISTS value ON reaction_configuration TYPE object FLEXIBLE;
