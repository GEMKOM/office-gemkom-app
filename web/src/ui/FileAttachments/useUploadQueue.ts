import { useCallback, useEffect, useRef, useState } from 'react';
import { formatFileSize } from '../files';
import { errorMessage } from '../notify';

/** Uploads one file. Report progress (0..1) if you can; reject to mark it failed. */
export type UploadFn = (
  file: File,
  context: { onProgress: (fraction: number) => void; signal: AbortSignal },
) => Promise<unknown>;

export interface UploadItem {
  key: string;
  file: File;
  /** 0..1 */
  progress: number;
  status: 'queued' | 'uploading' | 'error';
  error?: string;
}

export interface UploadResult {
  uploaded: number;
  failed: number;
}

export interface UploadQueueOptions {
  /** Bytes; a bigger file fails at once with a message instead of uploading. */
  maxSize?: number;
}

let nextKey = 0;

/**
 * Files on their way up, one at a time (as legacy uploaded them), each with
 * its own progress and, when it fails, its own error and a retry. A finished
 * file leaves the queue: the list it went into shows it from then on.
 */
export function useUploadQueue(upload: UploadFn, { maxSize }: UploadQueueOptions = {}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const uploadRef = useRef(upload);
  useEffect(() => {
    uploadRef.current = upload;
  });
  const controller = useRef<AbortController | null>(null);
  // Leaving the page stops what is still going up.
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );

  const patch = useCallback((key: string, change: Partial<UploadItem> | null) => {
    setItems((list) =>
      change === null
        ? list.filter((item) => item.key !== key)
        : list.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );
  }, []);

  const run = useCallback(
    async (batch: UploadItem[]): Promise<UploadResult> => {
      controller.current ??= new AbortController();
      const { signal } = controller.current;
      let uploaded = 0;
      let failed = 0;
      for (const item of batch) {
        if (signal.aborted) break;
        if (maxSize && item.file.size > maxSize) {
          patch(item.key, {
            status: 'error',
            error: `Dosya çok büyük (en fazla ${formatFileSize(maxSize)})`,
          });
          failed += 1;
          continue;
        }
        patch(item.key, { status: 'uploading', progress: 0, error: undefined });
        try {
          await uploadRef.current(item.file, {
            signal,
            onProgress: (fraction) =>
              patch(item.key, { progress: Math.max(0, Math.min(1, fraction)) }),
          });
          patch(item.key, null);
          uploaded += 1;
        } catch (error) {
          if (signal.aborted) break;
          patch(item.key, { status: 'error', error: errorMessage(error, 'Dosya yüklenemedi') });
          failed += 1;
        }
      }
      return { uploaded, failed };
    },
    [maxSize, patch],
  );

  /** Queue `files` and upload them; resolves when the batch is done. */
  const start = useCallback(
    (files: readonly File[]) => {
      const batch = files.map((file) => ({
        key: `upload-${(nextKey += 1)}`,
        file,
        progress: 0,
        status: 'queued' as const,
      }));
      setItems((list) => [...list, ...batch]);
      return run(batch);
    },
    [run],
  );

  const retry = useCallback(
    (key: string) => {
      const item = items.find((entry) => entry.key === key);
      return item ? run([item]) : Promise.resolve({ uploaded: 0, failed: 0 });
    },
    [items, run],
  );

  const dismiss = useCallback((key: string) => patch(key, null), [patch]);

  const busy = items.some((item) => item.status === 'uploading' || item.status === 'queued');
  return { items, start, retry, dismiss, busy };
}
