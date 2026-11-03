BEGIN TRANSACTION;
IF (SELECT VALUE password_hash FROM account WHERE uid = $uid)[0] != $old { THROW 'credentials changed'; };
UPDATE account SET password_hash = $new WHERE uid = $uid;
DELETE session WHERE uid = $uid;
DELETE account_token WHERE uid = $uid;
COMMIT TRANSACTION;
