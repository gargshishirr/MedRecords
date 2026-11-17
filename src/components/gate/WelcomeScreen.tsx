import { useEffect, useId } from 'react';
import type { ReactNode } from 'react';
import { HardDrive, Info, LockKeyhole, ShieldCheck, Sparkles, Stethoscope, UserPlus } from 'lucide-react';
import { useVault } from '../../state/store';
import { Logo } from '../Logo';
import styles from './Gate.module.css';

function Choice({
  icon,
  title,
  text,
  primary,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  primary?: boolean;
  onClick: () => void;
}) {
  const id = useId();
  return (
    <button
      type="button"
      className={styles.choice}
      data-primary={primary || undefined}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      onClick={onClick}
    >
      <span className={styles.choiceIcon} aria-hidden="true">
        {icon}
      </span>
      <span id={`${id}-title`} className={styles.choiceTitle}>
        {title}
      </span>
      <span id={`${id}-text`} className={styles.choiceText}>
        {text}
      </span>
    </button>
  );
}

/** First visit: try the fictional demo family, or start with an empty record book. */
export function WelcomeScreen() {
  const { chooseDemo, chooseFresh, notice } = useVault();

  useEffect(() => {
    document.title = 'Welcome · MedRecords';
  }, []);

  return (
    <main className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.head}>
          <Logo />
          <h1 className={`${styles.title} display`}>Your family&apos;s health, in one calm place.</h1>
          <p className={styles.lead}>
            Keep visits, lab results, medicines and an emergency card for everyone in your family. Everything stays in this
            browser.
          </p>
        </div>

        {notice && (
          <p className={styles.notice} role="status">
            <Info size={16} aria-hidden="true" />
            {notice}
          </p>
        )}

        <div className={styles.choices}>
          <Choice
            icon={<Sparkles />}
            title="Try the demo"
            text="Look around with a fictional family: Riya, Meera and Kabir."
            onClick={chooseDemo}
          />
          <Choice
            icon={<UserPlus />}
            title="Start fresh"
            text="Add your own family. Nothing is filled in for you."
            primary
            onClick={chooseFresh}
          />
        </div>

        <ul role="list" className={styles.points}>
          <li>
            <HardDrive size={15} aria-hidden="true" />
            No account and no server. Your data never leaves this device.
          </li>
          <li>
            <LockKeyhole size={15} aria-hidden="true" />
            Lock it with a passcode in Settings to encrypt it on this device.
          </li>
          <li>
            <ShieldCheck size={15} aria-hidden="true" />
            You can switch between the demo and your own data later in Settings.
          </li>
          <li>
            <Stethoscope size={15} aria-hidden="true" />
            MedRecords is not a medical device and does not give medical advice.
          </li>
        </ul>
      </div>
    </main>
  );
}
