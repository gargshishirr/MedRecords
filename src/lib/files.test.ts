// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  collectBackupFiles,
  collectGarbage,
  decryptFile,
  encryptFile,
  isFileKey,
  memoryFileStore,
  newFileKey,
  relinkAttachments,
  restoreBackupFiles,
  sniffType,
} from './files';
import { createBackup, readBackup } from './backup';
import { validateAppData } from './validate';
import { MAX_ATTACHMENTS } from './files';
import { toBase64 } from './crypto';
import { addAttachments } from './store';
import { createSeedData } from './seed';

const now = new Date(2026, 10, 14, 16, 0);
const pdf = () => new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');

describe('attached files', () => {
  it('recognises allowed files by their bytes, not their names', () => {
    expect(sniffType(pdf())).toBe('application/pdf');
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffType(new TextEncoder().encode('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it('encrypts files so they only open with the right key', async () => {
    const key = newFileKey();
    expect(isFileKey(key)).toBe(true);
    const stored = await encryptFile(key, pdf(), 'application/pdf');
    expect(sniffType(new Uint8Array(stored.ct))).toBeNull();
    expect(new TextDecoder('latin1').decode(stored.ct)).not.toContain('%PDF');
    expect(await decryptFile(key, stored)).toEqual(pdf());
    await expect(decryptFile(newFileKey(), stored)).rejects.toThrow();
  });

  it('carries files through a backup and re-encrypts them with a new key', async () => {
    const store = memoryFileStore();
    const fileKey = newFileKey();
    await store.put('f-1', await encryptFile(fileKey, pdf(), 'application/pdf'));
    const seed = createSeedData(now);
    const data = {
      ...addAttachments(seed, seed.records[0]!.id, [{ name: 'report.pdf', sizeKb: 1, fileId: 'f-1', type: 'application/pdf' }]),
      fileKey,
    };

    const files = await collectBackupFiles(store, data);
    const text = await createBackup(data, undefined, files);
    expect(text).not.toContain(fileKey);
    const read = readBackup(text, now);
    if (read.kind !== 'plain') throw new Error('expected a plain backup');
    expect(read.data.fileKey).toBeUndefined();
    expect(read.files.map((f) => f.id)).toEqual(['f-1']);

    // Restoring into the same browser must not touch the file the current data still uses.
    const restored = await restoreBackupFiles(store, read.files);
    expect(restored.fileKey).not.toBe(fileKey);
    const newId = restored.ids.get('f-1')!;
    expect(newId).not.toBe('f-1');
    expect(await decryptFile(restored.fileKey, (await store.get(newId))!)).toEqual(pdf());
    expect(await decryptFile(fileKey, (await store.get('f-1'))!)).toEqual(pdf());
    const relinked = relinkAttachments(read.data, restored.ids);
    expect(relinked.records[0]!.attachments[0]!.fileId).toBe(newId);
  });

  it('skips backup files whose bytes are not what they claim to be', async () => {
    const html = toBase64(new TextEncoder().encode('<html><script>alert(1)</script></html>'));
    const store = memoryFileStore();
    const { ids } = await restoreBackupFiles(store, [{ id: 'f-x', name: 'x.pdf', type: 'application/pdf', data: html }]);
    expect(ids.size).toBe(0);
    expect(await store.list()).toEqual([]);
  });

  it('turns attachments whose file is missing from a backup into name-only entries', () => {
    const seed = createSeedData(now);
    const data = addAttachments(seed, seed.records[0]!.id, [{ name: 'lost.pdf', sizeKb: 3, fileId: 'f-lost', type: 'application/pdf' }]);
    const read = readBackup(JSON.stringify(data), now);
    if (read.kind !== 'plain') throw new Error('expected a plain backup');
    expect(read.data.records.find((r) => r.id === seed.records[0]!.id)!.attachments).toEqual([{ name: 'lost.pdf', sizeKb: 3 }]);
  });

  it('never lets a record hold more files than the limit, even from imported data', () => {
    const seed = createSeedData(now);
    const id = seed.records[0]!.id;
    const many = Array.from({ length: 25 }, (_, i) => ({ name: `p${i}.jpg`, sizeKb: 1, fileId: `f-${i}`, type: 'image/jpeg' }));
    const data = addAttachments(seed, id, many);
    expect(data.records[0]!.attachments).toHaveLength(MAX_ATTACHMENTS);
    const raw = JSON.parse(JSON.stringify(seed));
    raw.records[0].attachments = many;
    const result = validateAppData(raw, now);
    expect(result.ok && result.data.records[0]!.attachments).toHaveLength(MAX_ATTACHMENTS);
  });

  it('cleans up unused files but keeps ones another tab may still be saving', async () => {
    const store = memoryFileStore();
    const key = newFileKey();
    const t = now.getTime();
    await store.put('used', await encryptFile(key, pdf(), 'application/pdf', t - 3_600_000));
    await store.put('old', await encryptFile(key, pdf(), 'application/pdf', t - 3_600_000));
    await store.put('new', await encryptFile(key, pdf(), 'application/pdf', t - 1_000));
    expect(await collectGarbage(store, new Set(['used']), t)).toBe(1);
    expect((await store.list()).map((f) => f.id).sort()).toEqual(['new', 'used']);
  });
});
