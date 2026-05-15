import { describe, expect, it } from 'vitest';
import { darkPalette, lightPalette, tapTarget } from '@/theme/tokens';

describe('design tokens', () => {
  it('exposes the dark surface palette with a 4-tier elevation ladder', () => {
    // Page bg → paper → raised → overlay, low to high elevation.
    expect(darkPalette.surface[0]).toBe('#0B0B0E');
    expect(darkPalette.surface[1]).toBe('#16161A');
    expect(darkPalette.surface[2]).toBe('#1F1F24');
    expect(darkPalette.surface[3]).toBe('#2A2A30');
    // Logged-success doubles as the 10 kg bumper-plate green.
    expect(darkPalette.accent.logged).toBe(darkPalette.plates.green);
    expect(darkPalette.accent.error).toBe(darkPalette.plates.red);
  });

  it('exposes a light palette so the app honors prefers-color-scheme: light', () => {
    // Sanity: light surface is markedly brighter than dark surface.
    expect(lightPalette.surface[0]).not.toBe(darkPalette.surface[0]);
    expect(lightPalette.text.primary).not.toBe(darkPalette.text.primary);
    // Page bg is light-but-distinct from white paper so cards visibly float.
    expect(lightPalette.surface[0].toLowerCase().startsWith('#e')).toBe(true);
    expect(lightPalette.surface[1]).toBe('#FFFFFF');
  });

  it('exposes the Olympic bumper-plate accent palette', () => {
    for (const p of [darkPalette, lightPalette]) {
      expect(p.plates.red).toMatch(/^#[0-9A-F]{6}$/i);
      expect(p.plates.blue).toMatch(/^#[0-9A-F]{6}$/i);
      expect(p.plates.yellow).toMatch(/^#[0-9A-F]{6}$/i);
      expect(p.plates.green).toMatch(/^#[0-9A-F]{6}$/i);
      // Each plateTint is the matching plate hex with a low-alpha suffix.
      expect(p.plateTint.red.toLowerCase().startsWith(p.plates.red.toLowerCase())).toBe(true);
      expect(p.plateTint.blue.toLowerCase().startsWith(p.plates.blue.toLowerCase())).toBe(true);
      expect(p.plateTint.green.toLowerCase().startsWith(p.plates.green.toLowerCase())).toBe(true);
    }
  });

  it('meets the 48dp Material tap-target baseline (NFR8)', () => {
    expect(tapTarget.baseline).toBeGreaterThanOrEqual(48);
    expect(tapTarget.row).toBeGreaterThanOrEqual(tapTarget.baseline);
  });
});
