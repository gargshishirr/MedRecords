import { useId, useRef, useState } from 'react';
import { CircleAlert, Download, ExternalLink, FileText, ImageOff, Paperclip, Plus, Trash2, X } from 'lucide-react';
import type { Attachment, HealthRecord } from '../../lib/types';
import { FILE_ACCEPT } from '../../lib/files';
import { formatFileSize } from '../../lib/format';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { Button, IconButton } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import buttonStyles from '../ui/Button.module.css';
import { MAX_ATTACHMENTS, useAttachFiles, useFileUrl } from './useFiles';
import styles from './Attachments.module.css';

const isImage = (a: Attachment) => !!a.fileId && a.type?.startsWith('image/');

function Thumb({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const file = useFileUrl(attachment);
  return (
    <button type="button" className={styles.thumb} onClick={onOpen} aria-label={`Open ${attachment.name}`}>
      {file.status === 'ready' ? (
        <img src={file.url} alt="" className={styles.thumbImg} />
      ) : (
        <span className={styles.thumbEmpty} aria-hidden="true">
          {file.status === 'missing' ? <ImageOff size={18} /> : null}
        </span>
      )}
    </button>
  );
}

function FileChip({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  return (
    <button type="button" className={styles.chip} onClick={onOpen}>
      <span className={styles.chipIcon} aria-hidden="true">
        <FileText size={16} />
      </span>
      <span className={styles.chipName}>{attachment.name}</span>
      <span className={styles.chipSize}>{attachment.fileId ? formatFileSize(attachment.sizeKb) : 'Name only'}</span>
    </button>
  );
}

function Viewer({
  attachment,
  onClose,
  onRemove,
}: {
  attachment: Attachment;
  onClose: () => void;
  onRemove: () => void;
}) {
  const file = useFileUrl(attachment);
  const [confirming, setConfirming] = useState(false);
  const linkClass = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={attachment.name}
      description={attachment.fileId ? formatFileSize(attachment.sizeKb) : undefined}
      footer={
        confirming ? (
          <div className={styles.confirm}>
            <p className={styles.confirmText}>Remove this file from the record?</p>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button variant="danger" icon={<Trash2 />} onClick={onRemove} autoFocus>
              Yes, remove
            </Button>
          </div>
        ) : (
          <>
            <Button variant="danger" icon={<Trash2 />} className={styles.footerStart} onClick={() => setConfirming(true)}>
              Remove
            </Button>
            {file.status === 'ready' && (
              <>
                {attachment.type === 'application/pdf' && (
                  <a className={linkClass} href={file.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={16} aria-hidden="true" /> Open
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                )}
                <a className={linkClass} href={file.url} download={attachment.name}>
                  <Download size={16} aria-hidden="true" /> Download
                </a>
              </>
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </>
        )
      }
    >
      {!attachment.fileId ? (
        <p className={styles.note}>Only the name of this file was saved (by an older version of MedRecords).</p>
      ) : file.status === 'loading' ? (
        <p className={styles.note}>Opening…</p>
      ) : file.status === 'missing' ? (
        <p className={styles.note}>This file couldn&apos;t be opened. It may have been removed from this browser.</p>
      ) : isImage(attachment) ? (
        <img src={file.url} alt={attachment.name} className={styles.viewerImg} />
      ) : (
        <div className={styles.pdf}>
          <FileText size={40} aria-hidden="true" />
          <p>PDF files open in your browser&apos;s viewer.</p>
        </div>
      )}
    </Dialog>
  );
}

/** Files on a record: photo thumbnails, PDFs, adding and removing. */
export function Attachments({ record }: { record: HealthRecord }) {
  const { removeAttachment } = useStore();
  const { notify } = useToast();
  const attach = useAttachFiles();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const uid = useId();
  const open = openIndex !== null ? record.attachments[openIndex] : undefined;
  const full = record.attachments.length >= MAX_ATTACHMENTS;

  const pick = async (list: FileList | null) => {
    const files = list ? [...list] : [];
    if (inputRef.current) inputRef.current.value = '';
    if (!files.length) return;
    setBusy(files.length);
    setErrors(await attach(record.id, files, record.attachments.length));
    setBusy(0);
  };

  const images = record.attachments.map((a, i) => ({ a, i })).filter(({ a }) => isImage(a));
  const others = record.attachments.map((a, i) => ({ a, i })).filter(({ a }) => !isImage(a));

  return (
    <section className={styles.section} aria-labelledby={`${uid}-title`}>
      <div className={styles.head}>
        <h3 id={`${uid}-title`} className={styles.title}>
          Files
        </h3>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Choose photos or PDFs"
          onChange={(e) => void pick(e.target.files)}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus />}
          disabled={busy > 0 || full}
          aria-busy={busy > 0 || undefined}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Adding…' : 'Add photo or PDF'}
        </Button>
      </div>

      <p className="visually-hidden" aria-live="polite">
        {busy ? `Adding ${busy} file${busy === 1 ? '' : 's'}` : ''}
      </p>

      {record.attachments.length === 0 && !busy ? (
        <p className={styles.empty}>
          <Paperclip size={14} aria-hidden="true" /> Add a photo of the report or prescription, or a PDF. Files are encrypted
          and stay on this device.
        </p>
      ) : (
        <>
          {images.length > 0 && (
            <ul role="list" className={styles.thumbs}>
              {images.map(({ a, i }) => (
                <li key={a.fileId ?? `${a.name}-${i}`}>
                  <Thumb attachment={a} onOpen={() => setOpenIndex(i)} />
                </li>
              ))}
            </ul>
          )}
          {others.length > 0 && (
            <ul role="list" className={styles.chips}>
              {others.map(({ a, i }) => (
                <li key={a.fileId ?? `${a.name}-${i}`}>
                  <FileChip attachment={a} onOpen={() => setOpenIndex(i)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {errors.length > 0 && (
        <div className={styles.errors} role="alert">
          <ul role="list">
            {errors.map((e) => (
              <li key={e}>
                <CircleAlert size={14} aria-hidden="true" /> {e}
              </li>
            ))}
          </ul>
          <IconButton label="Dismiss" onClick={() => setErrors([])}>
            <X />
          </IconButton>
        </div>
      )}

      {open && openIndex !== null && (
        <Viewer
          key={open.fileId ?? openIndex}
          attachment={open}
          onClose={() => setOpenIndex(null)}
          onRemove={() => {
            removeAttachment(record.id, openIndex);
            setOpenIndex(null);
            notify('File removed');
          }}
        />
      )}
    </section>
  );
}

/** Picks files for a record that hasn't been saved yet. */
export function FilePicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  return (
    <div className={styles.picker} role="group" aria-labelledby={`${uid}-label`}>
      <div className={styles.head}>
        <span id={`${uid}-label`} className={styles.pickerLabel}>
          Files <span className={styles.optional}>optional</span>
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Choose photos or PDFs"
          onChange={(e) => {
            const picked = e.target.files ? [...e.target.files] : [];
            e.target.value = '';
            onChange([...files, ...picked].slice(0, MAX_ATTACHMENTS));
          }}
        />
        <Button size="sm" variant="ghost" icon={<Paperclip />} onClick={() => inputRef.current?.click()}>
          Attach photo or PDF
        </Button>
      </div>
      {files.length > 0 ? (
        <ul role="list" className={styles.pending}>
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className={styles.pendingItem}>
              <FileText size={15} aria-hidden="true" />
              <span className={styles.chipName}>{f.name}</span>
              <IconButton label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                <X />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.hint}>A photo of the report or prescription. Encrypted and kept on this device.</p>
      )}
    </div>
  );
}
