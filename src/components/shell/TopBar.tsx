import { Link } from 'react-router-dom';
import { Moon, Plus, Search, Sun } from 'lucide-react';
import { useTheme } from '../../state/theme';
import { useStore } from '../../state/store';
import type { NavIntent } from '../../lib/hooks';
import { ButtonLink, IconButton } from '../ui/Button';
import { LogoMark } from '../Logo';
import { DemoBadge } from './DemoBadge';
import { ProfileSwitcher } from './ProfileSwitcher';
import styles from './TopBar.module.css';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { resolved, toggle } = useTheme();
  const { profile } = useStore();
  const nextTheme = resolved === 'dark' ? 'light' : 'dark';

  return (
    <header className={`${styles.topbar} no-print`}>
      <Link to="/" className={styles.mobileBrand} aria-label="MedRecords — Overview">
        <LogoMark size={30} />
      </Link>
      <div className={styles.mobileDemo}>
        <DemoBadge compact />
      </div>

      <button type="button" className={styles.search} onClick={onOpenPalette} aria-keyshortcuts="Meta+K Control+K">
        <Search size={17} aria-hidden="true" />
        <span className={styles.searchText}>Search records, labs, medications…</span>
        <kbd className={styles.kbd} aria-hidden="true">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>

      <div className={styles.actions}>
        <IconButton label="Search" className={styles.mobileSearch} onClick={onOpenPalette}>
          <Search />
        </IconButton>
        {profile && (
          <ButtonLink
            to="/records"
            state={{ add: true } satisfies NavIntent}
            variant="primary"
            size="sm"
            icon={<Plus />}
            className={styles.newRecord}
          >
            New record
          </ButtonLink>
        )}
        <IconButton label={`Switch to ${nextTheme} theme`} variant="outline" onClick={toggle} className={styles.theme}>
          {resolved === 'dark' ? <Sun /> : <Moon />}
        </IconButton>
        <div className={styles.mobileProfile}>
          <ProfileSwitcher variant="compact" />
        </div>
      </div>
    </header>
  );
}
