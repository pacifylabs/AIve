import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Terms of service', alternates: { canonical: '/terms' } };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated="2026-11-02"
      intro={<p>The full terms that govern using AI as a Staff are published before launch.</p>}
      sections={[
        {
          id: 'early-access',
          title: 'Early access',
          body: <p>Joining early access does not commit you to anything, and you can leave the list at any time.</p>,
        },
      ]}
    />
  );
}
