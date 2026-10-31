import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Privacy', alternates: { canonical: '/privacy' } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        If you join early access we keep your email, and the website, staff choice and first task you tell us. We use
        them only to send your invite and launch news.
      </p>
      <p>To be removed from the list, email us and we will delete your details.</p>
    </LegalPage>
  );
}
