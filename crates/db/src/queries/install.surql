BEGIN TRANSACTION;
IF record::exists(installation:main) OR array::len(SELECT uid FROM account WHERE group_key = 'administrator') > 0 {
    THROW 'installation already claimed';
};
CREATE account CONTENT {
    uid: $account.uid,
    email: $account.email,
    display_name: <string>$account.display_name,
    password_hash: $account.password_hash,
    group_key: 'administrator',
    email_verified: true
};
UPDATE site_settings:main SET signup_mode = $mode;
CREATE installation:main SET completed = true;
COMMIT TRANSACTION;
