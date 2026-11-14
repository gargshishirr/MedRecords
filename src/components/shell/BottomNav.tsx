import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './nav';
import styles from './BottomNav.module.css';

export function BottomNav() {
  return (
    <nav className={`${styles.bar} no-print`} aria-label="Main">
      <ul role="list" className={styles.list}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => [styles.link, isActive && styles.active].filter(Boolean).join(' ')}
              >
                <span className={styles.iconWrap}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className={styles.label}>{item.short}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
