import { Tooltip } from '@mantine/core';
import { postJson, errorMessage } from '../../client/api.js';
import { useFeedback } from '../../components/Feedback.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { SelectionHighlights, searchKey } from '../../editor/selection.js';
import { EditorDock } from '../../editor/EditorDock.js';
import { InlineTitle } from '../../editor/InlineTitle.js';
import type { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { z } from 'zod';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  NativeSelect,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
  IconBlockquote,
  IconLink,
  IconSeparator,
  IconHistory,
  IconNote,
  IconDeviceFloppy,
} from '@tabler/icons-react';
import type { PageProps } from '../../shared/contracts.js';
import { writingPageSchema, draftSchema, richNodeSchema, safeLink } from '../../shared/writing.js';
import type { AuthorNote, Draft, Manuscript } from '../../shared/writing.js';
import { useI18n } from '../../localisation/index.js';
import { RichDocument, wordCount } from '../../editor/document.js';
import { useDraft } from '../../editor/useDraft.js';
import { recoveryKey } from '../../editor/recovery.js';
import { cleanPaste } from '../../editor/paste.js';
import { writingChecks } from '../../editor/checks.js';
import { FindReplace } from '../../editor/FindReplace.js';
import { ChapterNote, PassageNotes, PassageNoteDialog } from '../../editor/AuthorNotes.js';
import { RevisionHistory, RevisionComparison } from '../../editor/RevisionHistory.js';
const selectionMenuOptions = { placement: 'top' as const, offset: 10 };
export function ChapterEditor(props: PageProps) {
  const page = props.studio?.editor;
  const work = props.studio?.work?.work;
  if (!page || !work || !props.user) return null;
  return (
    <Writer
      key={page.chapter.uid}
      initial={page}
      workUid={work.uid}
      workTitle={work.title}
      userUid={props.user.uid}
      canPublish={
        props.permissions.includes('publish_story') && (props.studio?.work?.can_share ?? false)
      }
    />
  );
}
function Writer({
  initial,
  workUid,
  workTitle,
  userUid,
  canPublish,
}: {
  initial: z.infer<typeof writingPageSchema>;
  workUid: string;
  workTitle: string;
  userUid: string;
  canPublish: boolean;
}) {
  const { t, date } = useI18n();
  const base = `/api/studio/works/${encodeURIComponent(workUid)}/chapters/${encodeURIComponent(initial.chapter.uid)}`;
  const draft = useDraft(
    initial.draft,
    base + '/draft',
    recoveryKey(userUid, workUid, initial.chapter.uid),
    initial.can_edit,
  );
  const current = draft.current;
  const suppress = useRef(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [checks, setChecks] = useState(false);
  const [chapterNote, setChapterNote] = useState(false);
  const [note, setNote] = useState<AuthorNote | null>(null);
  const [find, setFind] = useState(false);
  const [history, setHistory] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [spellcheck, setSpellcheck] = useState(true);
  const [latest, setLatest] = useState<Draft | null>(null);
  const [, setError] = useFeedback('error');
  const [, published] = useFeedback('success');
  const [publishing, setPublishing] = useState(false);
  const saveAction = useRef(() => void draft.save());
  saveAction.current = () => void draft.save();
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable: initial.can_edit,
    extensions: [
      SelectionHighlights,
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        link: {
          openOnClick: false,
          defaultProtocol: 'https',
          isAllowedUri: (uri) => safeLink(uri),
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
    ],
    content: initial.draft.value.document,
    editorProps: {
      attributes: {
        class: 'chapter-prose',
        'aria-label': t('editor.manuscript'),
        'aria-multiline': 'true',
        role: 'textbox',
        lang: initial.draft.value.language,
        spellcheck: 'true',
      },
      transformPastedHTML: cleanPaste,
      transformPastedText: (text) =>
        text
          .replace(/\r\n?/g, '\n')
          .replace(/\u00a0/g, ' ')
          .replace(/\ufeff/g, ''),
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          saveAction.current();
          return true;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          setSearch(true);
          return true;
        }
        return false;
      },
    },
    onTransaction: ({ editor, transaction }) => {
      if (!transaction.docChanged || suppress.current || !initial.can_edit) return;
      const notes = current.current.notes.map((note) => {
        if (!note.anchor) return note;
        const from = transaction.mapping.mapResult(note.anchor.from, 1);
        const to = transaction.mapping.mapResult(note.anchor.to, -1);
        return {
          ...note,
          anchor: {
            ...note.anchor,
            from: Math.min(from.pos, to.pos),
            to: Math.max(from.pos, to.pos),
            detached:
              note.anchor.detached ||
              (from.deletedAcross && to.deletedAcross) ||
              from.pos >= to.pos,
          },
        };
      });
      draft.mutate({ ...current.current, document: richNodeSchema.parse(editor.getJSON()), notes });
    },
  });
  useEffect(() => {
    if (editor)
      editor.setOptions({
        editorProps: {
          ...editor.options.editorProps,
          attributes: {
            class: 'chapter-prose',
            'aria-label': t('editor.manuscript'),
            'aria-multiline': 'true',
            role: 'textbox',
            lang: draft.value.language,
            spellcheck: String(spellcheck),
          },
        },
      });
  }, [editor, draft.value.language, spellcheck]);
  function replaceDocument(value: Manuscript) {
    if (editor) {
      suppress.current = true;
      try {
        editor.commands.setContent(value.document, { emitUpdate: false });
      } finally {
        suppress.current = false;
      }
    }
  }
  function adopt(next: Draft) {
    replaceDocument(next.value);
    draft.adopt(next);
  }
  async function loadLatest() {
    setError('');
    try {
      const r = await fetch(base + '/draft');
      if (!r.ok) throw Error();
      setLatest(z.object({ editor: writingPageSchema }).parse(await r.json()).editor.draft);
    } catch {
      setError('editor.error.load');
    }
  }
  async function restore(revision: number) {
    setError('');
    if (draft.dirty && !(await draft.save(true))) throw Error('editor.error.restore');
    try {
      const r = await fetch(base + '/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: draft.revision.current, source_revision: revision }),
      });
      if (!r.ok) throw Error();
      adopt(z.object({ draft: draftSchema }).parse(await r.json()).draft);
      setHistory(false);
    } catch {
      setError('editor.error.restore');
      throw Error('editor.error.restore');
    }
  }
  const issues = useMemo(
    () => writingChecks(draft.value.document, draft.value.language),
    [draft.value.document, draft.value.language],
  );
  const words = useMemo(
    () => wordCount(draft.value.document, draft.value.language),
    [draft.value.document, draft.value.language],
  );
  useEffect(() => {
    if (editor) editor.view.dispatch(editor.state.tr.setMeta(searchKey, search ? query : ''));
  }, [editor, query, search]);
  function addPassageNote() {
    if (!editor || editor.state.selection.empty || current.current.notes.length >= 100) return;
    const { from, to } = editor.state.selection;
    setNote({
      uid: crypto.randomUUID(),
      text: '',
      anchor: {
        from,
        to,
        quote: Array.from(editor.state.doc.textBetween(from, to, ' '))
          .slice(0, 500)
          .join(''),
        detached: false,
      },
    });
  }
  const showSelectionMenu = useCallback(
    ({ state }: { state: EditorState }) =>
      !state.selection.empty && !note && link === null && !find && !history,
    [note, link, find, history],
  );
  const controls = [
    {
      label: t('editor.bold'),
      Icon: IconBold,
      active: editor?.isActive('bold'),
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: t('editor.italic'),
      Icon: IconItalic,
      active: editor?.isActive('italic'),
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: t('editor.bullets'),
      Icon: IconList,
      active: editor?.isActive('bulletList'),
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: t('editor.numbered'),
      Icon: IconListNumbers,
      active: editor?.isActive('orderedList'),
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      label: t('editor.quote'),
      Icon: IconBlockquote,
      active: editor?.isActive('blockquote'),
      run: () => editor?.chain().focus().toggleBlockquote().run(),
    },
    {
      label: t('editor.link'),
      Icon: IconLink,
      active: editor?.isActive('link'),
      run: () => setLink(String(editor?.getAttributes('link')['href'] ?? '')),
    },
    {
      label: t('editor.scene_break'),
      Icon: IconSeparator,
      active: false,
      run: () => editor?.chain().focus().setHorizontalRule().run(),
    },
  ];
  return (
    <Stack gap="lg" className="chapter-editor">
      <Group justify="space-between" align="start">
        <div>
          <Button
            component="a"
            href={`/studio/${workUid}/chapters`}
            variant="subtle"
            size="sm"
            leftSection={<IconArrowLeft size={16} />}
          >
            {workTitle}
          </Button>
          <InlineTitle
            title={initial.chapter.title}
            work={workUid}
            chapter={initial.chapter.uid}
            canEdit={initial.can_edit}
          />
        </div>
        <Group>
          {canPublish && (
            <Tooltip label={t('reader.publish_help')}>
              <span>
                <Button
                  loading={publishing}
                  disabled={
                    draft.dirty ||
                    draft.busy ||
                    draft.blocked ||
                    !!draft.recovery ||
                    draft.revision.current === 0
                  }

                  onClick={() => {
                    setPublishing(true);
                    void postJson(`/api/reader/${workUid}/${initial.chapter.uid}/publish`, {
                      revision: draft.revision.current,
                    })
                      .then(() => published(t('reader.published')))
                      .catch((cause) => setError(errorMessage(cause)))
                      .finally(() => setPublishing(false));
                  }}
                >
                  {t('reader.publish')}
                </Button>
              </span>
            </Tooltip>
          )}
          <Button
            variant="light"
            leftSection={<IconHistory size={17} />}
            onClick={() => setHistory(true)}
          >
            {t('editor.history.title')}
          </Button>
          <Button
            disabled={!initial.can_edit || !editor || draft.blocked || !!draft.recovery}
            loading={draft.busy}
            leftSection={<IconDeviceFloppy size={17} />}
            onClick={() => void draft.save(true)}
          >
            {t('editor.save')}
          </Button>
        </Group>
      </Group>
      <Group justify="space-between">
        <Group gap="sm">
          <Badge variant="light">{t('editor.private_draft')}</Badge>
          <Text size="sm" role="status" aria-live="polite">
            {t(draft.busy ? 'editor.saving' : draft.dirty ? 'editor.unsaved' : 'editor.saved')}
            {draft.lastSaved > 0 && !draft.dirty ? ' · ' + date(draft.lastSaved, 'datetime') : ''}
          </Text>
        </Group>
      </Group>
      {!initial.can_edit && <Alert>{t('editor.read_only')}</Alert>}
      {draft.recovery && (
        <Alert title={t('editor.recovery.title')}>
          <Stack gap="sm">
            <Text size="sm">
              {t(
                draft.recovery.base_revision === initial.draft.revision
                  ? 'editor.recovery.help'
                  : 'editor.recovery.stale',
              )}
            </Text>
            <details>
              <summary>{t('editor.recovery.compare')}</summary>
              <RevisionComparison before={initial.draft.value} after={draft.recovery.value} />
            </details>
            <Group>
              <Button
                disabled={!editor}
                onClick={() => {
                  if (draft.recovery) replaceDocument(draft.recovery.value);
                  draft.recover();
                }}
              >
                {t('editor.recovery.recover')}
              </Button>
              <Button variant="light" onClick={draft.discardRecovery}>
                {t('editor.recovery.discard')}
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}
      {draft.blocked && draft.error !== 'editor.error.invalid' && (
        <Button variant="light" onClick={() => void loadLatest()}>
          {t('editor.conflict.compare')}
        </Button>
      )}
      <div className="writing-layout">
        <PassageNotes notes={draft.value.notes} editor={editor} onOpen={setNote} />
        <Card p={0} className="writing-sheet">
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <RichDocument document={draft.value.document} />
          )}
        </Card>
        <Card className="writing-tools">
          <ChapterNote
            value={draft.value.chapter_note}
            canEdit={initial.can_edit}
            onChange={(chapter_note) => draft.mutate({ ...current.current, chapter_note })}
          />
        </Card>
      </div>
      <EditorDock
        editor={editor}
        canEdit={initial.can_edit}
        controls={controls}
        words={words}
        search={search}
        setSearch={setSearch}
        query={query}
        setQuery={setQuery}
        onReplace={() => setFind(true)}
        onChecks={() => setChecks(true)}
        onChapterNote={() => setChapterNote(true)}
      />
      {editor && initial.can_edit && (
        <BubbleMenu editor={editor} options={selectionMenuOptions} shouldShow={showSelectionMenu}>
          <Group
            gap={2}
            className="writing-selection-toolbar"
            role="toolbar"
            aria-label={t('editor.selection.toolbar')}
          >
            {controls
              .filter((_, i) => [0, 1, 5].includes(i))
              .map(({ label, Icon, active, run }) => (
                <Tooltip label={label} key={label}>
                  <Button
                    size="compact-sm"
                    aria-label={label}

                    variant={active ? 'light' : 'subtle'}
                    onClick={() => void run()}
                  >
                    <Icon size={18} />
                  </Button>
                </Tooltip>
              ))}
            <Button
              size="compact-sm"
              variant="subtle"
              leftSection={<IconNote size={17} />}
              onClick={addPassageNote}
              disabled={draft.value.notes.length >= 100}
            >
              {t('editor.notes.add_passage')}
            </Button>
          </Group>
        </BubbleMenu>
      )}
      <PassageNoteDialog
        note={note}
        canEdit={initial.can_edit}
        onClose={() => setNote(null)}
        onSave={(updated) => {
          const notes = current.current.notes.some((n) => n.uid === updated.uid)
            ? current.current.notes.map((n) =>
                n.uid === updated.uid ? { ...updated, anchor: n.anchor } : n,
              )
            : [...current.current.notes, updated];
          draft.mutate({ ...current.current, notes });
          setNote(null);
        }}
        onRemove={(uid) => {
          draft.mutate({
            ...current.current,
            notes: current.current.notes.filter((n) => n.uid !== uid),
          });
          setNote(null);
        }}
      />
      <Modal
        opened={chapterNote}
        onClose={() => setChapterNote(false)}
        title={t('editor.notes.chapter')}
      >
        <ChapterNote
          value={draft.value.chapter_note}
          canEdit={initial.can_edit}
          onChange={(chapter_note) => draft.mutate({ ...current.current, chapter_note })}
        />
      </Modal>
      <Modal opened={checks} onClose={() => setChecks(false)} title={t('editor.checks.title')}>
        <Stack>
          <NativeSelect
            label={t('editor.language')}
            value={draft.value.language}
            disabled={!initial.can_edit}
            data={[
              { value: 'en', label: 'English' },
              { value: 'ja', label: '日本語' },
              { value: 'zh', label: '简体中文' },
              { value: 'es', label: 'Español' },
              { value: 'fr', label: 'Français' },
            ]}
            onChange={(e) =>
              draft.mutate({
                ...current.current,
                language: e.currentTarget.value as Manuscript['language'],
              })
            }
          />
          <Checkbox
            label={t('editor.spellcheck')}
            checked={spellcheck}
            onChange={(e) => setSpellcheck(e.currentTarget.checked)}
          />
          <Text c="dimmed" size="sm">
            {t('editor.checks.help')}
          </Text>
          {issues.length ? (
            issues.map((issue, i) => (
              <Alert key={i} color="orange" title={t(issue.key)}>
                <Text size="sm">{issue.example}</Text>
              </Alert>
            ))
          ) : (
            <Text size="sm">{t('editor.checks.empty')}</Text>
          )}
        </Stack>
      </Modal>
      <FindReplace
        editor={editor}
        opened={find}
        onClose={() => setFind(false)}
        canEdit={initial.can_edit}
      />
      <RevisionHistory
        opened={history}
        onClose={() => setHistory(false)}
        endpoint={base}
        canEdit={initial.can_edit && !draft.blocked && !draft.busy && !draft.recovery}
        onRestore={restore}
      />
      <Modal opened={link !== null} onClose={() => setLink(null)} title={t('editor.link')}>
        <Stack>
          <TextInput
            label={t('editor.link_url')}
            value={link ?? ''}
            onChange={(e) => setLink(e.currentTarget.value)}
            maxLength={2000}
            error={link && !safeLink(link) ? t('editor.link_invalid') : undefined}
          />
          <Group>
            <Button
              disabled={!link || !safeLink(link)}
              onClick={() => {
                if (link)
                  editor?.chain().focus().extendMarkRange('link').setLink({ href: link }).run();
                setLink(null);
              }}
            >
              {t('editor.link_apply')}
            </Button>
            <Button
              variant="light"
              onClick={() => {
                editor?.chain().focus().unsetLink().run();
                setLink(null);
              }}
            >
              {t('editor.link_remove')}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={latest !== null}
        onClose={() => setLatest(null)}
        title={t('editor.conflict.title')}
        size="xl"
      >
        {latest && (
          <Stack>
            <Text>{t('editor.conflict.help')}</Text>
            <RevisionComparison before={latest.value} after={draft.value} />
            <Group>
              <Button
                onClick={() => {
                  draft.rebase(latest);
                  setLatest(null);
                }}
              >
                {t('editor.conflict.keep_mine')}
              </Button>
              <Button
                variant="light"
                onClick={() => {
                  adopt(latest);
                  setLatest(null);
                }}
              >
                {t('editor.conflict.use_latest')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
