// localisation-mapped
import { LocalisationContext } from '../localisation/index.js';
import { sources } from '../localisation/sources.js';
import { useI18n } from '../localisation/index.js';
import { selectedTheme } from '../shared/theme-selection.js';
import { pageTitle } from '../shared/page-title.js';
import { Application } from './Application.js';
import type { PageProps } from '../shared/contracts.js';
export function Document({ props }: { props: PageProps }) {
  const value = {
    locale: props.localisation.locale,
    timezone: props.localisation.timezone,
    now: props.localisation.now,
    messages: { ...sources, ...props.localisation.messages },
    sources,
    preview: props.localisation.preview,
  };
  return (
    <LocalisationContext.Provider value={value}>
      <LocalizedDocument props={props} />
    </LocalisationContext.Provider>
  );
}
function LocalizedDocument({ props }: { props: PageProps }) {
  const { t } = useI18n();

  const mode = selectedTheme(
    props.appearance?.reading.theme,
    props.site,
    props.permissions.includes('administer'),
  );
  return (
    <html
      lang={props.localisation.locale}
      data-mantine-color-scheme={mode === 'dark' ? 'dark' : 'light'}
      data-reduced-motion={props.appearance?.accessibility.reduced_motion || undefined}
      data-high-contrast={props.appearance?.accessibility.high_contrast || undefined}
      data-large-controls={props.appearance?.accessibility.large_controls || undefined}
      data-reading-theme={mode === 'sepia' ? 'sepia' : undefined}
      data-page-props={JSON.stringify(props)}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content={props.site?.description ?? 'Independent fiction. Shared possibilities.'}
        />
        <title>{pageTitle(props)}</title>
        <link rel="stylesheet" href="/assets/theme.css" />
        <script type="module" src="/assets/client.js" />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {t('ui.skip_to_content_ac576a66')}
        </a>
        <Application props={props} />
        <noscript>{t('ui.pages_are_rendered_on_the_server_enable_javascri_15fa080e')}</noscript>
      </body>
    </html>
  );
}
