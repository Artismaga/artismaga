BEGIN TRANSACTION;
LET $w=(SELECT * FROM work WHERE uid=$work)[0];
LET $details=(SELECT * FROM work_details WHERE work=$work)[0];
LET $draft=(SELECT * FROM chapter_draft WHERE work=$work AND chapter=$chapter)[0];
LET $public=(SELECT VALUE value FROM work_publication WHERE work=$work)[0];
IF $w=NONE OR $w.revision!=$work_revision OR $details.revision!=$details_revision OR $draft.revision!=$revision {THROW 'chapter changed';};
IF !$admin AND $w.owner!=$actor {THROW 'access revoked';};
IF array::len($details.value.nodes[WHERE uid=$chapter AND kind='chapter' AND delete_after=NULL])!=1 {THROW 'chapter unavailable';};
LET $prior=(SELECT VALUE value FROM chapter_publication WHERE work=$work AND chapter=$chapter)[0];
LET $released=$prior.released_at ?? $now;
UPSERT type::record('chapter_publication',[$work,$chapter]) SET work=$work,chapter=$chapter,value={document:$draft.value.document,language:$draft.value.language,revision:$revision,released_at:$released,updated_at:$now};
LET $dates=object::extend($public.chapter_dates ?? {},object::from_entries([[$chapter,{body_revision:$revision,released_at:$released,updated_at:$now}]]));
-- Keep public chapter metadata/disclosures consistent with the explicit body release.
-- Cover/group changes remain part of full story publication, with its artwork transaction.
-- When a story is already public, append newly released chapters with their groups.
IF $public!=NONE {
 FOR $asset IN (IF $node.cover!=NULL {[$node.cover]} ELSE {[]}) { IF array::len(SELECT uid FROM media_asset WHERE uid=$asset)!=1 {THROW 'artwork unavailable';}; UPDATE media_asset SET purpose=purpose WHERE uid=$asset; };
 LET $nodes=array::concat($details.value.nodes[WHERE kind!='chapter' AND delete_after=NULL],$public.details.nodes[WHERE kind='chapter' AND uid!=$chapter],[$node]);
 UPDATE work_publication SET value.details.nodes=$nodes WHERE work=$work;
 UPDATE work_publication SET value.chapter_dates=$dates,value.details.nodes=value.details.nodes.map(|$n| IF $n.uid=$chapter { object::extend($n,{title:$node.title,synopsis:$node.synopsis,disclosures:$node.disclosures}) } ELSE {$n}),value.updated_at=$now,value.latest_chapter_release=math::max([$public.latest_chapter_release,$released]) WHERE work=$work;
};
UPDATE work SET revision+=1 WHERE uid=$work;
COMMIT TRANSACTION;
