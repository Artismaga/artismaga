BEGIN TRANSACTION;
IF array::len(SELECT uid FROM account WHERE group_key = 'administrator') > 0 {
    THROW 'administrator already exists';
};
CREATE account CONTENT {
    uid: $account.uid, email: $account.email, display_name: <string>$account.display_name, password_hash: $account.password_hash, group_key: $account.group_key, email_verified: $account.email_verified
};
COMMIT TRANSACTION;
