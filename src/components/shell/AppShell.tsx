import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { CommandPalette } from '../CommandPalette';
import styles from './AppShell.module.css';

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const firstRender = useRef(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Move focus to the main region on route changes so keyboard and screen
  // reader users land at the start of the new page.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <div className={styles.shell}>
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          // HashRouter owns the URL hash, so move focus manually.
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to main content
      </a>
      <Sidebar />
      <div className={styles.column}>
        <TopBar onOpenPalette={openPalette} />
        <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
          <div key={location.pathname} className={`${styles.page} page-enter`}>
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
}
