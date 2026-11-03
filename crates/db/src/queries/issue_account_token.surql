BEGIN TRANSACTION;
DELETE account_token WHERE uid = $uid AND purpose = $purpose;
CREATE account_token SET token_hash = $hash, uid = $uid, purpose = $purpose, expires_at = $expiry;
COMMIT TRANSACTION;
