import { ClipboardList, FlaskConical, IdCard, LayoutDashboard, Pill, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', short: 'Overview', icon: LayoutDashboard },
  { to: '/records', label: 'Records', short: 'Records', icon: ClipboardList },
  { to: '/labs', label: 'Lab trends', short: 'Labs', icon: FlaskConical },
  { to: '/medications', label: 'Medications', short: 'Meds', icon: Pill },
  { to: '/emergency', label: 'Emergency card', short: 'Card', icon: IdCard },
];

export const SETTINGS_ITEM: NavItem = { to: '/settings', label: 'Settings', short: 'Settings', icon: Settings };
