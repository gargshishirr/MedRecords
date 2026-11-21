import { useCallback, useEffect, useState } from 'react';
import type { Attachment } from '../../lib/types';
import {
  MAX_ATTACHMENTS,
  decryptFile,
  encryptFile,
  fileStore,
  isFileType,
  newFileId,
  prepareFile,
  requestPersistentStorage,
  toBlob,
} from '../../lib/files';
import { pluralize } from '../../lib/format';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';

export { MAX_ATTACHMENTS };

/** Checks, shrinks, encrypts and stores picked files, then adds them to a record. */
export function useAttachFiles() {
  const { ensureFileKey, addAttachments } = useStore();
  const { notify } = useToast();

  return useCallback(
    async (recordId: string, picked: File[], existing = 0): Promise<string[]> => {
      const errors: string[] = [];
      const room = Math.max(0, MAX_ATTACHMENTS - existing);
      if (picked.length > room) errors.push(`A record can hold up to ${MAX_ATTACHMENTS} files, so ${pluralize(picked.length - room, 'file')} were left out.`);
      const files = picked.slice(0, room);
      if (!files.length) return errors;
      if (!globalThis.crypto?.subtle) return [...errors, 'Files can only be saved when MedRecords is opened over HTTPS.'];

      const key = ensureFileKey();
      requestPersistentStorage();
      const added: Attachment[] = [];
      for (const file of files) {
        const prepared = await prepareFile(file);
        if (!prepared.ok) {
          errors.push(prepared.error);
          continue;
        }
        const { name, type, bytes } = prepared.file;
        const fileId = newFileId();
        try {
          await fileStore().put(fileId, await encryptFile(key, bytes, type));
          added.push({ name, sizeKb: Math.max(1, Math.round(bytes.byteLength / 1024)), fileId, type });
        } catch {
          errors.push(`${name} couldn't be saved. This browser's storage may be full.`);
        }
      }
      const accepted = added.length ? addAttachments(recordId, added) : [];
      const kept = new Set((accepted ?? []).map((a) => a.fileId));
      const unused = added.filter((a) => !kept.has(a.fileId)).map((a) => a.fileId!);
      if (unused.length) void fileStore().remove(unused).catch(() => undefined);
      // The app locked while files were being prepared: nothing was added, and no toast may show on the lock screen.
      if (accepted === null) return [];
      if (accepted.length < added.length) {
        errors.push(`A record can hold up to ${MAX_ATTACHMENTS} files, so ${pluralize(added.length - accepted.length, 'file')} were left out.`);
      }
      if (accepted.length) notify(`${pluralize(accepted.length, 'file')} added`);
      if (errors.length) notify(errors.length === 1 ? errors[0]! : `${pluralize(errors.length, 'file')} couldn't be added`, 'error');
      return errors;
    },
    [ensureFileKey, addAttachments, notify],
  );
}

export type FileUrlState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'missing' };

/** Decrypts a stored attachment into a temporary blob: URL, revoked when no longer needed. */
export function useFileUrl(attachment: Attachment | null): FileUrlState {
  const { data } = useStore();
  const fileKey = data.fileKey;
  const fileId = attachment?.fileId;
  const [state, setState] = useState<FileUrlState>({ status: 'loading' });

  useEffect(() => {
    if (!fileId || !fileKey) {
      setState({ status: 'missing' });
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    setState({ status: 'loading' });
    fileStore()
      .get(fileId)
      .then(async (stored) => {
        if (!stored || !isFileType(stored.type)) throw new Error('missing');
        const bytes = await decryptFile(fileKey, stored);
        if (cancelled) return;
        url = URL.createObjectURL(toBlob(bytes, stored.type));
        setState({ status: 'ready', url });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'missing' });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId, fileKey]);

  return state;
}
