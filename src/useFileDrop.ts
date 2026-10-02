import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  isFileDrag,
  validateFileSelection,
  type FileSelectionPolicy,
  type FileSelectionError,
} from './file-selection';

export { validateFileSelection, type FileSelectionError } from './file-selection';

interface FileDropOptions extends FileSelectionPolicy {
  disabled?: boolean;
  onFile: (file: File) => void;
  onError: (code: FileSelectionError) => void;
}

/** A drop surface is scoped to its element: no window-wide file interception or persistence. */
export function useFileDrop(options: FileDropOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const depth = useRef(0);
  const latest = useRef(options);
  latest.current = options;
  const reset = () => {
    depth.current = 0;
    setIsDragging(false);
  };
  useEffect(() => {
    if (options.disabled) {
      depth.current = 0;
      setIsDragging(false);
    }
  }, [options.disabled]);
  useEffect(() => {
    if (!isDragging) return;
    const end = () => {
      depth.current = 0;
      setIsDragging(false);
    };
    window.addEventListener('drop', end);
    window.addEventListener('dragend', end);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('drop', end);
      window.removeEventListener('dragend', end);
      window.removeEventListener('blur', end);
    };
  }, [isDragging]);
  const intercept = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event.dataTransfer)) return false;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = latest.current.disabled ? 'none' : 'copy';
    return true;
  };
  return {
    isDragging,
    dropProps: {
      onDragEnter: (event: DragEvent<HTMLElement>) => {
        if (!intercept(event) || latest.current.disabled) return;
        depth.current += 1;
        setIsDragging(true);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        intercept(event);
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!isFileDrag(event.dataTransfer) && !depth.current) return;
        event.stopPropagation();
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setIsDragging(false);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!intercept(event)) return;
        reset();
        if (latest.current.disabled) return;
        // A directory is not a supported file, even when the browser exposes a zero-byte File.
        const directory = Array.from(event.dataTransfer.items).some(
          (item) => item.kind === 'file' && item.webkitGetAsEntry?.()?.isDirectory
        );
        const result = directory
          ? 'directory'
          : validateFileSelection(event.dataTransfer.files, latest.current);
        if (typeof result === 'string') latest.current.onError(result);
        else latest.current.onFile(result);
      },
    },
  };
}
