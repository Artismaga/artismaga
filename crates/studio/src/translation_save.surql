BEGIN TRANSACTION;
LET $w=(SELECT * FROM work WHERE uid=$work)[0];
IF $w=NONE OR $w.revision!=$work_revision {THROW 'source changed';};
LET $own=$admin OR $w.owner=$actor;
LET $grant=(SELECT * FROM work_translation_access WHERE work=$work AND uid=$actor AND locale=$locale)[0];
IF !$own AND (($approve AND !$grant.can_approve) OR (!$approve AND !$grant.can_draft)) {THROW 'access revoked';};
-- Serialize source edits, access revocations and approvals on the parent work.
UPDATE work SET revision=revision+1 WHERE uid=$work;
LET $old=(SELECT * FROM work_translation WHERE work=$work AND scope=$scope AND locale=$locale)[0];
IF ($old.revision ?? 0)!=$revision {THROW 'translation changed';};
IF $approve AND ($old=NONE OR $old.value.draft=NULL OR $old.value.source_hash!=$hash OR $old.value.draft!=$fields) {THROW 'save and review draft first';};
UPSERT type::record('work_translation',$key) SET work=$work,scope=$scope,locale=$locale,revision=$revision+1,
 value={source_hash:$hash,live_source_hash:IF $approve {$hash} ELSE {$old.value.live_source_hash ?? NULL},draft:IF $approve {NULL} ELSE {$fields},live:IF $approve {$fields} ELSE {$old.value.live ?? NULL},author:IF $approve {$old.value.author} ELSE {$actor},approver:IF $approve {$actor} ELSE {$old.value.approver ?? NULL}};
COMMIT TRANSACTION;
