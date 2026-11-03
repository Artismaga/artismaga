BEGIN TRANSACTION;
IF array::len(SELECT uid FROM account WHERE uid=$owner) != 1 { THROW 'account missing'; };
CREATE work SET uid=$uid,owner=$owner,title=$title,subtitle=$subtitle,synopsis=$synopsis,work_type='book',status='draft',cover=IF $cover=NULL { NONE } ELSE {$cover},hero=IF $hero=NULL {NONE} ELSE {$hero},created_at=$now,updated_at=$now,revision=0;
COMMIT TRANSACTION;
