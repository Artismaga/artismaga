BEGIN TRANSACTION;
LET $w=(SELECT * FROM work WHERE uid=$work)[0];
IF $w=NONE OR (!$admin AND $w.owner!=$actor) {THROW 'access revoked';};
UPDATE work SET revision=revision+1 WHERE uid=$work;
FOR $recipient IN $recipients {
    IF array::len(SELECT uid FROM account WHERE uid=$recipient)!=1 {THROW 'recipient unavailable';};
    IF $remove {DELETE work_share WHERE work=$work AND uid=$recipient;DELETE work_translation_access WHERE work=$work AND uid=$recipient;}
    ELSE {UPSERT type::record('work_share',string::concat($work,'_',$recipient)) SET work=$work,uid=$recipient,can_edit=$can_edit,translation_only=false;};
};
COMMIT TRANSACTION;
