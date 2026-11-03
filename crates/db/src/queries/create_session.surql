BEGIN TRANSACTION;
IF (SELECT VALUE password_hash FROM account WHERE uid = $uid)[0] != $password_hash {
    THROW 'credentials changed';
};
CREATE session SET token_hash = $hash, uid = $uid, expires_at = $expiry, sid = $sid, created_at = $now, device = $device;
COMMIT TRANSACTION;
