DEFINE TABLE IF NOT EXISTS chapter_metrics SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS work ON chapter_metrics TYPE string;
DEFINE FIELD IF NOT EXISTS chapter ON chapter_metrics TYPE string;
DEFINE FIELD IF NOT EXISTS day ON chapter_metrics TYPE int;
DEFINE FIELD IF NOT EXISTS views ON chapter_metrics TYPE int;
DEFINE FIELD IF NOT EXISTS completions ON chapter_metrics TYPE int;
DEFINE INDEX IF NOT EXISTS chapter_metrics_identity ON chapter_metrics FIELDS work,chapter,day UNIQUE;
DEFINE TABLE IF NOT EXISTS chapter_visit SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS work ON chapter_visit TYPE string;
DEFINE FIELD IF NOT EXISTS chapter ON chapter_visit TYPE string;
DEFINE FIELD IF NOT EXISTS viewer ON chapter_visit TYPE string;
DEFINE FIELD IF NOT EXISTS day ON chapter_visit TYPE int;
DEFINE FIELD IF NOT EXISTS completed ON chapter_visit TYPE bool;
DEFINE INDEX IF NOT EXISTS chapter_visit_identity ON chapter_visit FIELDS work,chapter,viewer,day UNIQUE;
DEFINE TABLE IF NOT EXISTS chapter_feedback SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS work ON chapter_feedback TYPE string;
DEFINE FIELD IF NOT EXISTS chapter ON chapter_feedback TYPE string;
DEFINE FIELD IF NOT EXISTS value ON chapter_feedback TYPE object FLEXIBLE;
DEFINE TABLE IF NOT EXISTS story_lifecycle SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS work ON story_lifecycle TYPE string;
DEFINE FIELD IF NOT EXISTS value ON story_lifecycle TYPE object FLEXIBLE;
DEFINE INDEX IF NOT EXISTS story_lifecycle_work ON story_lifecycle FIELDS work UNIQUE;
-- Seed existing feedback once, preserving real pre-upgrade reader choices.
DEFINE TABLE IF NOT EXISTS engagement_migration SCHEMALESS PERMISSIONS NONE;
BEGIN TRANSACTION;
IF array::len(SELECT id FROM engagement_migration:initial)=0 {
 FOR $row IN (SELECT work,chapter FROM reader_state GROUP BY work,chapter) {
  LET $states=(SELECT VALUE value FROM reader_state WHERE work=$row.work AND chapter=$row.chapter);
  LET $ratings=$states[WHERE rating!=NULL];
  LET $ids=array::distinct(array::flatten($states.reactions));
  LET $reactions=object::from_entries($ids.map(|$id|[$id,array::len($states[WHERE $id IN reactions])]));
  UPSERT type::record('chapter_feedback',[$row.work,$row.chapter]) SET work=$row.work,chapter=$row.chapter,value={ratings:array::len($ratings),rating_sum:math::sum($ratings.rating),reactions:$reactions};
 };
 CREATE engagement_migration:initial;
};
COMMIT TRANSACTION;
