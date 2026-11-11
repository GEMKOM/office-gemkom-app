import { FileInput, type FileInputProps } from '@mantine/core';
import { useUncontrolled } from '@mantine/hooks';
import type { ReactNode } from 'react';
import { FileDropTarget } from './FileDropTarget';

export type FileDropInputProps<Multiple extends boolean = false> = FileInputProps<Multiple> & {
  /** Shown over the input while files are dragged onto it. */
  dropLabel?: ReactNode;
};

type ValueOf<Multiple extends boolean> = Multiple extends true ? File[] : File | null;

/**
 * Mantine's FileInput that also takes dropped files: a drop sets the value the
 * way picking does (all files when `multiple`, else the first), honouring
 * `accept`. Same props, so `{...form.getInputProps('file')}` works unchanged.
 */
export function FileDropInput<Multiple extends boolean = false>({
  value,
  defaultValue,
  onChange,
  multiple,
  accept,
  disabled,
  readOnly,
  placeholder,
  dropLabel,
  ...rest
}: FileDropInputProps<Multiple>) {
  const [current, setCurrent] = useUncontrolled<ValueOf<Multiple>>({
    value: value as ValueOf<Multiple> | undefined,
    defaultValue: defaultValue as ValueOf<Multiple> | undefined,
    finalValue: (multiple ? [] : null) as ValueOf<Multiple>,
    onChange,
  });

  return (
    <FileDropTarget
      multiple={!!multiple}
      accept={accept}
      disabled={!!disabled || !!readOnly}
      label={dropLabel}
      onFiles={(files) =>
        setCurrent((multiple ? files : (files[0] ?? null)) as unknown as ValueOf<Multiple>)
      }
    >
      <FileInput<Multiple>
        {...rest}
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={
          placeholder ??
          (multiple
            ? 'Dosyaları buraya sürükleyin veya seçmek için tıklayın'
            : 'Dosyayı buraya sürükleyin veya seçmek için tıklayın')
        }
        value={current}
        onChange={setCurrent}
      />
    </FileDropTarget>
  );
}
