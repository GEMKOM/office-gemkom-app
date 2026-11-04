// The API every request goes to. A page opened from localhost or 127.0.0.1
// (the dev server, the assembled site in the e2e run) talks to a local backend;
// everything else talks to production. Ported from the legacy base.js.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export const backendBase: string = LOCAL_HOSTS.has(window.location.hostname)
  ? 'http://127.0.0.1:8001'
  : 'https://gemkom-backend-716746493353.europe-west3.run.app';
