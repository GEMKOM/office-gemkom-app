import { ActionIcon, NativeSelect, Stack, Text } from '@mantine/core';
import { useRef, useState } from 'react';
import { NCR_FILE_TYPE_OPTIONS, uploadNcrFile } from '@/api/quality-control/ncrs';
import { FaIcon, ModalSection } from '@/ui';
import { fileIcon, formatSize } from './ncrFiles';
import { numberedTitle } from './NcrPaperForm';
import classes from './ncrs.module.css';

// Port of ncrFileStager.js: files are picked (or dropped) and typed in the
// create / edit modal, then uploaded once the NCR is saved — a new NCR has no
// id to upload against until then.

export interface StagedFile {
  file: File;
  fileType: string;
}

const defaultFileType = (file: File) => (file.type.startsWith('image/') ? 'photo' : 'other');

export interface NcrFileStagerProps {
  staged: StagedFile[];
  onChange: (staged: StagedFile[]) => void;
  /** Already attached files (edit), shown read-only. */
  existingFiles?: { name: string; typeLabel: string }[];
}

export function NcrFileStager({ staged, onChange, existingFiles = [] }: NcrFileStagerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (files: FileList | null | undefined) => {
    const next = [...staged];
    for (const file of Array.from(files ?? [])) {
      const duplicate = next.some((s) => s.file.name === file.name && s.file.size === file.size);
      if (!duplicate) next.push({ file, fileType: defaultFileType(file) });
    }
    onChange(next);
  };

  return (
    <ModalSection title={numberedTitle(7, 'Ekler')}>
      <Stack gap="sm">
        {existingFiles.length ? (
          <div>
            <div className={classes.caption}>Mevcut ekler ({existingFiles.length})</div>
            <Stack gap={4}>
              {existingFiles.map((f, index) => (
                <div key={index} className={classes.fileRow}>
                  <FaIcon icon={fileIcon(f.name)} />
                  <span className={classes.fileName} title={f.name}>
                    {f.name}
                  </span>
                  <span className={classes.fileMeta}>{f.typeLabel}</span>
                </div>
              ))}
            </Stack>
            <Text size="xs" c="dimmed" mt={4}>
              Mevcut ekleri NCR detayındaki Ekler bölümünden silebilirsiniz.
            </Text>
          </div>
        ) : null}

        <div
          className={classes.drop}
          data-dragover={dragOver || undefined}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              input.current?.click();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            addFiles(event.dataTransfer?.files);
          }}
        >
          <FaIcon icon="fas fa-cloud-upload-alt" style={{ fontSize: 20 }} />
          <div>
            <strong>Dosyaları buraya sürükleyin</strong> veya seçin
          </div>
          <Text size="xs" c="dimmed">
            Fotoğraf, çizim, rapor… Birden fazla dosya eklenebilir. Kaydettiğinizde yüklenir.
          </Text>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            data-testid="ncr-stager-input"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              addFiles(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
          />
        </div>

        {staged.length ? (
          <div>
            <div className={classes.caption}>Yüklenecek dosyalar ({staged.length})</div>
            <Stack gap={4}>
              {staged.map((item, index) => (
                <div key={`${item.file.name}-${item.file.size}`} className={classes.fileRow}>
                  <FaIcon icon={fileIcon(item.file.name, item.file.type)} />
                  <span className={classes.fileName} title={item.file.name}>
                    {item.file.name}
                  </span>
                  <span className={classes.fileMeta}>{formatSize(item.file.size)}</span>
                  <NativeSelect
                    size="xs"
                    aria-label="Dosya türü"
                    data={NCR_FILE_TYPE_OPTIONS}
                    value={item.fileType}
                    onChange={(event) => {
                      const fileType = event.currentTarget.value;
                      onChange(staged.map((s, i) => (i === index ? { ...s, fileType } : s)));
                    }}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Kaldır"
                    title="Kaldır"
                    onClick={() => onChange(staged.filter((_, i) => i !== index))}
                  >
                    <FaIcon icon="fas fa-times" />
                  </ActionIcon>
                </div>
              ))}
            </Stack>
          </div>
        ) : null}
      </Stack>
    </ModalSection>
  );
}

/** Upload staged files one by one; never throws, so the caller can report partial success. */
export async function uploadStagedFiles(ncrId: number, staged: StagedFile[]) {
  let uploaded = 0;
  const failed: string[] = [];
  for (const { file, fileType } of staged) {
    try {
      await uploadNcrFile(ncrId, file, fileType);
      uploaded += 1;
    } catch (error) {
      console.error(`Error uploading ${file.name}:`, error);
      failed.push(file.name);
    }
  }
  return { uploaded, failed };
}
