import type { SiteConfiguration } from './settings.js';
export function availableThemes(
  site: SiteConfiguration | null | undefined,
  administrator: boolean,
): ('light' | 'dark' | 'sepia')[] {
  return (['light', 'dark', 'sepia'] as const).filter(
    (mode) => administrator || site?.themes[mode].enabled !== false,
  );
}
export function selectedTheme(
  preference: string | undefined,
  site: SiteConfiguration | null | undefined,
  administrator: boolean,
  darkDevice = false,
) {
  const requested =
    preference === 'dark' || (preference === 'system' && darkDevice)
      ? 'dark'
      : preference === 'sepia'
        ? 'sepia'
        : 'light';
  const themes = availableThemes(site, administrator);
  return themes.includes(requested) ? requested : (themes[0] ?? 'light');
}
