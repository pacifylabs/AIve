import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';
import { CONTACT } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Acceptable use',
  description:
    'What you and your AI staff may and may not do with AI as a Staff, and what happens when the rules are broken.',
  alternates: { canonical: '/acceptable-use' },
};

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable use policy"
      summary="The rules for everything you do with AI as a Staff and everything your staff do for you. They apply whatever a staff member's record, and they are part of our terms of service."
    >
      <LegalSection title="1. Contacting people">
        <ul>
          <li>
            Contact only people you have a lawful reason to contact. Do not buy, rent or scrape lists without one.
          </li>
          <li>
            Stop when someone says no. An opt-out on any channel ends contact for good, and you may not work around it,
            for example by adding the person again from another list.
          </li>
          <li>Say who you are. Emails must name your business and give a postal address.</li>
          <li>
            Do not cold call. When the phone line arrives, calls may go out only to people who have agreed to be called.
          </li>
          <li>Do not try to get around the daily sending limits, the warm-up of a new mailbox or the spending cap.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. What your staff may post or send">
        <p>Nothing you publish or send through the service may:</p>
        <ul>
          <li>be illegal, or promote illegal goods, services or activity;</li>
          <li>
            mislead people, such as false prices, invented reviews or testimonials, fake urgency, or health, money or
            legal claims you cannot back up;
          </li>
          <li>
            pretend to be another person or business, or hide that a message is automated when the law requires it;
          </li>
          <li>harass, threaten or abuse anyone, or attack people for who they are;</li>
          <li>include sexual content involving minors, or any sexual content in posts and messages to the public;</li>
          <li>use someone else&apos;s work, brand, picture or voice without permission;</li>
          <li>carry malware, phishing or links meant to deceive.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Businesses we do not serve">
        <p>
          You may not use the service to sell or promote weapons, illegal drugs, adult services, unlicensed gambling or
          lending, pyramid or multi-level schemes, or investments that promise returns.
        </p>
      </LegalSection>

      <LegalSection title="4. Networks and connected accounts">
        <ul>
          <li>Follow the rules of each network, mailbox and service you connect.</li>
          <li>Connect only accounts you own or are allowed to manage.</li>
          <li>Do not use staff to fake engagement, such as mass likes, follows or repeated identical replies.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. The service itself">
        <ul>
          <li>Do not probe, overload or break into the service, or try to reach another workspace&apos;s data.</li>
          <li>
            Do not try to get staff past their approval rules, for example with hidden instructions in a document or a
            message.
          </li>
          <li>Do not copy, resell or reverse-engineer the service.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. What we do when the rules are broken">
        <p>
          Depending on how serious it is, we may pause a staff member, stop a send, remove a connection, suspend the
          workspace or close it. Where we can, we tell you first and give you a chance to fix the problem. We report
          illegal content to the authorities when the law requires it. Our <Link href="/terms">terms of service</Link>{' '}
          explain the rest.
        </p>
        <p>
          To report misuse by a business using AI as a Staff, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
