import { Tooltip } from '@mantine/core';
import { Checkbox } from '@mantine/core';
// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { useState } from 'react';
import {
  Button,
  Text,
  TextInput,
  NumberInput,
  NativeSelect,
  Group,
  Stack,
  Card,
  Modal,
  Textarea,
  Pagination,
  Image,
  Badge,
  ActionIcon,
} from '@mantine/core';
import {
  IconGripVertical,
  IconPlus,
  IconFolderPlus,
  IconSettings,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react';
import { ArtworkInput } from '../../components/ArtworkInput.js';
import type { AssetRef } from '../../shared/studio.js';
import type { ChapterNode, Details, DetailsCommand } from '../../shared/creative.js';
export type ChangeDetails = (command: DetailsCommand) => Promise<boolean>;
const PAGE_SIZE = 25;
export function orderedChapters(nodes: ChapterNode[], parent: string | null = null): ChapterNode[] {
  return nodes
    .filter((n) => n.parent === parent && n.delete_after === null)
    .flatMap((n) => (n.kind === 'chapter' ? [n] : orderedChapters(nodes, n.uid)));
}
export function Chapters({
  details,
  workUid,
  canEdit,
  change,
  busy,
}: {
  details: Details;
  workUid: string;
  canEdit: boolean;
  change: ChangeDetails;
  busy: boolean;
}) {
  const { t, date, options } = useI18n();

  const nodes = details.value.nodes;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandVersion, setExpandVersion] = useState(0);
  const [jump, setJump] = useState<string | number>(1);
  const [chapterJump, setChapterJump] = useState<string | number>(1);
  const [editing, setEditing] = useState<Partial<ChapterNode> | null>(null);
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [disclosures, setDisclosures] = useState<ChapterNode['disclosures']>([]);
  const [parent, setParent] = useState('');
  const [cover, setCover] = useState<AssetRef | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<ChapterNode | null>(null);
  const chapters = orderedChapters(nodes);
  const filtered = chapters.filter((n, i) =>
    `${i + 1} ${n.title} ${n.synopsis}`.toLowerCase().includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = new Set(
    filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((n) => n.uid),
  );
  function configure(node: Partial<ChapterNode>) {
    setEditing(node);
    setTitle(node.title ?? '');
    setSynopsis(node.synopsis ?? '');
    setDisclosures(node.disclosures ?? []);
    setParent(node.parent ?? '');
    setCover(node.cover ? { uid: node.cover, url: `/media/${node.cover}`, palette: [] } : null);
  }
  const groups = nodes.filter((n) => n.kind !== 'chapter');
  function hasVisible(node: ChapterNode): boolean {
    return (
      visible.has(node.uid) ||
      nodes.some((n) => n.parent === node.uid && n.delete_after === null && hasVisible(n)) ||
      (node.kind !== 'chapter' &&
        !search &&
        currentPage === 1 &&
        !nodes.some((n) => n.parent === node.uid && n.delete_after === null))
    );
  }
  function drop(event: React.DragEvent, node: ChapterNode) {
    event.preventDefault();
    event.stopPropagation();
    const uid = event.dataTransfer.getData('text/plain');
    const source = nodes.find((n) => n.uid === uid);
    if (busy || !canEdit || !source || source.uid === node.uid) return;
    void change({
      action: 'move',
      uid,
      parent: node.kind === 'chapter' ? node.parent : node.uid,
      before: node.kind === 'chapter' ? node.uid : null,
    });
  }
  function branch(parentId: string | null): React.ReactNode {
    return (
      <ul className="chapter-branch">
        {nodes
          .filter((n) => n.parent === parentId && n.delete_after === null && hasVisible(n))
          .map((node) =>
            node.kind === 'chapter' ? (
              <li
                key={node.uid}
                onDragOver={(e) => {
                  if (canEdit) e.preventDefault();
                }}
                onDrop={(e) => drop(e, node)}
              >
                <div className="chapter-row">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={t('chapters.drag', { title: node.title })}
                    draggable={canEdit && !busy}
                    disabled={!canEdit}
                    aria-disabled={busy}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', node.uid);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onKeyDown={(e) => {
                      if (
                        busy ||
                        !e.altKey ||
                        ![t('ui.arrowup_12204d1d'), t('ui.arrowdown_9660fb86')].includes(e.key)
                      )
                        return;
                      e.preventDefault();
                      const siblings = nodes.filter(
                        (n) =>
                          n.parent === node.parent &&
                          n.kind === 'chapter' &&
                          n.delete_after === null,
                      );
                      const at = siblings.findIndex((n) => n.uid === node.uid);
                      if (e.key === t('ui.arrowup_12204d1d') && at > 0)
                        void change({
                          action: 'move',
                          uid: node.uid,
                          parent: node.parent,
                          before: siblings[at - 1]?.uid ?? null,
                        });
                      if (e.key === t('ui.arrowdown_9660fb86') && at < siblings.length - 1)
                        void change({
                          action: 'move',
                          uid: node.uid,
                          parent: node.parent,
                          before: siblings[at + 2]?.uid ?? null,
                        });
                    }}
                  >
                    <IconGripVertical size={20} />
                  </ActionIcon>
                  {node.cover && (
                    <Image src={`/media/${node.cover}`} w={36} h={48} radius="xs" alt="" />
                  )}
                  <div className="grow">
                    <Text fw={600} size="sm">
                      {t('chapters.numbered_title', {
                        number: chapters.findIndex((c) => c.uid === node.uid) + 1,
                        title: node.title,
                      })}
                    </Text>
                    <Group gap="xs">
                      {node.disclosures.map((key) => (
                        <Badge key={key}>{t(`reader.disclosure.${key}`)}</Badge>
                      ))}
                    </Group>
                    {node.synopsis && (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {node.synopsis}
                      </Text>
                    )}
                  </div>
                  <Group gap="xs" className="chapter-actions">
                    <Tooltip label={t('ui.configure_6defafa2')}>
                      <span>
                        <ActionIcon
                          size="lg"
                          variant="light"
                          aria-label={t('ui.configure_6defafa2')}

                          disabled={!canEdit || busy}
                          onClick={() => configure(node)}
                        >
                          <IconSettings size={18} />
                        </ActionIcon>
                      </span>
                    </Tooltip>
                    <Tooltip label={t('ui.edit_464c4ffd')}>
                      <span>
                        <ActionIcon
                          size="lg"
                          variant="default"
                          component="a"
                          href={`/studio/${encodeURIComponent(workUid)}/chapters/${encodeURIComponent(node.uid)}`}
                          aria-label={t('ui.edit_464c4ffd')}

                          disabled={busy}
                        >
                          <IconPencil size={18} />
                        </ActionIcon>
                      </span>
                    </Tooltip>
                    <Tooltip label={t('ui.delete_e2d0a549')}>
                      <span>
                        <ActionIcon
                          size="lg"
                          variant="subtle"
                          color="red"
                          aria-label={t('ui.delete_e2d0a549')}

                          disabled={!canEdit || busy}
                          onClick={() => setDeleting(node)}
                        >
                          <IconTrash size={18} />
                        </ActionIcon>
                      </span>
                    </Tooltip>
                  </Group>
                </div>
              </li>
            ) : (
              <li key={node.uid}>
                <details
                  key={`${node.uid}:${currentPage}:${search}:${expandVersion}`}
                  open
                  className="chapter-group"
                >
                  <summary
                    onDragOver={(e) => {
                      if (canEdit) e.preventDefault();
                    }}
                    onDrop={(e) => drop(e, node)}
                  >
                    <span>
                      <Badge variant="light" size="xs">
                        {t(`chapters.kind.${node.kind}`)}
                      </Badge>{' '}
                      {node.title}
                    </span>
                  </summary>
                  <Group gap="xs" p="xs">
                    <Button
                      variant="subtle"
                      size="xs"
                      disabled={!canEdit || busy}
                      onClick={() => configure(node)}
                    >
                      {t(`chapters.configure.${node.kind}`)}
                    </Button>
                    <Button
                      variant="subtle"
                      size="xs"
                      color="red"
                      disabled={!canEdit || busy || nodes.some((n) => n.parent === node.uid)}
                      onClick={() => void change({ action: 'remove_group', uid: node.uid })}
                    >
                      {t('ui.remove_empty_group_fbed7ab3')}
                    </Button>
                    <Text size="xs" c="dimmed">
                      {t('ui.drop_chapters_on_the_group_heading_to_move_them__fe237127')}
                    </Text>
                  </Group>
                  {branch(node.uid)}
                </details>
              </li>
            ),
          )}
      </ul>
    );
  }
  return (
    <Stack>
      <Group align="end" className="chapter-toolbar">
        <TextInput
          className="grow"
          label={t('ui.search_chapters_76bbe42a')}
          placeholder={t('ui.title_synopsis_or_chapter_number_8dc2de85')}
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Group gap="xs" align="end">
          <NumberInput
            label={t('ui.page_0a30a815')}
            value={jump}
            onChange={setJump}
            min={1}
            max={pages}
            w={85}
          />
          <Button
            variant="light"
            onClick={() => setPage(Math.max(1, Math.min(pages, Number(jump) || 1)))}
          >
            {t('ui.go_6cc8519b')}
          </Button>
        </Group>
        <Group gap="xs" align="end">
          <NumberInput
            label={t('ui.chapter_number_2dabd4ce')}
            value={chapterJump}
            onChange={setChapterJump}
            min={1}
            max={Math.max(1, chapters.length)}
            w={115}
          />
          <Button
            variant="light"
            disabled={chapters.length === 0}
            onClick={() => {
              setSearch('');
              setExpandVersion((version) => version + 1);
              setPage(
                Math.floor(
                  (Math.min(chapters.length, Math.max(1, Number(chapterJump) || 1)) - 1) /
                    PAGE_SIZE,
                ) + 1,
              );
            }}
          >
            {t('ui.find_chapter_40d3da79')}
          </Button>
        </Group>
        <Button
          disabled={!canEdit || busy}
          leftSection={<IconPlus size={16} />}
          onClick={() => configure({ kind: 'chapter' })}
        >
          {t('ui.create_chapter_f2291533')}
        </Button>
      </Group>
      <Group>
        <Button
          variant="light"
          disabled={!canEdit || busy}
          leftSection={<IconFolderPlus size={16} />}
          onClick={() => configure({ kind: 'volume' })}
        >
          {t('ui.create_volume_1d7ac29e')}
        </Button>
        <Button
          variant="light"
          disabled={!canEdit || busy || !groups.some((g) => g.kind === 'volume')}
          onClick={() =>
            configure({ kind: 'arc', parent: groups.find((g) => g.kind === 'volume')?.uid ?? null })
          }
        >
          {t('ui.create_arc_c4ce3f98')}
        </Button>
        <Text size="xs" c="dimmed">
          {t('ui.volume_arc_chapter_chapters_may_also_sit_directl_4d07f620')}
        </Text>
      </Group>
      <Card p="sm">
        {nodes.some((n) => n.delete_after === null) ? (
          branch(null)
        ) : (
          <Text p="lg" c="dimmed">
            {t('ui.your_first_chapter_starts_here_create_a_chapter__5c6025a3')}
          </Text>
        )}
        {chapters.length > 0 && filtered.length === 0 && (
          <Text p="lg">{t('ui.no_matching_chapters_09f6bbf2')}</Text>
        )}
      </Card>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {t('chapters.pagination', { count: filtered.length, page: currentPage, total: pages })}
        </Text>
        <Pagination value={currentPage} onChange={setPage} total={pages} />
      </Group>
      <details>
        <summary>
          {t('chapters.archive_count', {
            count: nodes.filter((n) => n.delete_after !== null).length,
          })}
        </summary>
        <Text size="sm" c="dimmed" my="sm">
          {t('ui.deleted_chapters_can_be_restored_for_seven_days__9d160765')}
        </Text>
        {nodes
          .filter((n) => n.delete_after !== null)
          .map((n) => (
            <Group key={n.uid} justify="space-between" my="xs">
              <Text size="sm">
                {n.title} {t('ui.deletes_6302fc0e')} {date(n.delete_after!, 'date')}
              </Text>
              <Button
                size="xs"
                variant="light"
                disabled={!canEdit || busy}
                onClick={() => void change({ action: 'restore', uid: n.uid })}
              >
                {t('ui.restore_a76e13b9')}
              </Button>
            </Group>
          ))}
      </details>
      <Modal
        opened={editing !== null}
        onClose={() => {
          if (!busy && !uploading) setEditing(null);
        }}
        title={t(`chapters.${editing?.uid ? 'configure' : 'create'}.${editing?.kind ?? 'chapter'}`)}
        closeOnClickOutside={!busy && !uploading}
        closeOnEscape={!busy && !uploading}
        withCloseButton={!busy && !uploading}
      >
        <Stack>
          <TextInput
            label={t('ui.title_7e8cd205')}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            maxLength={160}
            required
            data-autofocus
          />
          {editing?.kind !== 'volume' && (
            <NativeSelect
              label={t('ui.location_15b61974')}
              value={parent}
              onChange={(e) => setParent(e.currentTarget.value)}
              data={options([
                ...(editing?.kind === 'chapter'
                  ? [{ value: '', label: t('ui.ungrouped_chapters_9543b3e8') }]
                  : []),
                ...groups
                  .filter(
                    (g) =>
                      g.uid !== editing?.uid &&
                      (editing?.kind === 'chapter' || g.kind === 'volume'),
                  )
                  .map((g) => ({
                    value: g.uid,
                    label: `${g.kind === 'arc' ? t('ui.arc_8035e1c4') : t('ui.volume_b10fb966')}: ${g.title}`,
                  })),
              ])}
            />
          )}
          {editing?.kind === 'chapter' && (
            <>
              <Textarea
                label={t('ui.brief_synopsis_optional_c267f485')}
                value={synopsis}
                onChange={(e) => setSynopsis(e.currentTarget.value)}
                maxLength={1000}
                minRows={3}
              />
              <Checkbox.Group
                label={t('reader.disclosures')}
                value={disclosures}
                onChange={(value) => setDisclosures(value as ChapterNode['disclosures'])}
              >
                <Group>
                  {(['gore', 'assault', 'sexual_content'] as const).map((key) => (
                    <Checkbox key={key} value={key} label={t(`reader.disclosure.${key}`)} />
                  ))}
                </Group>
              </Checkbox.Group>
              <ArtworkInput
                label={t('ui.chapter_cover_optional_72e0c962')}
                purpose="chapter_cover"
                value={cover}
                onChange={setCover}
                onBusyChange={setUploading}
              />
              <Text size="xs" c="dimmed">
                {t('ui.the_cover_is_saved_for_the_future_story_overview_1bab6297')}
              </Text>
            </>
          )}
          <Button
            loading={busy}
            disabled={uploading || !title.trim() || (editing?.kind === 'arc' && !parent)}
            onClick={() => {
              if (!editing?.kind) return;
              void change({
                action: 'save_node',
                disclosures: editing?.kind === 'chapter' ? disclosures : [],
                uid: editing?.uid ?? null,
                kind: editing.kind,
                parent: parent || null,
                title,
                synopsis: editing?.kind === 'chapter' ? synopsis : '',
                cover: editing?.kind === 'chapter' ? (cover?.uid ?? null) : null,
              }).then((ok) => {
                if (ok) setEditing(null);
              });
            }}
          >
            {t(`chapters.save.${editing?.kind ?? 'chapter'}`)}
          </Button>
        </Stack>
      </Modal>
      <Modal
        opened={deleting !== null}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        title={t('ui.delete_chapter_25cec178')}
        closeOnClickOutside={!busy}
      >
        <Text>
          {t('ui.text_45ca8454')}
          {deleting?.title}
          {t('ui.will_move_to_the_archive_now_and_be_permanently__07b30049')}
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setDeleting(null)} disabled={busy}>
            {t('ui.keep_chapter_f0064d90')}
          </Button>
          <Button
            color="red"
            loading={busy}
            onClick={() => {
              if (!deleting) return;
              void change({ action: 'archive', uid: deleting.uid }).then((ok) => {
                if (ok) setDeleting(null);
              });
            }}
          >
            {t('ui.move_to_archive_bff5c889')}
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
