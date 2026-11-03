BEGIN TRANSACTION;
LET $workrow=(SELECT * FROM work WHERE uid=$work)[0];
IF $workrow=NONE OR (!$admin AND $workrow.owner!=$actor) {THROW 'access revoked';};
LET $old=(SELECT VALUE value FROM story_lifecycle WHERE work=$work)[0];
IF ($old.revision ?? 0)!=$revision {THROW 'status changed';};
UPSERT type::record('story_lifecycle',$work) SET work=$work,value=object::extend($value,{revision:$revision+1});
UPDATE work_publication SET value.status=$value.status,value.hiatus_until=$value.hiatus_until,value.completed_at=IF $value.status='completed' {value.completed_at ?? $now} ELSE {NULL},value.updated_at=$now WHERE work=$work;
UPDATE work SET revision+=1 WHERE uid=$work;
COMMIT TRANSACTION;
