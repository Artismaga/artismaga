import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THEME, mergeMantineTheme, luminance } from '@mantine/core';
import { theme, makeTheme, cssVariablesResolver } from '../src/theme/theme.js';

test('filled primary and destructive actions maintain AA text contrast in both schemes', () => {
  const resolved = mergeMantineTheme(DEFAULT_THEME, theme);
  const variables = cssVariablesResolver(resolved);
  for (const scheme of ['light', 'dark'] as const) {
    for (const color of ['brand', 'red']) {
      const shade =
        typeof resolved.primaryShade === 'number'
          ? resolved.primaryShade
          : resolved.primaryShade[scheme];
      const background = resolved.colors[color]?.[shade];
      assert.ok(background);
      const text = variables[scheme][`--artismaga-${color}-contrast`];
      const foreground = text === 'var(--mantine-color-black)' ? resolved.black : resolved.white;
      const bg = luminance(background);
      const fg = luminance(foreground);
      assert.ok(
        (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) >= 4.5,
        `${color} ${scheme} filled action must maintain AA contrast`,
      );
      const variant = resolved.variantColorResolver({ theme: resolved, color, variant: 'filled' });
      assert.equal(variant.color, `var(--artismaga-${color}-contrast)`);
    }
  }
});

test('configured seed colours retain readable primary action tones', () => {
  for (const seed of ['#ffffff', '#ffff00', '#000000', '#2563eb', '#c1216c']) {
    const resolved = mergeMantineTheme(DEFAULT_THEME, makeTheme(seed));
    const variables = cssVariablesResolver(resolved);
    for (const scheme of ['light', 'dark'] as const) {
      const shade =
        typeof resolved.primaryShade === 'number'
          ? resolved.primaryShade
          : resolved.primaryShade[scheme];
      const background = resolved.colors['brand']?.[shade];
      assert.ok(background);
      const foreground =
        variables[scheme]['--artismaga-brand-contrast'] === 'var(--mantine-color-black)'
          ? resolved.black
          : resolved.white;
      const a = luminance(background),
        b = luminance(foreground);
      assert.ok(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
        `${seed} ${scheme} needs readable action text`,
      );
    }
  }
});
