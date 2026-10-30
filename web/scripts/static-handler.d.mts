import type { IncomingMessage, ServerResponse } from 'node:http';

export interface StaticOptions {
  /** Gets the resolved file's path relative to the root, as segments; true makes it a 404. */
  isBlocked?: (relSegments: string[]) => boolean;
  /** Call next() for missing files and non-GET/HEAD requests instead of answering. */
  fallthrough?: boolean;
}

export type StaticResult =
  | { kind: 'file'; filePath: string; size: number; mtime: Date }
  | { kind: 'redirect'; location: string }
  | { kind: 'not-found' }
  | { kind: 'bad-request' };

export const CONTENT_TYPES: Record<string, string>;
export function contentTypeFor(filePath: string): string;
export function pathSegments(pathname: string): string[] | null;
export function resolveStatic(
  root: string,
  pathname: string,
  options?: StaticOptions,
): Promise<StaticResult>;
export function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: { filePath: string; size: number; mtime: Date },
  status?: number,
): void;
export function createStaticHandler(
  root: string,
  options?: StaticOptions,
): (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void;
