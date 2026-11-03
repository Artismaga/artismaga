BEGIN TRANSACTION;
LET $w=(SELECT * FROM work WHERE uid=$work)[0];
IF $w=NONE OR (!$admin AND $w.owner!=$actor) {THROW 'access revoked';};
UPDATE work SET revision=revision+1 WHERE uid=$work;
FOR $recipient IN $recipients {
 IF array::len(SELECT uid FROM account WHERE uid=$recipient)!=1 {THROW 'recipient unavailable';};
 LET $key=crypto::sha256(string::concat($work,':',$locale,':',$recipient));
 IF $remove {DELETE work_translation_access WHERE work=$work AND locale=$locale AND uid=$recipient;
  IF array::len(SELECT uid FROM work_translation_access WHERE work=$work AND uid=$recipient)=0 {DELETE work_share WHERE work=$work AND uid=$recipient AND translation_only=true;};}
 ELSE {
  UPSERT type::record('work_translation_access',$key) SET work=$work,uid=$recipient,locale=$locale,can_draft=$can_draft,can_approve=$can_approve;
  IF $recipient!=$w.owner AND array::len(SELECT uid FROM work_share WHERE work=$work AND uid=$recipient)=0 {CREATE work_share SET work=$work,uid=$recipient,can_edit=false,translation_only=true;};
 };
};
COMMIT TRANSACTION;
