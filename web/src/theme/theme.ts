import {
  createTheme,
  defaultVariantColorsResolver,
  parseThemeColor,
  getContrastColor,
  luminance,
  Button,
  Card,
  TextInput,
  PasswordInput,
  NativeSelect,
  Textarea,
  Tabs,
  Modal,
  Paper,
} from '@mantine/core';
import type { CSSVariablesResolver } from '@mantine/core';
/** Material 3 roles and 4px spacing are the design contract; see docs/design_system.md. */
export const theme = createTheme({
  primaryColor: 'brand',
  autoContrast: true,
  luminanceThreshold: 0.179,
  variantColorResolver: (input) => {
    const result = defaultVariantColorsResolver(input);
    const color = parseThemeColor({ color: input.color, theme: input.theme });
    // Mantine's unshaded filled backgrounds vary by scheme; their text must too.
    if (input.variant === 'filled' && color.isThemeColor && color.shade === undefined) {
      return { ...result, color: `var(--artismaga-${color.color}-contrast)` };
    }
    return result;
  },
  primaryShade: { light: 7, dark: 3 },
  colors: {
    red: [
      '#fffbff',
      '#ffedea',
      '#ffdad6',
      '#ffb4ab',
      '#ff897d',
      '#ff5449',
      '#de3730',
      '#b3261e',
      '#93000a',
      '#690005',
    ],
    brand: [
      '#edf8f4',
      '#daeee6',
      '#b6ddce',
      '#8ac9b1',
      '#64b496',
      '#459e7f',
      '#328269',
      '#24675a',
      '#1d544a',
      '#17463e',
    ],
  },
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily: 'inherit',
    fontWeight: '650',
    sizes: {
      h1: { fontSize: '2rem', lineHeight: '1.25' },
      h2: { fontSize: '1.25rem', lineHeight: '1.4' },
      h3: { fontSize: '1rem', lineHeight: '1.5' },
    },
  },
  defaultRadius: 'md',
  radius: { xs: '4px', sm: '8px', md: '12px', lg: '20px', xl: '28px' },
  spacing: { xs: '8px', sm: '12px', md: '16px', lg: '24px', xl: '32px' },
  shadows: { xs: '0 1px 3px rgb(23 40 33 / 0.06)', sm: '0 4px 16px rgb(23 40 33 / 0.08)' },
  components: {
    Button: Button.extend({ defaultProps: { radius: 'xl', size: 'md' } }),
    Card: Card.extend({ defaultProps: { radius: 'lg', withBorder: true, padding: 'lg' } }),
    Paper: Paper.extend({ defaultProps: { radius: 'lg' } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'md', radius: 'sm' } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { size: 'md', radius: 'sm' } }),
    NativeSelect: NativeSelect.extend({ defaultProps: { size: 'md', radius: 'sm' } }),
    Textarea: Textarea.extend({ defaultProps: { size: 'md', radius: 'sm' } }),
    Tabs: Tabs.extend({ defaultProps: { color: 'brand', radius: 'sm' } }),
    Modal: Modal.extend({ defaultProps: { radius: 'lg', centered: true } }),
  },
});

/** Scheme-scoped aliases override Mantine defaults without fighting stylesheet order. */
const semanticAliases = {
  '--mantine-color-body': 'var(--surface)',
  '--mantine-color-text': 'var(--ink)',
  '--mantine-color-dimmed': 'var(--muted)',
};
export const cssVariablesResolver: CSSVariablesResolver = (theme) => {
  const contrast = (colorScheme: 'light' | 'dark') =>
    Object.fromEntries(
      Object.keys(theme.colors).map((color) => [
        `--artismaga-${color}-contrast`,
        getContrastColor({ color, theme, autoContrast: true, colorScheme }),
      ]),
    );
  return {
    variables: {},
    light: {
      ...semanticRoles(theme.colors.brand![7]!, false),
      ...semanticAliases,
      ...contrast('light'),
    },
    dark: {
      ...semanticRoles(theme.colors.brand![7]!, true),
      ...semanticAliases,
      ...contrast('dark'),
    },
  };
};

/** Derive one restrained tonal palette from an administrator-selected sRGB seed. */
export function makeTheme(primary: string) {
  if (!/^#[0-9a-f]{6}$/i.test(primary)) return theme;
  // Very light seeds need a darker primary tone for links and selected navigation.
  for (let step = 0; step < 20 && luminance(primary) > 0.12; step++) {
    primary =
      '#' +
      [1, 3, 5]
        .map((at) =>
          Math.round(Number.parseInt(primary.slice(at, at + 2), 16) * 0.88)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
  }
  const mix = (towards: number, amount: number) =>
    '#' +
    [1, 3, 5]
      .map((at) => {
        const channel = Number.parseInt(primary.slice(at, at + 2), 16);
        return Math.round(channel + (towards - channel) * amount)
          .toString(16)
          .padStart(2, '0');
      })
      .join('');
  return {
    ...theme,
    colors: {
      ...theme.colors,
      gray: [250, 243, 234, 220, 200, 168, 127, 92, 61, 31].map((n) =>
        neutralTone(primary, n, 0.07),
      ) as [string, string, string, string, string, string, string, string, string, string],
      dark: [190, 175, 145, 115, 85, 62, 43, 31, 23, 17].map((n) =>
        neutralTone(primary, n, 0.12),
      ) as [string, string, string, string, string, string, string, string, string, string],
      brand: [
        mix(255, 0.94),
        mix(255, 0.84),
        mix(255, 0.67),
        mix(255, 0.5),
        mix(255, 0.35),
        mix(255, 0.2),
        mix(255, 0.08),
        primary,
        mix(0, 0.2),
        mix(0, 0.35),
      ] as [string, string, string, string, string, string, string, string, string, string],
    },
  };
}

/** Neutral roles retain seed hue at restrained chroma; text remains high contrast. */
export function semanticRoles(seed: string, dark: boolean): Record<string, string> {
  const tone = (neutral: number, tint: number) =>
    '#' +
    [1, 3, 5]
      .map((at) =>
        Math.round(neutral * (1 - tint) + Number.parseInt(seed.slice(at, at + 2), 16) * tint)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  const roles = dark
    ? {
        surface: tone(17, 0.12),
        'surface-container': tone(27, 0.16),
        'surface-low': tone(32, 0.19),
        'surface-high': tone(43, 0.12),
        ink: tone(244, 0.06),
        muted: tone(190, 0.1),
        outline: tone(79, 0.16),
      }
    : {
        surface: tone(253, 0.035),
        'surface-container': tone(255, 0.015),
        'surface-low': tone(248, 0.065),
        'surface-high': tone(244, 0.1),
        ink: tone(23, 0.09),
        muted: tone(85, 0.05),
        outline: tone(211, 0.1),
      };
  return Object.fromEntries(Object.entries(roles).map(([key, value]) => [`--${key}`, value]));
}

function neutralTone(seed: string, neutral: number, tint: number): string {
  return (
    '#' +
    [1, 3, 5]
      .map((at) =>
        Math.round(neutral * (1 - tint) + Number.parseInt(seed.slice(at, at + 2), 16) * tint)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
