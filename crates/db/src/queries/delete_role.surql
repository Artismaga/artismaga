BEGIN TRANSACTION;
UPDATE site_settings:main SET membership_revision = (membership_revision ?? 0) + 1;
IF $key IN ['administrator','reader','author'] { THROW 'protected role'; };
IF array::len(SELECT uid FROM account WHERE group_key=$key) > 0 OR (SELECT VALUE default_group FROM site_settings:main)[0] = $key { THROW 'role in use'; };
IF ((SELECT VALUE revision FROM permission_group WHERE key=$key)[0] ?? -1) != $revision { THROW 'role changed'; };
DELETE permission_group WHERE key=$key;
COMMIT TRANSACTION;
