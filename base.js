export const proxyBase = 'https://gemkom-backend-716746493353.europe-west3.run.app/jira/proxy/?url=';
export const backendBase =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000"
    : "https://gemkom-backend-716746493353.europe-west3.run.app";

export const jiraBase = 'https://gemkom-1.atlassian.net';