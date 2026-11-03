BEGIN TRANSACTION;
IF array::len(SELECT id FROM work_publication WHERE work=$work)=0 OR array::len(SELECT id FROM chapter_publication WHERE work=$work AND chapter=$chapter)=0 {THROW 'chapter unavailable';};
LET $prior=(SELECT * FROM chapter_visit WHERE work=$work AND chapter=$chapter AND viewer=$viewer AND day=$day)[0];
LET $view=IF $prior=NONE {1} ELSE {0};
LET $completion=IF $complete AND !($prior.completed ?? false) {1} ELSE {0};
UPSERT type::record('chapter_visit',[$work,$chapter,$viewer,$day]) SET work=$work,chapter=$chapter,viewer=$viewer,day=$day,completed=$complete OR ($prior.completed ?? false);
UPSERT type::record('chapter_metrics',[$work,$chapter,$day]) SET work=$work,chapter=$chapter,day=$day,views=(views ?? 0)+$view,completions=(completions ?? 0)+$completion;
COMMIT TRANSACTION;
