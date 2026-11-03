import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Acceptable use policy', alternates: { canonical: '/acceptable-use' } };

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable use policy"
      updated="2026-11-02"
      intro={<p>The full policy is published before launch.</p>}
      sections={[
        {
          id: 'contact-rules',
          title: 'Who your staff may contact',
          body: (
            <p>
              Your staff write only to people you have a lawful reason to contact, never cold call, and stop the moment
              someone opts out.
            </p>
          ),
        },
      ]}
    />
  );
}
