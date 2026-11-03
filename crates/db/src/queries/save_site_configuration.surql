BEGIN TRANSACTION;
LET $current = (SELECT VALUE revision FROM site_configuration:main)[0] ?? 0;
IF $current != $revision { THROW 'settings changed'; };
IF $group='administrator' OR array::len(SELECT key FROM permission_group WHERE key=$group AND 'administer' NOT IN permissions) != 1 { THROW 'invalid default role'; };
UPSERT site_configuration:main SET revision = $revision + 1, value = $value;
UPDATE site_settings:main SET signup_mode = $mode, default_group = $group;
COMMIT TRANSACTION;
