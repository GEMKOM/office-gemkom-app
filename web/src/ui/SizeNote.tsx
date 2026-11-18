import { Text } from '@mantine/core';

/**
 * The size of a plate / bar line under its item name: "1500×6000 mm × 2 adet · 1.413 kg"
 * (backend planning.sizes.size_summary). Nothing for other lines.
 */
export function SizeNote({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    // Wraps inside a clipped (max-width) cell instead of ending in "…": the size matters.
    <Text size="xs" c="dimmed" style={{ whiteSpace: 'normal' }} data-testid="size-note">
      {text}
    </Text>
  );
}
