import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';
let serverTimeOffset = 0;

/**
 * Syncs client time with server once by calculating the offset.
 */
export async function syncServerTime() {
  try {
    const response = await authedFetch(`${backendBase}/now/`);
    const data = await response.json();
    const serverTime = data.now;
    const clientTime = Date.now();
    serverTimeOffset = serverTime - clientTime;
  } catch (error) {
    console.error('Failed to sync server time, using client time.', error);
    serverTimeOffset = 0;
  }
}

/**
 * Returns current timestamp adjusted to server clock.
 * Use instead of Date.now()
 */
export function getSyncedNow() {
  return Date.now() + serverTimeOffset;
}