BEGIN TRANSACTION;
LET $old=(SELECT * FROM work_details WHERE work=$work)[0];
IF $old.revision=$revision {
    FOR $node IN $old.value.nodes {
        IF $node.delete_after!=NULL AND $node.delete_after<=$now AND $node.cover!=NULL {
            UPSERT type::record('chapter_cover_retirement',$node.cover) SET uid=$node.cover;
        };
    };
LET $public_chapters=(SELECT VALUE value.details.nodes[WHERE kind='chapter'].uid FROM work_publication WHERE work=$work)[0] ?? [];
DELETE chapter_publication WHERE work=$work AND chapter NOT IN $value.nodes[WHERE kind='chapter'].uid AND chapter NOT IN $public_chapters;
DELETE chapter_draft WHERE work=$work AND chapter NOT IN $value.nodes[WHERE kind='chapter'].uid;
DELETE chapter_revision WHERE work=$work AND chapter NOT IN $value.nodes[WHERE kind='chapter'].uid;
    UPDATE work_details SET value=$value,revision=revision+1 WHERE work=$work;
};
COMMIT TRANSACTION;
