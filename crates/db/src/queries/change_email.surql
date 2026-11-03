BEGIN TRANSACTION;
LET $t = (DELETE account_token WHERE token_hash = $hash AND purpose = 'change_email' AND expires_at > $now RETURN BEFORE);
IF array::len($t) != 1 OR $t[0].pending_email = NONE { THROW 'invalid token'; };
UPDATE account SET email = <string>$t[0].pending_email, email_verified = true WHERE uid = $t[0].uid;
DELETE session WHERE uid = $t[0].uid;
DELETE account_token WHERE uid = $t[0].uid;
COMMIT TRANSACTION;
