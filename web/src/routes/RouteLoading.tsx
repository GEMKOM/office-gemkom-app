import { Center, Loader } from '@mantine/core';

// Shown on a full page load while the opened page's lazy chunk loads, the same
// spinner AuthProvider shows while it reads the session.
export function RouteLoading() {
  return (
    <Center mih="100vh" aria-busy="true" aria-label="Sayfa yükleniyor">
      <Loader />
    </Center>
  );
}
