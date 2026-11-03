BEGIN TRANSACTION;
LET $w=(SELECT * FROM work WHERE uid=$uid)[0];
IF $w=NONE OR $w.revision!=$revision {THROW 'draft changed';};
IF !$admin AND $w.owner!=$actor {THROW 'access revoked';};
LET $old=(SELECT VALUE value FROM work_publication WHERE work=$uid)[0];
FOR $node IN ($old.details.nodes ?? []) {
    IF $node.cover!=NULL {UPSERT type::record('chapter_cover_retirement',$node.cover) SET uid=$node.cover;};
};
DELETE work_publication WHERE work=$uid;
UPDATE work SET revision+=1 WHERE uid=$uid;
COMMIT TRANSACTION;
