import { TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { DesignLayout, OccasionDesign } from '@/api/general/specialDays';
import { LAYOUTS } from '@/shell/occasion/design';
import { TITLE_FONTS, ensureFonts, fontStack } from '@/shell/occasion/fonts';
import { Motif } from '@/shell/occasion/Motif';
import { MOTIFS, MOTIF_LABEL } from '@/shell/occasion/motifs';
import css from './design.module.css';

/** Layout, colours, title font and motif: the look part of the Tasarım form. */

type ColourKey = 'tone' | 'ink' | 'accent' | 'paper';

const PALETTES: { key: ColourKey; label: string; swatches: string[] }[] = [
  {
    key: 'tone',
    label: 'Zemin',
    swatches: ['#c8102e', '#8b0000', '#14213d', '#0d5e58', '#4a2366', '#111111'],
  },
  { key: 'ink', label: 'Yazı', swatches: ['#ffffff', '#fff8f4', '#1f2933'] },
  { key: 'accent', label: 'Vurgu', swatches: ['#ffffff', '#ffc2c9', '#e9d8a6', '#9fb7ff'] },
  { key: 'paper', label: 'Kağıt', swatches: ['#fff8f4', '#fff6f9', '#fbf8ef', '#ffffff'] },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface DesignControlsProps {
  design: OccasionDesign;
  onChange: (design: OccasionDesign) => void;
}

export function DesignControls({ design, onChange }: DesignControlsProps) {
  const set = <K extends keyof OccasionDesign>(key: K, value: OccasionDesign[K]) =>
    onChange({ ...design, [key]: value });

  useEffect(() => {
    // The pills show each font in itself.
    ensureFonts(TITLE_FONTS);
  }, []);

  const palettes = PALETTES.filter((p) => p.key !== 'paper' || design.layout === 'split');

  return (
    <>
      <div className={css.field}>
        <span className={css.label} id="design-layout">
          Düzen
        </span>
        <div className={css.layoutGrid} role="radiogroup" aria-labelledby="design-layout">
          {LAYOUTS.map((layout) => (
            <button
              key={layout.value}
              type="button"
              role="radio"
              aria-checked={design.layout === layout.value}
              className={css.choice}
              data-on={design.layout === layout.value || undefined}
              onClick={() => set('layout', layout.value as DesignLayout)}
            >
              {layout.label}
            </button>
          ))}
        </div>
      </div>

      <div className={css.palettes} data-count={palettes.length}>
        {palettes.map((palette) => (
          <ColourField
            key={palette.key}
            label={palette.label}
            value={design[palette.key]}
            swatches={palette.swatches}
            onChange={(value) => set(palette.key, value)}
          />
        ))}
      </div>

      <div className={css.field}>
        <span className={css.label} id="design-font">
          Başlık yazı tipi
        </span>
        <div className={css.fonts} role="radiogroup" aria-labelledby="design-font">
          {TITLE_FONTS.map((font) => (
            <button
              key={font}
              type="button"
              role="radio"
              aria-checked={design.font === font}
              className={css.fontPill}
              data-on={design.font === font || undefined}
              style={{ fontFamily: fontStack(font) }}
              onClick={() => set('font', font)}
            >
              {font}
            </button>
          ))}
        </div>
      </div>

      <div className={css.field}>
        <span className={css.label} id="design-motif">
          Motif
        </span>
        <div className={css.motifs} role="radiogroup" aria-labelledby="design-motif">
          {MOTIFS.map((motif) => (
            <button
              key={motif}
              type="button"
              role="radio"
              aria-checked={design.motif === motif}
              aria-label={MOTIF_LABEL[motif]}
              title={MOTIF_LABEL[motif]}
              className={css.motifButton}
              data-on={design.motif === motif || undefined}
              onClick={() => set('motif', motif)}
            >
              <Motif motif={motif} color={design.tone} accent="#c9a3a9" size={30} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ColourField({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: string[];
  onChange: (value: string) => void;
}) {
  // The hex box keeps what is typed until it is a colour; a new value from
  // outside (a swatch, another day) replaces it.
  const [text, setText] = useState(value);
  const [shownValue, setShownValue] = useState(value);
  if (shownValue !== value) {
    setShownValue(value);
    setText(value);
  }
  const valid = HEX.test(text);
  return (
    <div className={css.field}>
      <span className={css.label}>{label}</span>
      <div className={css.swatches}>
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={css.swatch}
            data-on={swatch.toLowerCase() === value.toLowerCase() || undefined}
            style={{ background: swatch }}
            aria-label={`${label} ${swatch}`}
            aria-pressed={swatch.toLowerCase() === value.toLowerCase()}
            onClick={() => onChange(swatch)}
          />
        ))}
      </div>
      <TextInput
        size="xs"
        aria-label={`${label} rengi`}
        value={text}
        maxLength={7}
        classNames={{ input: css.hex }}
        leftSection={<span className={css.hexDot} style={{ background: valid ? text : value }} />}
        error={valid ? undefined : text ? 'Örn. #c8102e' : undefined}
        onChange={(event) => {
          const next = event.currentTarget.value.trim();
          setText(next);
          if (HEX.test(next)) onChange(next.toLowerCase());
        }}
        onBlur={() => setText(value)}
      />
    </div>
  );
}
