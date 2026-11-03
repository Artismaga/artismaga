BEGIN TRANSACTION;
LET $w=(SELECT * FROM work WHERE uid=$work)[0];
IF $w=NONE OR (!$admin AND $w.owner!=$actor AND array::len(SELECT uid FROM work_share WHERE work=$work AND uid=$actor AND can_edit=true)=0) {THROW 'access revoked';};
LET $details=(SELECT * FROM work_details WHERE work=$work)[0];
IF array::len($details.value.nodes[WHERE uid=$chapter AND kind='chapter' AND delete_after=NULL])!=1 {THROW 'chapter unavailable';};
LET $old=(SELECT * FROM chapter_draft WHERE work=$work AND chapter=$chapter)[0];
IF ($old.revision ?? 0)!=$revision {THROW 'draft changed';};
-- Shared write serializes saving against archive, deletion and collaborator revocation.
UPDATE work SET revision=revision+1,updated_at=$now WHERE uid=$work;
IF $reason='restore' AND $old!=NONE AND array::len(SELECT id FROM chapter_revision WHERE work=$work AND chapter=$chapter AND revision=$old.revision)=0 {
    CREATE chapter_revision SET work=$work,chapter=$chapter,revision=$old.revision,value=$old.value,updated_at=$old.updated_at,updated_by=$old.updated_by,author_name=$old.author_name,reason='before_restore';
};
LET $checkpoint=$reason!='autosave' OR $old=NONE OR $now-($old.checkpoint_at ?? 0)>=300;
UPSERT type::record('chapter_draft',$key) SET work=$work,chapter=$chapter,revision=$revision+1,value=$value,updated_at=$now,updated_by=$actor,author_name=$author,checkpoint_at=IF $checkpoint {$now} ELSE {$old.checkpoint_at};
IF $checkpoint {
    CREATE chapter_revision SET work=$work,chapter=$chapter,revision=$revision+1,value=$value,updated_at=$now,updated_by=$actor,author_name=$author,reason=$reason;
};
COMMIT TRANSACTION;
