BEGIN TRANSACTION;
LET $actor=(SELECT * FROM account WHERE uid=$account)[0];
IF $actor=NONE { THROW 'account unavailable'; };
LET $permissions=(SELECT VALUE permissions FROM permission_group WHERE key=$actor.group_key)[0] ?? [];
LET $manager='administer' IN $permissions OR ($actor.email_verified AND 'manage_comments' IN $permissions);
LET $can_comment=$actor.email_verified AND 'comment' IN $permissions;
IF !$can_comment AND $action NOT IN ['delete','mute'] { THROW 'permission required'; };
-- Serialize with account deletion, role changes, unpublication and chapter changes.
UPDATE account SET display_name=display_name WHERE uid=$account;
UPDATE permission_group SET revision=revision ?? 0 WHERE key=$actor.group_key;
IF array::len(SELECT id FROM work_publication WHERE work=$work)=0 OR array::len(SELECT id FROM chapter_publication WHERE work=$work AND chapter=$chapter)=0 { THROW 'chapter unavailable'; };
UPDATE work SET revision=revision WHERE uid=$work;
IF $action='create' {
 IF array::len(SELECT id FROM chapter_comment WHERE work=$work AND chapter=$chapter)>=500 { THROW 'discussion limit'; };
 LET $parent_row=(SELECT * FROM chapter_comment WHERE uid=$parent AND work=$work AND chapter=$chapter)[0];
 IF $parent!=NULL AND ($parent_row=NONE OR $parent_row.deleted) { THROW 'reply unavailable'; };
 IF $parent!=NULL { UPDATE chapter_comment SET revision=revision WHERE uid=$parent; };
 IF $gif!=NULL AND array::len(SELECT id FROM comment_gif WHERE uid=$gif)=0 { THROW 'gif unavailable'; };
 CREATE chapter_comment SET uid=$new_uid,work=$work,chapter=$chapter,account=$account,parent=$parent ?? NONE,body=$body,gif=$gif ?? NONE,created_at=$now,revision=1,deleted=false;
 LET $author=(SELECT VALUE value.author FROM work_publication WHERE work=$work)[0];
 IF $parent!=NULL AND $parent_row.account!=$account AND $parent_row.account!='' AND array::len(SELECT id FROM comment_mute WHERE account=$parent_row.account AND target=$account)=0 {
 CREATE notification SET uid=$notification,account=$parent_row.account,work=$work,chapter=$chapter,comment=$new_uid,kind='reply',created_at=$now,read=false;
 };
 IF $author!=$account AND ($parent=NULL OR $parent_row.account!=$author) AND array::len(SELECT id FROM comment_mute WHERE account=$author AND target=$account)=0 {
 CREATE notification SET uid=$author_notification,account=$author,work=$work,chapter=$chapter,comment=$new_uid,kind='comment',created_at=$now,read=false;
 };
} ELSE {
 LET $comment=(SELECT * FROM chapter_comment WHERE uid=$uid AND work=$work AND chapter=$chapter)[0];
 IF $comment=NONE OR $comment.deleted { THROW 'comment unavailable'; };
 IF $action='edit' OR $action='delete' {
  IF $comment.account!=$account AND !($manager AND $action='delete') { THROW 'ownership required'; };
  IF $comment.revision!=$revision { THROW 'comment changed'; };
  IF $action='delete' {
   UPDATE chapter_comment SET deleted=true,body='',gif=NONE,revision+=1 WHERE uid=$uid;
   DELETE notification WHERE comment=$uid;
  } ELSE {
   IF $gif!=NULL AND array::len(SELECT id FROM comment_gif WHERE uid=$gif)=0 { THROW 'gif unavailable'; };
   UPDATE chapter_comment SET body=$body,gif=$gif ?? NONE,revision+=1 WHERE uid=$uid;
  };
 } ELSE IF $action='like' {
  UPDATE chapter_comment SET revision+=1 WHERE uid=$uid;
  IF array::len(SELECT id FROM comment_like WHERE comment=$uid AND account=$account)>0 { DELETE comment_like WHERE comment=$uid AND account=$account; }
  ELSE { CREATE comment_like SET comment=$uid,account=$account; };
 } ELSE IF $action='mute' {
  IF $comment.account=$account { THROW 'cannot mute self'; };
  UPSERT type::record('comment_mute',[$account,$comment.account]) SET account=$account,target=$comment.account;
  DELETE notification WHERE account=$account AND comment IN (SELECT VALUE uid FROM chapter_comment WHERE account=$comment.account);
 };
};
COMMIT TRANSACTION;
