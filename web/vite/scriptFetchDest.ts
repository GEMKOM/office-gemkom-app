// Dev-server plugin: repairs a wrong Sec-Fetch-Dest on script requests.
//
// Vite treats a request with Sec-Fetch-Dest "document"/"iframe" as a page load:
// it skips the transform (so .ts/.tsx go out as raw source) and answers unknown
// paths such as /@react-refresh with index.html. Some Chrome profiles (seen with
// Chrome 156, cause outside the app) send "document" for <script type="module">
// loads, which breaks the whole SPA with MIME and syntax errors. A real page load
// always has Sec-Fetch-Mode "navigate"; anything else claiming to be a document
// is a subresource, so it is relabelled as a script before Vite sees it.

import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';

const DOCUMENT_DESTS = new Set(['document', 'iframe', 'frame', 'fencedframe']);

export function fixScriptFetchDest(req: IncomingMessage): void {
  const dest = req.headers['sec-fetch-dest'];
  const mode = req.headers['sec-fetch-mode'];
  if (
    typeof dest === 'string' &&
    DOCUMENT_DESTS.has(dest) &&
    mode !== undefined &&
    mode !== 'navigate'
  ) {
    req.headers['sec-fetch-dest'] = 'script';
  }
}

export function scriptFetchDest(): Plugin {
  return {
    name: 'gemkom:script-fetch-dest',
    apply: 'serve',
    configureServer(server) {
      // Registered directly (not in a returned hook) so it runs before Vite's middlewares.
      server.middlewares.use((req, _res, next) => {
        fixScriptFetchDest(req);
        next();
      });
    },
  };
}
