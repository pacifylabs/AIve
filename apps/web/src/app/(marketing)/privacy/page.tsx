import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';
import { COMPANY, CONTACT } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What personal data AI as a Staff collects, why, who processes it, how long it is kept, and your rights.',
  alternates: { canonical: '/privacy' },
};

/** The services that process data for us, and what for. Keep this in step with the hosting set-up. */
const PROCESSORS = [
  ['Vercel', 'hosts the website and the app'],
  ['Render', 'runs the service behind the app and its short-term cache'],
  ['Neon', 'hosts the database'],
  ['Resend', 'sends our emails, such as sign-in codes and invitations'],
  ['Cloudinary', 'stores the pictures and videos you upload to your media library'],
  [
    'Anthropic and other AI providers',
    'produce your staff’s drafts and decisions from the content needed for each task',
  ],
  ['Paystack', 'handles payments, once paid plans start'],
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      summary="What we collect, why, who helps us process it, how long we keep it, and how to reach us about it. We do not sell personal data, and we do not use advertising trackers."
    >
      <LegalSection title="1. Who is responsible">
        <p>
          AI as a Staff is run by {COMPANY}. We decide how account data is used, such as your name and email, so we are
          its controller. The data your business brings or your staff handle, such as leads, messages and followers, is
          processed on your business&apos;s instructions, so we are its processor and your business is the controller.
          We follow the Nigeria Data Protection Act 2023 and, where they apply, the GDPR and UK GDPR.
        </p>
      </LegalSection>

      <LegalSection title="2. What we collect">
        <ul>
          <li>
            <strong>Early access:</strong> your email, and if you tell us, your website, the staff you are interested in
            and the first task you would hand over.
          </li>
          <li>
            <strong>Your account:</strong> name, email, a protected form of your password (never the password itself),
            two-factor settings, and the workspaces you belong to.
          </li>
          <li>
            <strong>Your business:</strong> the company record you confirm, including what we read from your public
            website when you ask us to fill it in for you.
          </li>
          <li>
            <strong>Connected accounts:</strong> the access tokens and mailbox passwords that let staff act for you,
            stored encrypted and never shown again.
          </li>
          <li>
            <strong>Work content:</strong> posts, drafts, media, comments, messages, emails, lead lists and the notes
            your staff keep about them.
          </li>
          <li>
            <strong>Activity:</strong> a record of who did what in your workspace and when, and technical logs such as
            IP address and browser, which keep the service secure.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Why we use it">
        <ul>
          <li>
            To run the service you signed up for, including the work your staff do for you (our contract with you).
          </li>
          <li>To keep accounts secure, stop abuse and honour opt-outs (our legitimate interests and legal duties).</li>
          <li>To email you about your account, such as sign-in codes, invitations and alerts that need you.</li>
          <li>
            To send early access members their invite and launch news (your consent, which you can withdraw at any time
            through the link in each email).
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. AI processing">
        <p>
          To draft and decide, your staff send the content each task needs, such as your confirmed facts and the message
          being answered, to an AI provider. We use providers under terms that do not let them train their models on
          that content. We keep prompts and model answers only as part of the work item or message they produced.
        </p>
      </LegalSection>

      <LegalSection title="5. Who processes it for us">
        <p>These services process data on our behalf, only to provide their part of the service:</p>
        <ul>
          {PROCESSORS.map(([name, role]) => (
            <li key={name}>
              <strong>{name}</strong> {role}.
            </li>
          ))}
        </ul>
        <p>
          The networks, mailboxes and other accounts you connect receive what your staff send there, under their own
          privacy terms. We share data with authorities only when the law requires it.
        </p>
      </LegalSection>

      <LegalSection title="6. Transfers outside Nigeria">
        <p>
          Some of these services store or process data outside Nigeria, including in the United States and the European
          Union. We use them only with safeguards the law recognises, such as contractual protections.
        </p>
      </LegalSection>

      <LegalSection title="7. How long we keep it">
        <ul>
          <li>Account data: while your account is open.</li>
          <li>Work content: while your workspace is open, then deleted within 30 days of it closing.</li>
          <li>Activity records: two years.</li>
          <li>Early access details: until you ask us to remove them.</li>
          <li>
            Opt-outs: kept as a scrambled form of the email address, so a person who asked not to be contacted stays
            that way.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="8. How we protect it">
        <p>
          Every record belongs to one workspace, and the database itself keeps workspaces apart. Connection tokens and
          mailbox passwords are encrypted. Sign-in uses cookies that page scripts cannot read. Our logs leave out
          passwords, tokens and message contents.
        </p>
      </LegalSection>

      <LegalSection title="9. Cookies and browser storage">
        <p>We use only what the service needs to work. There are no advertising or analytics trackers.</p>
        <ul>
          <li>Cookies that keep you signed in and remember the workspace you chose.</li>
          <li>A short-lived cookie for the two-factor step of sign-in.</li>
          <li>A cookie that remembers whether the app&apos;s side menu is open.</li>
          <li>
            Browser storage for your light or dark choice, and for unsent form drafts until you send or clear them.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="10. Your rights">
        <p>
          You can ask to see, correct, export or delete your personal data, object to how we use it, or withdraw
          consent. Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we reply within 30 days. If you are not happy
          with our answer, you can complain to the Nigeria Data Protection Commission or the data protection authority
          where you live.
        </p>
      </LegalSection>

      <LegalSection title="11. If a business contacted you through us">
        <p>
          If you received a post reply, email or message from a business that uses AI as a Staff, that business controls
          your data. Ask them first. Reply &ldquo;stop&rdquo; or use the unsubscribe link and contact ends at once. You
          can also email us and we will pass your request to them.
        </p>
      </LegalSection>

      <LegalSection title="12. Children">
        <p>
          The service is for businesses. It is not meant for anyone under 18, and we do not knowingly collect their
          data.
        </p>
      </LegalSection>

      <LegalSection title="13. Changes">
        <p>
          We update this policy when what we collect or who processes it changes, and change the date at the top. For a
          change that matters, we tell account holders by email first. Our <Link href="/terms">terms of service</Link>{' '}
          cover the rest of our agreement with you.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
