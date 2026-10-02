export type FileSelectionError = 'multiple' | 'type' | 'size' | 'empty' | 'directory';

export interface FileSelectionPolicy {
  extensions: readonly string[];
  maxBytes: number;
}

/** Checks picker and drop input alike. File contents are still validated by the importer. */
export function validateFileSelection(
  files: ArrayLike<File>,
  { extensions, maxBytes }: FileSelectionPolicy
): File | FileSelectionError {
  if (!files.length) return 'directory';
  if (files.length !== 1) return 'multiple';
  const file = files[0];
  const suffix = file.name.split('.').pop()?.toLowerCase();
  if (
    !file.name.includes('.') ||
    !extensions.some((extension) => extension.replace(/^\./, '').toLowerCase() === suffix)
  )
    return 'type';
  if (file.size > maxBytes) return 'size';
  if (!file.size) return 'empty';
  return file;
}

/** Text, links and selections keep their native drag behavior. */
export function isFileDrag(data: Pick<DataTransfer, 'types' | 'items'>): boolean {
  return (
    Array.from(data.types).includes('Files') ||
    Array.from(data.items).some((item) => item.kind === 'file')
  );
}
