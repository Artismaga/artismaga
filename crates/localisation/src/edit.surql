BEGIN TRANSACTION;
LET $old=(SELECT * FROM localisation_override WHERE key=$key AND locale=$locale)[0];
IF ($old.revision ?? 0)!=$revision {THROW 'translation changed';};
IF $publish AND ($old.draft=NONE OR $old.draft!=$text) {THROW 'save and review draft first';};
UPSERT ($old.id ?? type::record('localisation_override',$record)) SET key=$key,locale=$locale,revision=$revision+1,author=$actor,
 live=IF $publish {$old.draft} ELSE {$old.live},
 draft=IF $publish OR $discard {NONE} ELSE {$text};
-- Old automatically generated text must never replace a changed translation provider configuration.
COMMIT TRANSACTION;
