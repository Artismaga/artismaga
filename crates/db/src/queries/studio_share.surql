BEGIN TRANSACTION;
-- Serialize collaborator removal against metadata edits using the work row.
LET $w=(SELECT * FROM work WHERE uid=$work)[0];
IF $w=NONE OR (!$admin AND $w.owner!=$actor) {THROW 'access revoked';};
UPDATE work SET revision=revision+1 WHERE uid=$work;
IF $remove {DELETE work_share WHERE work=$work AND uid=$uid;DELETE work_translation_access WHERE work=$work AND uid=$uid;} ELSE {UPSERT type::record('work_share',$key) SET work=$work,uid=$uid,can_edit=$can_edit;};
COMMIT TRANSACTION;
