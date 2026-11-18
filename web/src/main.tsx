import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Providers } from '@/app/Providers';
import { router } from '@/routes/router';
import { reloadForNewVersion } from '@/routes/staleChunk';

// A chunk failing to load (a file a deploy removed): reload for the new
// version. The error is not prevented: preventing it makes the page's import
// resolve to undefined, and the route then broke with "Cannot read properties
// of undefined" before the reload. It reaches the route error page instead,
// which shows the reload in progress.
window.addEventListener('vite:preloadError', () => {
  reloadForNewVersion();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
