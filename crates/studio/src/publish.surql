BEGIN TRANSACTION;
LET $w=(SELECT * FROM work WHERE uid=$uid)[0];
LET $d=(SELECT * FROM work_details WHERE work=$uid)[0];
IF $w=NONE OR $w.revision!=$revision OR $d=NONE OR $d.revision!=$details_revision {THROW 'draft changed';};
IF !$admin AND $w.owner!=$actor {THROW 'access revoked';};
-- Serialize public attachment with retirement/account-deletion claims.
FOR $asset IN array::distinct(array::concat([$snapshot.cover,$snapshot.hero],$snapshot.details.nodes[WHERE cover!=NULL].cover)) {
    IF array::len(SELECT uid FROM media_asset WHERE uid=$asset)!=1 {THROW 'artwork unavailable';};
    UPDATE media_asset SET purpose=purpose WHERE uid=$asset;
};
LET $old=(SELECT VALUE value FROM work_publication WHERE work=$uid)[0];
FOR $node IN ($old.details.nodes ?? []) {
    IF $node.cover!=NULL {UPSERT type::record('chapter_cover_retirement',$node.cover) SET uid=$node.cover;};
};
DELETE chapter_publication WHERE work=$uid AND chapter NOT IN $snapshot.details.nodes[WHERE kind='chapter'].uid;
-- Only explicit chapter releases may enter a public catalogue.
IF array::len($snapshot.details.nodes[WHERE kind='chapter'])=0 {THROW 'publish a chapter first';};
FOR $node IN $snapshot.details.nodes[WHERE kind='chapter'] {
 IF array::len(SELECT id FROM chapter_publication WHERE work=$uid AND chapter=$node.uid)=0 {THROW 'chapter release changed';};
};
LET $value=object::extend($snapshot,{first_published:$old.first_published ?? $now,featured:$old.featured ?? false});
UPSERT type::record('work_publication',$uid) SET work=$uid,value=$value;
UPDATE work SET revision+=1 WHERE uid=$uid;
COMMIT TRANSACTION;
