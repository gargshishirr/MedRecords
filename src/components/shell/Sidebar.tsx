import { Link, NavLink } from 'react-router-dom';
import { Logo, LogoMark } from '../Logo';
import { ProfileSwitcher } from './ProfileSwitcher';
import { DemoBadge } from './DemoBadge';
import { NAV_ITEMS, SETTINGS_ITEM } from './nav';
import type { NavItem } from './nav';
import styles from './Sidebar.module.css';

function SideLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => [styles.link, isActive && styles.active].filter(Boolean).join(' ')}
      title={item.label}
    >
      <Icon size={19} aria-hidden="true" />
      <span className={styles.label}>{item.label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <aside className={`${styles.sidebar} no-print`} aria-label="Sidebar">
      <Link to="/" className={styles.brand} aria-label="MedRecords — Overview">
        <span className={styles.logoFull}>
          <Logo />
        </span>
        <span className={styles.logoMark}>
          <LogoMark size={34} />
        </span>
      </Link>

      <div className={styles.profile}>
        <ProfileSwitcher />
      </div>

      <nav aria-label="Main" className={styles.nav}>
        <ul role="list" className={styles.list}>
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <SideLink item={item} />
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.bottom}>
        <ul role="list" className={styles.list}>
          <li>
            <SideLink item={SETTINGS_ITEM} />
          </li>
        </ul>
        <div className={styles.demo}>
          <DemoBadge />
        </div>
      </div>
    </aside>
  );
}
