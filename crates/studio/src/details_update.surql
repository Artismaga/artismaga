BEGIN TRANSACTION;
LET $w=(SELECT * FROM work WHERE uid=$work)[0];
IF $w=NONE OR (!$admin AND $w.owner!=$actor AND array::len(SELECT uid FROM work_share WHERE work=$work AND uid=$actor AND can_edit=true)=0) {THROW 'access revoked';};
LET $old=(SELECT * FROM work_details WHERE work=$work)[0];
LET $r=$old.revision ?? 0;
IF $r!=$revision {THROW 'configuration changed';};
-- Shared row write serializes edits and collaborator revocation.
UPDATE work SET revision=revision+1,updated_at=$now WHERE uid=$work;
-- Serialize cover attachment against physical-retirement claims.
FOR $node IN $value.nodes {
    IF $node.cover!=NULL {
        IF array::len(SELECT uid FROM media_asset WHERE uid=$node.cover AND purpose='chapter_cover')!=1 {THROW 'chapter cover unavailable';};
        UPDATE media_asset SET purpose=purpose WHERE uid=$node.cover;
    };
};
FOR $node IN ($old.value.nodes ?? []) {
    IF $node.delete_after!=NULL AND $node.delete_after<=$now AND $node.cover!=NULL {
        UPSERT type::record('chapter_cover_retirement',$node.cover) SET uid=$node.cover;
    };
};
DELETE chapter_draft WHERE work=$work AND chapter NOT IN $value.nodes[WHERE kind='chapter'].uid;
DELETE chapter_revision WHERE work=$work AND chapter NOT IN $value.nodes[WHERE kind='chapter'].uid;
UPSERT type::record('work_details',$work) SET work=$work,revision=$revision+1,value=$value;
COMMIT TRANSACTION;
