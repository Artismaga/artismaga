BEGIN TRANSACTION;
LET $current=(SELECT VALUE revision FROM storage_state:main)[0] ?? 0;
IF $current != $revision { THROW 'storage changed'; };
UPSERT type::record('storage_provider',$uid) SET uid=$uid,value=$value;
UPSERT storage_state:main SET active=$uid,revision=$revision+1;
COMMIT TRANSACTION;
