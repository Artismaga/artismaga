BEGIN TRANSACTION;
IF array::len(SELECT uid FROM account WHERE uid = $uid AND password_hash = $old) != 1 { THROW 'credentials changed'; };
DELETE account_token WHERE uid = $uid AND purpose = 'change_email';
CREATE account_token SET uid = $uid, purpose = 'change_email', pending_email = $email, token_hash = $hash, expires_at = $expiry;
COMMIT TRANSACTION;
