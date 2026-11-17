import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom does not implement <dialog> modality; emulate the bits we rely on.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

// jsdom has no layout, so scrolling is a no-op.
if (typeof Element !== 'undefined') Element.prototype.scrollIntoView ??= function scrollIntoView() {};
if (typeof window !== 'undefined') window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  // Crypto tests run in the plain Node environment, which has no localStorage.
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
