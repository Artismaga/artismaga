BEGIN TRANSACTION;
LET $w=(SELECT * FROM work WHERE uid=$uid)[0];
IF $w=NONE OR $w.revision!=$revision {THROW 'work changed';};
IF !$admin AND $w.owner!=$actor AND array::len(SELECT uid FROM work_share WHERE work=$uid AND uid=$actor AND can_edit=true)=0 {THROW 'access revoked';};
IF $cover!=NULL AND $cover!=$w.cover AND array::len(SELECT uid FROM media_asset WHERE uid=$cover AND owner=$actor AND purpose='cover')!=1 {THROW 'invalid cover';};
IF $hero!=NULL AND $hero!=$w.hero AND array::len(SELECT uid FROM media_asset WHERE uid=$hero AND owner=$actor AND purpose='hero')!=1 {THROW 'invalid hero';};
UPDATE work SET title=$title,subtitle=$subtitle,synopsis=$synopsis,cover=IF $cover=NULL {NONE} ELSE {$cover},hero=IF $hero=NULL {NONE} ELSE {$hero},revision=$revision+1,updated_at=$now WHERE uid=$uid;
COMMIT TRANSACTION;
