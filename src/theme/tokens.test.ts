import { describe, expect, it } from 'vitest';
import { darkPalette, lightPalette, tapTarget } from '@/theme/tokens';

describe('design tokens', () => {
  it('exposes the dark surface palette from UX §Visual Design Foundation', () => {
    expect(darkPalette.surface[0]).toBe('#0E0E10');
    expect(darkPalette.surface[1]).toBe('#1A1A1D');
    expect(darkPalette.accent.logged).toBe('#3DDC84');
    expect(darkPalette.accent.error).toBe('#FF5252');
  });

  it('exposes a light palette so the app honors prefers-color-scheme: light', () => {
    // Sanity: light surface is markedly brighter than dark surface.
    expect(lightPalette.surface[0]).not.toBe(darkPalette.surface[0]);
    expect(lightPalette.text.primary).not.toBe(darkPalette.text.primary);
    expect(lightPalette.surface[0].toLowerCase().startsWith('#f')).toBe(true);
  });

  it('meets the 48dp Material tap-target baseline (NFR8)', () => {
    expect(tapTarget.baseline).toBeGreaterThanOrEqual(48);
    expect(tapTarget.row).toBeGreaterThanOrEqual(tapTarget.baseline);
  });
});
