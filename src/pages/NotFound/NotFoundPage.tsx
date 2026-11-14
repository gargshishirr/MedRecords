import { Compass } from 'lucide-react';
import { useDocumentTitle } from '../../components/PageHeader';
import { ButtonLink } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <Card>
      <h1 className="visually-hidden">Page not found</h1>
      <EmptyState
        icon={<Compass />}
        title="We couldn't find that page"
        action={
          <ButtonLink to="/" variant="primary">
            Back to overview
          </ButtonLink>
        }
      >
        The link may be out of date. Everything you need is in the sidebar, or press ⌘K to search.
      </EmptyState>
    </Card>
  );
}
