BEGIN TRANSACTION;
IF array::len(SELECT id FROM work_publication WHERE work=$work)=0 OR array::len(SELECT id FROM chapter_publication WHERE work=$work AND chapter=$chapter)=0 {THROW 'chapter unavailable';};
IF array::len(SELECT uid FROM account WHERE uid=$account)=0 {THROW 'account unavailable';};
-- Serialize state creation with deletion of this account.
UPDATE account SET display_name=display_name WHERE uid=$account;
LET $old=(SELECT VALUE value FROM reader_state WHERE account=$account AND work=$work AND chapter=$chapter)[0];
IF ($old.revision ?? 0)!=$revision {THROW 'reading state changed';};
LET $feedback=(SELECT VALUE value FROM chapter_feedback WHERE work=$work AND chapter=$chapter)[0];
LET $old_rating=$old.rating ?? NULL;
LET $ratings=($feedback.ratings ?? 0) + IF $value.rating!=NULL AND $old_rating=NULL {1} ELSE IF $value.rating=NULL AND $old_rating!=NULL {-1} ELSE {0};
LET $sum=($feedback.rating_sum ?? 0)+($value.rating ?? 0)-($old.rating ?? 0);
LET $ids=array::distinct(array::concat($value.reactions,$old.reactions ?? []));
LET $reactions=object::from_entries($ids.map(|$id| [$id, ($feedback.reactions[$id] ?? 0)+ IF $id IN $value.reactions AND $id NOT IN ($old.reactions ?? []) {1} ELSE IF $id NOT IN $value.reactions AND $id IN ($old.reactions ?? []) {-1} ELSE {0}]));
UPSERT type::record('chapter_feedback',[$work,$chapter]) SET work=$work,chapter=$chapter,value={ratings:$ratings,rating_sum:$sum,reactions:object::extend($feedback.reactions ?? {},$reactions)};
UPSERT type::record('reader_state',[$account,$work,$chapter]) SET account=$account,work=$work,chapter=$chapter,value=$value;
COMMIT TRANSACTION;
