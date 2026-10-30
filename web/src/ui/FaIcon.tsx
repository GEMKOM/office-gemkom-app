import type { CSSProperties } from 'react';

/**
 * "fas fa-users" stays as is; a bare legacy name such as "users" (what
 * HeaderComponent took) becomes "fas fa-users".
 */
export function faClass(icon: string): string {
  const trimmed = icon.trim();
  if (trimmed.includes(' ')) return trimmed;
  if (trimmed.startsWith('fa-')) return `fas ${trimmed}`;
  return `fas fa-${trimmed}`;
}

export interface FaIconProps {
  /** Font Awesome classes ("fas fa-edit") or a bare name ("edit"). */
  icon: string;
  className?: string;
  style?: CSSProperties;
  color?: string;
  size?: number | string;
}

/** A Font Awesome icon; decorative, so hidden from screen readers. */
export function FaIcon({ icon, className, style, color, size }: FaIconProps) {
  return (
    <i
      className={className ? `${faClass(icon)} ${className}` : faClass(icon)}
      style={{ color, fontSize: size, ...style }}
      aria-hidden
    />
  );
}
