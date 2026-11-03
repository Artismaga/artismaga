BEGIN TRANSACTION;
LET $t = (DELETE account_token WHERE token_hash = $hash AND purpose = 'verify' AND expires_at > $now RETURN BEFORE);
IF array::len($t) != 1 {
    THROW 'invalid token';
};
UPDATE account SET email_verified = true WHERE uid = $t[0].uid;
COMMIT TRANSACTION;
