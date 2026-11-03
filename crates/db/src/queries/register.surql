BEGIN TRANSACTION;
LET $mode = (SELECT VALUE signup_mode FROM site_settings:main)[0];
IF $mode NOT IN ['open', 'invitation'] {
    THROW 'signup disabled';
};
IF $mode = 'invitation' {
    LET $inv = (UPDATE invitation SET used = true WHERE token_hash = $invite AND used = false AND expires_at > $now RETURN AFTER);
IF array::len($inv) != 1 {
    THROW 'invalid invitation';
};
};
LET $group = (SELECT VALUE default_group FROM site_settings:main)[0] ?? 'reader';
IF $group='administrator' OR array::len(SELECT key FROM permission_group WHERE key=$group AND 'administer' NOT IN permissions) != 1 { THROW 'invalid registration group'; };
CREATE account CONTENT {
    uid: $account.uid, email: $account.email, display_name: <string>$account.display_name, password_hash: $account.password_hash, group_key: $group, email_verified: $account.email_verified
};
COMMIT TRANSACTION;
