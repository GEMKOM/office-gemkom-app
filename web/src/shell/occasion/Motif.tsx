import { createElement, useId, type ReactNode } from 'react';
import { MOTIF_NODES, isMotif, motifValue, type MotifId, type MotifNode } from './motifs';

const camel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function render(
  node: MotifNode,
  key: number,
  color: string,
  accent: string,
  maskId: string,
): ReactNode {
  const [tag, attrs, children = []] = node;
  const props: Record<string, string | number> = { key };
  for (const [name, value] of Object.entries(attrs)) {
    props[camel(name)] = motifValue(value, color, accent, maskId);
  }
  return createElement(
    tag,
    props,
    ...children.map((child, i) => render(child, i, color, accent, maskId)),
  );
}

export interface MotifProps {
  motif: MotifId | string;
  /** The ink colour. */
  color: string;
  accent: string;
  /** Pixels; the drawing is square. */
  size?: number | string;
  className?: string;
}

/** One of the 19 motifs as an inline SVG (decorative, hidden from screen readers). */
export function Motif({ motif, color, accent, size = 200, className }: MotifProps) {
  // Masks need an id unique on the page; useId gives ':r1:'-style ids.
  const maskId = `gk-motif-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const id: MotifId = isMotif(motif) ? motif : 'kivilcim';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      data-motif={id}
    >
      {MOTIF_NODES[id].map((node, i) => render(node, i, color, accent, maskId))}
    </svg>
  );
}
