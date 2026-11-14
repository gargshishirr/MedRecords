import type { CSSProperties } from 'react';
import type { Profile } from '../../lib/types';
import { initials } from '../../lib/format';
import styles from './Avatar.module.css';

export function Avatar({ profile, size = 36 }: { profile: Pick<Profile, 'name' | 'hue'>; size?: number }) {
  return (
    <span
      className={styles.avatar}
      style={{ '--hue': profile.hue, '--size': `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {initials(profile.name)}
    </span>
  );
}
