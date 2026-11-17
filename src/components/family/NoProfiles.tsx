import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { PageHeader, useDocumentTitle } from '../PageHeader';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { useProfileEditor } from './ProfileEditor';
import styles from './NoProfiles.module.css';

/** Shown on every page (except Settings) until the first family member is added. */
export function NoProfiles() {
  const { openNew } = useProfileEditor();
  useDocumentTitle('Add your family');

  return (
    <>
      <PageHeader title="Add your family" description="Start with yourself, then add the people you look after." />
      <Card>
        <EmptyState
          icon={<UserPlus />}
          title="No family members yet"
          action={
            <Button variant="primary" icon={<UserPlus />} onClick={openNew}>
              Add a family member
            </Button>
          }
        >
          Each person gets their own records, lab trends, medicines and emergency card.
        </EmptyState>
      </Card>
      <p className={styles.note}>
        Want to look around first? You can load the demo family from <Link to="/settings">Settings</Link>.
      </p>
    </>
  );
}
