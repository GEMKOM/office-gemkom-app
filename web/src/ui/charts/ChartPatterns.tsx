import { hatchId } from './palette';

/**
 * SVG <defs> with a diagonal hatch per colour. Render inside a chart, then
 * fill a mark with hatchFill(color): partial periods and estimates read as
 * "not final" without relying on a lighter tint.
 */
export function ChartPatterns({ colors }: { colors: string[] }) {
  const unique = [...new Set(colors)];
  if (!unique.length) return null;
  return (
    <defs>
      {unique.map((color) => (
        <pattern
          key={color}
          id={hatchId(color)}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill={color} fillOpacity={0.18} />
          <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="3" />
        </pattern>
      ))}
    </defs>
  );
}
