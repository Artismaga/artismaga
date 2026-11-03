import { Reader } from '../pages/reader/Reader.js';
import { Notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { availableThemes as themesFor, selectedTheme } from '../shared/theme-selection.js';
import { AppearanceContext } from './Appearance.js';
import type { Appearance } from './Appearance.js';
import { useI18n } from '../localisation/index.js';
import { MantineProvider, PasswordInput, Modal, Pagination, ColorInput } from '@mantine/core';
import { makeTheme, cssVariablesResolver } from '../theme/theme.js';
import { Shell } from './Shell.js';
import { Story } from '../pages/discovery/Story.js';
import { Home } from '../pages/Home.js';
import { Login, Register, EmailAction } from '../pages/Accounts.js';
import { AccountSettings } from '../pages/account/AccountSettings.js';
import { SiteAnalytics } from '../pages/admin/SiteAnalytics.js';
import { Admin } from '../pages/admin/Admin.js';
import { Studio } from '../pages/studio/Studio.js';
import { CreateWork } from '../pages/studio/CreateWork.js';
import { ChapterEditor } from '../pages/studio/ChapterEditor.js';
import { Work } from '../pages/studio/Work.js';
import { Setup } from '../pages/Setup.js';
import type { PageProps } from '../shared/contracts.js';
function Page(props: PageProps) {
  switch (props.page) {
    case 'reader':
      return <Reader {...props} />;
    case 'story':
      return <Story {...props} />;
    case 'genre':
    case 'home':
      return <Home {...props} />;
    case 'login':
      return <Login {...props} />;
    case 'register':
      return <Register {...props} />;
    case 'profile':
    case 'settings':
      return <AccountSettings {...props} />;
    case 'verify':
    case 'reset':
    case 'email':
      return <EmailAction {...props} />;
    case 'analytics':
      return <SiteAnalytics {...props} />;
    case 'admin':
      return <Admin {...props} />;
    case 'studio':
      return <Studio {...props} />;
    case 'new_work':
      return <CreateWork {...props} />;
    case 'chapter':
      return <ChapterEditor {...props} />;
    case 'work':
      return <Work {...props} />;
    case 'setup':
      return <Setup />;
  }
}
export function Application({ props }: { props: PageProps }) {
  const { t, tx } = useI18n();
  const [appearance, setAppearance] = useState(props.appearance);
  const darkDevice = useMediaQuery('(prefers-color-scheme: dark)', false);
  const preference = appearance?.reading.theme;
  const administrator = props.permissions.includes('administer');
  const availableThemes = themesFor(props.site, administrator);
  const selected = selectedTheme(preference, props.site, administrator, darkDevice);
  const [preview, setPreview] = useState<{
    mode: 'light' | 'dark' | 'sepia';
    colour: string;
  } | null>(null);
  const mode = preview?.mode ?? selected;
  const force = mode === 'dark' ? 'dark' : 'light';
  const [primaryOverride, setPrimary] = useState<string | null>(null);
  const primary =
    preview?.colour ??
    primaryOverride ??
    props.site?.themes[mode].primary_colour ??
    props.site?.primary_colour ??
    '#24675a';
  useEffect(() => {
    const root = document.documentElement;
    root.dataset['readingTheme'] = mode === 'sepia' ? 'sepia' : '';
    for (const [attribute, enabled] of [
      ['reducedMotion', appearance?.accessibility.reduced_motion],
      ['highContrast', appearance?.accessibility.high_contrast],
      ['largeControls', appearance?.accessibility.large_controls],
    ] as const) {
      if (enabled) root.dataset[attribute] = 'true';
      else delete root.dataset[attribute];
    }
  }, [appearance, mode]);
  const update = (next: Partial<Appearance>) => {
    setPreview(null);
    setPrimary(null);
    setAppearance((previous) => (previous ? { ...previous, ...next } : previous));
  };
  return (
    <MantineProvider
      theme={{
        ...makeTheme(primary),
        components: {
          ...makeTheme(primary).components,
          PasswordInput: PasswordInput.extend({
            defaultProps: {
              size: 'md',
              radius: 'sm',
              visibilityToggleButtonProps: { 'aria-label': t('accessibility.password_visibility') },
            },
          }),
          Modal: Modal.extend({
            defaultProps: {
              radius: 'lg',
              centered: true,
              closeButtonProps: { 'aria-label': t('accessibility.close_dialog') },
            },
          }),
          ColorInput: ColorInput.extend({
            defaultProps: {
              eyeDropperButtonProps: { 'aria-label': tx('Pick a colour from the screen') },
            },
          }),
          Pagination: Pagination.extend({
            defaultProps: {
              getControlProps: (control) => ({ 'aria-label': t(`pagination.${control}`) }),
              getItemProps: (page) => ({ 'aria-label': t('pagination.page', { page }) }),
            },
          }),
        },
      }}
      cssVariablesResolver={cssVariablesResolver}
      forceColorScheme={force}
      getStyleNonce={() => props.styleNonce}
    >
      <div aria-live="polite" aria-relevant="additions text">
        <Notifications withinPortal={false} position="top-right" limit={4} zIndex={10000} />
      </div>
      <AppearanceContext.Provider
        value={{
          value: appearance,
          update,
          primary,
          setPrimary,
          availableThemes: [...availableThemes, 'system'],
          previewTheme: (mode, colour) => setPreview({ mode, colour }),
        }}
      >
        <div>
          {props.page === 'setup' ? (
            <main id="main" className="setup-layout">
              <Page {...props} />
            </main>
          ) : props.page === 'reader' ? (
            <main id="main">
              <Page {...props} />
            </main>
          ) : props.page === 'chapter' ? (
            <main id="main" className="writing-workspace">
              <Page {...props} />
            </main>
          ) : (
            <Shell props={props}>
              <Page {...props} />
            </Shell>
          )}
        </div>
      </AppearanceContext.Provider>
    </MantineProvider>
  );
}
