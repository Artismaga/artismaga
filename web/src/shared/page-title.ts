import { sources } from '../localisation/sources.js';
import type { PageProps } from './contracts.js';
/** One title contract for SSR and path-tab navigation, without parsing user text. */
export function pageTitle(
  props: PageProps,
  section = props.section,
  workTitle = props.studio?.work?.work.title,
): string {
  const names: Record<PageProps['page'], string> = {
    reader: props.reader?.chapter.title ?? 'Reader',
    home: 'Discover',
    genre: props.discovery?.genres.find((g) => g.key === section)?.name ?? 'Discover',
    story: props.discovery?.stories.find((s) => s.uid === section)?.title ?? 'Story',
    login: 'Sign in',
    register: 'Create account',
    profile: 'Profile',
    settings: 'Account settings',
    verify: 'Verify email',
    reset: 'Password recovery',
    email: 'Email confirmation',
    admin: 'Administration',
    analytics: 'Site Analytics',
    setup: 'Set up',
    studio: 'Studio',
    new_work: 'Create work',
    work: workTitle ?? 'Work',
    chapter: props.studio?.editor?.chapter.title ?? 'Chapter editor',
  };
  const sections: Record<string, string> = {
    publishing: 'Publishing',
    audience: 'Overview',
    content: 'Preferences',
    disclosures: 'Content disclosures',
    related: 'Related works',
    settings: 'Sharing & settings',
    taxonomy: 'Genres & tags',
    roles: 'Roles & permissions',
    identity: 'Identity',
    'identity/site': 'Site identity',
    'identity/themes': 'Themes',
    performance: 'Software performance',
    accounts: 'Registrations & logins',
    stories: 'Story traffic',
    genres: 'Genres & subgenres',
    monetisation: 'Monetisation',
    people: 'People & invitations',
  };
  const localise = (text: string) => {
    const key = Object.keys(sources).find((k) => sources[k] === text);
    return key ? (props.localisation.messages[key] ?? text) : text;
  };
  const label =
    section && !['genre', 'story', 'reader'].includes(props.page)
      ? `${localise(sections[section] ?? section.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()))} · `
      : '';
  return `${label}${['work', 'story', 'genre'].includes(props.page) ? names[props.page] : localise(names[props.page])} • ${props.siteName}`;
}
