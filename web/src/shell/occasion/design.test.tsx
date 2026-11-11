import { render, screen } from '@testing-library/react';
import type { Occasion } from '@/api/general/specialDays';
import { renderWithProviders } from '@/test/render';
import {
  THEME_DESIGN,
  bandLook,
  normalizeDesign,
  occasionDesign,
  occasionKicker,
  occasionNumeral,
  rangeLabel,
} from './design';
import { fontStack, isTitleFont, titleMetrics } from './fonts';
import { Motif } from './Motif';
import { MOTIFS, motifSvg } from './motifs';
import { WelcomeTemplate } from './WelcomeTemplate';

describe('motifs', () => {
  it('draws all 19 in the two given colours', () => {
    expect(MOTIFS).toHaveLength(19);
    for (const motif of MOTIFS) {
      const svg = motifSvg(motif, '#123456', '#abcdef');
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">')).toBe(
        true,
      );
      // No colour token is left behind.
      expect(svg).not.toMatch(/="[CA]"/);
      expect(svg.includes('#123456') || svg.includes('#abcdef')).toBe(true);
    }
  });

  it('renders as React SVG with a mask id unique to each copy', () => {
    const { container } = render(
      <>
        <Motif motif="ayyildiz" color="#fff" accent="#000" size={40} />
        <Motif motif="ayyildiz" color="#fff" accent="#000" size={40} />
      </>,
    );
    const masks = [...container.querySelectorAll('mask')].map((m) => m.id);
    expect(masks).toHaveLength(2);
    expect(new Set(masks).size).toBe(2);
    const circle = container.querySelector('circle[mask]');
    expect(circle?.getAttribute('mask')).toBe(`url(#${masks[0]})`);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('falls back to a known motif for an unknown name', () => {
    const { container } = render(<Motif motif="yok" color="#fff" accent="#000" />);
    expect(container.querySelector('svg')).toHaveAttribute('data-motif', 'kivilcim');
  });
});

describe('design', () => {
  it('fills a partial or broken design from the fallback', () => {
    const d = normalizeDesign(
      { layout: 'split', tone: 'red', font: 'Comic Sans', motif: 'lale', accent_on_ink: '' },
      THEME_DESIGN.national,
    );
    expect(d).toEqual({
      ...THEME_DESIGN.national,
      layout: 'split',
      motif: 'lale',
      accent_on_ink: '',
    });
  });

  it('derives a design from the theme when an older backend sends none', () => {
    expect(occasionDesign({ theme: 'birthday' } as Occasion).motif).toBe('pasta');
    expect(occasionNumeral({ years: 10 } as Occasion, THEME_DESIGN.anniversary)).toBe('10');
    expect(occasionNumeral({ numeral: '103' } as Occasion, THEME_DESIGN.national)).toBe('103');
  });

  it('builds the kicker the way the designs write it', () => {
    const at = (phase: Occasion['phase'], date: string, end: string, shown: string) =>
      occasionKicker(
        {
          name: 'Kurban Bayramı',
          theme: 'religious',
          phase,
          date,
          end_date: end,
          display_date: shown,
        } as Occasion,
        shown,
      );
    expect(at('before', '2026-05-19', '2026-05-19', '2026-05-18')).toBe('Yarın · 19 Mayıs Salı');
    expect(at('before', '2026-05-27', '2026-05-30', '2026-05-25')).toBe(
      'Kurban Bayramı · 27-30 Mayıs',
    );
    expect(at('before', '2026-10-29', '2026-10-29', '2026-10-27')).toBe('Perşembe · 29 Ekim');
    expect(at('on', '2026-11-10', '2026-11-10', '2026-11-10')).toBe('10 Kasım 2026 Salı');
    expect(at('on', '2026-05-04', '2026-05-10', '2026-05-04')).toBe('4-10 Mayıs 2026');
    expect(at('return', '2026-03-20', '2026-03-22', '2026-03-23')).toBe('Pazartesi · 23 Mart 2026');
    expect(
      occasionKicker({ kicker: 'Kadir Gecesi', theme: 'religious' } as Occasion, '2026-03-16'),
    ).toBe('Kadir Gecesi');
    expect(rangeLabel('2026-10-31', '2026-11-02')).toBe('31 Ekim - 2 Kasım');
  });

  it('gives the band the tone and a faint motif, or nothing', () => {
    const band = bandLook(THEME_DESIGN.national);
    expect(band?.tone).toBe('#c8102e');
    expect(decodeURIComponent(band?.motif ?? '')).toContain('opacity="0.2"');
    expect(bandLook(THEME_DESIGN.national, false)).toBeNull();
  });

  it('knows the nine title fonts and their sizes', () => {
    expect(isTitleFont('Bebas Neue')).toBe(true);
    expect(isTitleFont('Arial')).toBe(false);
    expect(titleMetrics('Bebas Neue')).toEqual({ size: 84, weight: 400 });
    expect(fontStack('Amiri')).toBe("'Amiri', 'IBM Plex Sans', 'Segoe UI', sans-serif");
  });
});

describe('WelcomeTemplate', () => {
  const texts = {
    kicker: 'Perşembe · 29 Ekim',
    title: 'Cumhuriyet Bayramımız kutlu olsun',
    body: 'Metin',
    note: 'Not',
  };

  it.each(['celebration', 'flag', 'solemn', 'split'] as const)('draws the %s layout', (layout) => {
    const onCta = vi.fn();
    renderWithProviders(
      <WelcomeTemplate
        mode="stage"
        design={{ ...THEME_DESIGN.national, layout, cta: 'Devam Et' }}
        numeral="103"
        onCta={onCta}
        {...texts}
      />,
    );
    expect(screen.getByTestId('welcome-template')).toHaveAttribute('data-layout', layout);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(texts.title);
    expect(screen.getByText('Not')).toBeInTheDocument();
    // The big number only in the flag layout.
    expect(screen.queryByText('103') !== null).toBe(layout === 'flag');
    screen.getByRole('button', { name: 'Devam Et' }).click();
    expect(onCta).toHaveBeenCalled();
  });

  it('falls back to one column on a small screen', () => {
    renderWithProviders(<WelcomeTemplate design={THEME_DESIGN.soft} {...texts} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(texts.title);
    expect(screen.getByTestId('welcome-template').querySelectorAll('svg')).toHaveLength(1);
  });

  it('loads the title font from Google Fonts once', () => {
    const design = { ...THEME_DESIGN.national, font: 'Oswald' };
    renderWithProviders(<WelcomeTemplate design={design} {...texts} />);
    renderWithProviders(<WelcomeTemplate design={design} {...texts} />);
    const links = document.head.querySelectorAll('link[data-gk-font="Oswald"]');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toContain('family=Oswald');
  });
});
