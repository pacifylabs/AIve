import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Acceptable use', alternates: { canonical: '/acceptable-use' } };

export default function AcceptableUsePage() {
  return (
    <LegalPage title="Acceptable use policy">
      <p>
        Your staff write only to people you have a lawful reason to contact, never cold call, and stop the moment
        someone opts out. The full policy is published before launch.
      </p>
    </LegalPage>
  );
}
