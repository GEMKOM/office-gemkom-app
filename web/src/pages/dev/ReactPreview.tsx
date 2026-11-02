import { Stack, Text, Title } from '@mantine/core';

// Dev-only landing page for checking the shell while no real page is migrated.
export function ReactPreview() {
  return (
    <Stack p="md">
      <Title order={2}>React önizleme</Title>
      <Text c="dimmed">Bu sayfa yalnızca geliştirme ortamında görünür.</Text>
    </Stack>
  );
}
