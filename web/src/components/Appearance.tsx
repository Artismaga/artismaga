import { createContext, useContext } from 'react';
import type { PageProps } from '../shared/contracts.js';
export type Appearance = NonNullable<PageProps['appearance']>;
export const AppearanceContext = createContext<{
  value: Appearance | null;
  update: (value: Partial<Appearance>) => void;
  primary: string;
  setPrimary: (value: string) => void;
  previewTheme: (mode: 'light' | 'dark' | 'sepia', colour: string) => void;
  availableThemes: readonly string[];
}>({
  value: null,
  update: () => {},
  primary: '#24675a',
  setPrimary: () => {},
  previewTheme: () => {},
  availableThemes: ['light', 'dark', 'sepia', 'system'],
});
export const useAppearance = () => useContext(AppearanceContext);
