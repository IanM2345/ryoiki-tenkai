'use client';

import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import styles from './ImagePicker.module.css';
import StoredImage from './StoredImage';

interface ImagePickerProps {
  /** Currently saved image URL (from DB) or null */
  value: string | null;
  /** Called when user picks a new file — gives you the File + a local preview URL */
  onChange: (file: File, preview: string) => void;
  /** Called when user clicks the remove button */
  onClear: () => void;
  /** Optional label shown above the picker */
  label?: string;
}

/**
 * Drop-in image picker for modals.
 * Shows a dashed upload zone when empty, a thumbnail with a remove button when filled.
 * Works with both existing DB URLs and fresh local file previews.
 */
export default function ImagePicker({ value, onChange, onClear, label }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    const preview = URL.createObjectURL(file);
    onChange(file, preview);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  return (
    <div className={styles.wrapper}>
      {label && <span className={styles.label}>{label}</span>}

      {value ? (
        <div className={styles.preview}>
          <StoredImage src={value} alt="Chosen image" className={styles.previewImg} loading="eager" />
          <button
            type="button"
            className={styles.clearBtn}
            onClick={onClear}
            aria-label="Remove image"
          >
            <X size={16} strokeWidth={2.25} />
          </button>
        </div>
      ) : (
        <div
          className={`${styles.dropZone} ${dragging ? styles.dropZoneOver : ''}`}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          aria-label="Upload image"
        >
          <span className={styles.dropIcon}><ImagePlus size={24} strokeWidth={1.75} /></span>
          <span className={styles.dropText}>Add a photo</span>
          <span className={styles.dropSub}>Click or drop an image here</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={handleInputChange}
      />
    </div>
  );
}