import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronsUpDown, Settings } from 'lucide-react';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { ageInYears } from '../../lib/date';
import { Avatar } from '../ui/Avatar';
import styles from './ProfileSwitcher.module.css';

/** Disclosure menu for switching between family profiles. */
export function ProfileSwitcher({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const { data, profile, now, setActiveProfile } = useStore();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (id: string) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (id === profile.id) return;
    setActiveProfile(id);
    const next = data.profiles.find((p) => p.id === id);
    if (next) notify(`Now viewing ${next.name}`, 'info');
  };

  return (
    <div className={styles.root} data-variant={variant} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${profile.name} (${profile.relation}). Switch profile`}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar profile={profile} size={variant === 'compact' ? 34 : 38} />
        {variant === 'full' && (
          <>
            <span className={styles.who}>
              <span className={styles.name}>{profile.name}</span>
              <span className={styles.meta}>
                {profile.relation} · {ageInYears(profile.dob, now)} yrs
              </span>
            </span>
            <ChevronsUpDown size={16} className={styles.chevron} aria-hidden="true" />
          </>
        )}
      </button>

      <div id={menuId} className={styles.menu} hidden={!open} role="group" aria-label="Family profiles">
        <p className={styles.menuTitle}>Family profiles</p>
        <ul role="list" className={styles.list}>
          {data.profiles.map((p) => {
            const active = p.id === profile.id;
            return (
              <li key={p.id}>
                <button type="button" className={styles.option} aria-pressed={active} onClick={() => choose(p.id)}>
                  <Avatar profile={p} size={32} />
                  <span className={styles.who}>
                    <span className={styles.name}>{p.name}</span>
                    <span className={styles.meta}>
                      {p.relation} · {ageInYears(p.dob, now)} yrs · {p.bloodGroup}
                    </span>
                  </span>
                  {active && <Check size={16} className={styles.check} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
        {variant === 'compact' && (
          <Link to="/settings" className={styles.menuLink} onClick={() => setOpen(false)}>
            <Settings size={16} aria-hidden="true" />
            Settings
          </Link>
        )}
      </div>
    </div>
  );
}
