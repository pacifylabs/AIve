import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Terms', alternates: { canonical: '/terms' } };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>
        The terms that govern using AI as a Staff are published before launch. Joining early access does not commit you
        to anything.
      </p>
    </LegalPage>
  );
}
