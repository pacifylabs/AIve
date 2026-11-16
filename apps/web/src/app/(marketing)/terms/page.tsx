import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';
import { COMPANY, CONTACT } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms',
  description: `The terms for using AI as a Staff, the AI staff service run by ${COMPANY}.`,
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      summary="The agreement between your business and us when you use AI as a Staff. In short: your staff work for you, you stay in charge of what they send, and you can leave whenever you like."
    >
      <LegalSection title="1. Who we are">
        <p>
          AI as a Staff is run by {COMPANY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). These terms apply when you or anyone
          in your workspace uses the website, the app or the API (together, &ldquo;the service&rdquo;). By creating an
          account you agree to them on behalf of the business you name in your workspace.
        </p>
      </LegalSection>

      <LegalSection title="2. The service">
        <p>
          You hire AI staff (today, Social Media Staff and Sales Manager Staff) that draft work for your business. New
          staff start on probation: everything they make waits for your approval. You can promote a staff member to act
          on its own for a type of task once it has a clean record, and demote it at any time.
        </p>
        <p>
          The service is in early access. Features may change, and some are not available yet, such as the phone line
          and short videos. We describe what is available in the app, and we tell you before we remove something you
          rely on.
        </p>
      </LegalSection>

      <LegalSection title="3. Your account">
        <ul>
          <li>You must be at least 18 and use the service for a business, not as a consumer.</li>
          <li>Give accurate details, keep your password and sign-in codes private, and tell us about any misuse.</li>
          <li>
            The workspace owner decides who joins the workspace and is responsible for what its members and staff do.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. You stay responsible for what your staff do">
        <p>Your staff act for your business. That means you are responsible for:</p>
        <ul>
          <li>
            The facts you confirm in your company record. Staff use only confirmed facts, so check prices, offers and
            claims before you confirm them.
          </li>
          <li>Everything you approve, and the tasks you allow a promoted staff member to do on its own.</li>
          <li>
            Having a lawful reason to contact every person in the lists you add, and following the email, marketing and
            data laws that apply to you and to them.
          </li>
          <li>
            Following the rules of each network, mailbox or other account you connect, and our{' '}
            <Link href="/acceptable-use">acceptable use policy</Link>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Connected accounts">
        <p>
          When you connect a social account, a mailbox or another service, you allow us to read from it and act in it on
          your behalf, within the permissions you grant and the rules in the app. You can disconnect it at any time,
          from the app or from that service. Those services have their own terms, and we are not responsible for how
          they work or for changes they make.
        </p>
      </LegalSection>

      <LegalSection title="6. AI-made work">
        <p>
          Staff use AI models to write and decide. Their work can be wrong, incomplete or not what you meant, even when
          it follows your facts. Review what you approve. We do not promise particular results, such as reach, replies
          or sales.
        </p>
      </LegalSection>

      <LegalSection title="7. Fees">
        <p>
          Early access is free. Paid plans start at launch. Before we charge you anything, we show the plan, the price
          and what is included, and you choose whether to subscribe. Payments are handled by Paystack. Each plan has a
          monthly spending cap you set; when it is reached, staff pause until you raise it or the next month begins.
          Prices exclude any taxes that apply. Unless the law says otherwise, fees already paid are not refunded, but
          you can cancel before the next billing date.
        </p>
      </LegalSection>

      <LegalSection title="8. Your content">
        <p>
          You own what you bring to the service and what your staff make for you: your company record, posts, media,
          messages and lead lists. You give us permission to store, process and send that content only to run the
          service for you, including sending it to the AI providers that produce your staff&apos;s work. How we handle
          personal data is set out in our <Link href="/privacy">privacy policy</Link>. A data processing agreement is
          available on request.
        </p>
      </LegalSection>

      <LegalSection title="9. Our service">
        <p>
          We own the service, its software and its design. You may not copy, resell or reverse-engineer it, or use it to
          build a competing product. If you send us feedback, we may use it without owing you anything.
        </p>
      </LegalSection>

      <LegalSection title="10. Suspension and closing your account">
        <p>
          You can stop using the service and ask us to close your workspace at any time. We may pause staff, suspend or
          close a workspace that breaks these terms or the acceptable use policy, puts others at risk, or goes unpaid.
          Where we can, we warn you first and give you a chance to fix the problem. When a workspace closes, we delete
          its content within 30 days, except records the law requires us to keep and opt-out records we keep so people
          who asked not to be contacted stay that way.
        </p>
      </LegalSection>

      <LegalSection title="11. Availability">
        <p>
          We work to keep the service running and your data safe, but we provide it &ldquo;as is&rdquo; and cannot
          promise it will always be available or free of errors, especially during early access. Connected networks and
          AI providers can be unavailable or change without notice.
        </p>
      </LegalSection>

      <LegalSection title="12. Liability">
        <p>
          To the extent the law allows, we are not liable for indirect or consequential losses, such as lost profits,
          lost data or harm to reputation, and our total liability for any claim is limited to the fees you paid us in
          the 12 months before it arose, or USD 100 if that is more. Nothing in these terms limits liability that the
          law does not allow to be limited.
        </p>
        <p>
          You agree to cover our reasonable losses if a claim is brought against us because of your content, the people
          you contacted, or your breach of these terms.
        </p>
      </LegalSection>

      <LegalSection title="13. Changes to these terms">
        <p>
          We may update these terms as the service grows. For a change that matters, we tell the workspace owner by
          email or in the app at least 14 days before it takes effect. If you keep using the service after that, the new
          terms apply.
        </p>
      </LegalSection>

      <LegalSection title="14. Governing law">
        <p>
          These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Nigeria decide any
          dispute about them. Before going to court, email us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will
          try to settle it with you first.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
