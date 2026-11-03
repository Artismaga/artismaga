BEGIN TRANSACTION;
LET $t = (DELETE account_token WHERE token_hash = $hash AND purpose = 'reset' AND expires_at > $now RETURN BEFORE);
IF array::len($t) != 1 {
    THROW 'invalid token';
};
UPDATE account SET password_hash = $password WHERE uid = $t[0].uid;
DELETE session WHERE uid = $t[0].uid;
DELETE account_token WHERE uid = $t[0].uid;
COMMIT TRANSACTION;
