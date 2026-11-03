BEGIN TRANSACTION;
LET $current = (SELECT VALUE revision FROM account_preferences WHERE uid = $uid)[0] ?? 0;
IF $current != $revision { THROW 'settings changed'; };
IF array::len(SELECT uid FROM account WHERE uid = $uid) != 1 { THROW 'account missing'; };
UPSERT type::record('account_preferences', $uid) SET uid = $uid, revision = $revision + 1, value = $value;
COMMIT TRANSACTION;
