BEGIN TRANSACTION;
UPDATE site_settings:main SET membership_revision = (membership_revision ?? 0) + 1;
LET $record = (SELECT * FROM permission_group WHERE key = $key)[0];
IF $create AND $record != NONE { THROW 'role exists'; };
IF !$create AND ($record = NONE OR ($record.revision ?? 0) != $revision) { THROW 'role changed'; };
IF $key = 'administrator' OR 'administer' IN $permissions { THROW 'protected role'; };
UPSERT type::record('permission_group',$key) SET key=$key, name=$name, permissions=$permissions, revision=$revision+1;
COMMIT TRANSACTION;
