BEGIN TRANSACTION;
-- Shared write closes count-based last-administrator write-skew races.
UPDATE site_settings:main SET membership_revision = (membership_revision ?? 0) + 1;
IF array::len(SELECT key FROM permission_group WHERE key = $group) != 1 {
    THROW 'unknown group';
};
IF array::len(SELECT uid FROM account WHERE uid = $uid) != 1 {
    THROW 'unknown account';
};
IF $group != 'administrator' AND (SELECT VALUE group_key FROM account WHERE uid = $uid)[0] = 'administrator' AND array::len(SELECT uid FROM account WHERE group_key = 'administrator') <= 1 { THROW 'last administrator'; };
UPDATE account SET group_key = $group WHERE uid = $uid;
COMMIT TRANSACTION;
