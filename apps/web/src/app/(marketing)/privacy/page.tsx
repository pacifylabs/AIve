import type { Metadata } from 'next';
import Link from 'next/link';
import { type LegalSection, LegalPage, Placeholder } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'What AI as a Staff collects, why, who processes it, how long it is kept, and the rights you have over it.',
  alternates: { canonical: '/privacy' },
};

const CONTACT = 'pacifylabs@gmail.com';
const UPDATED = '2026-11-02';

const SECTIONS: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          AI as a Staff is a product of Pacifylabs (<Placeholder>registered company name</Placeholder>,{' '}
          <Placeholder>registered address</Placeholder>, <Placeholder>company number</Placeholder>). In this policy
          &ldquo;we&rdquo;, &ldquo;us&rdquo; and &ldquo;our&rdquo; mean Pacifylabs.
        </p>
        <p>
          You can reach us about anything in this policy at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.{' '}
          <Placeholder>Data protection contact or representative in the EU and UK, if required</Placeholder>.
        </p>
      </>
    ),
  },
  {
    id: 'two-kinds-of-data',
    title: 'Two kinds of data, two roles',
    body: (
      <>
        <p>We handle personal data in two different ways, and the law treats them differently:</p>
        <ul>
          <li>
            <strong>Your account data.</strong> Who you are, how you sign in, your workspace settings and billing. We
            decide how this is used, so we are the <em>controller</em>.
          </li>
          <li>
            <strong>Data your staff handles for you.</strong> The leads, emails, comments, messages and calls your AI
            staff work with on your behalf. You decide who your staff contact and why, so you are the controller and we
            are your <em>processor</em>. We only use this data to do the work you ask for, under our{' '}
            <Placeholder>data processing agreement</Placeholder>.
          </li>
        </ul>
        <p>
          If you are someone a customer of ours contacted (for example, you received an email from their Sales Manager
          Staff), the business that contacted you is responsible for that contact. You can still write to us and we will
          pass your request on and help them act on it.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'What we collect',
    body: (
      <>
        <h3>When you visit the website</h3>
        <p>
          Our servers record standard request logs (address, browser, page and time) to keep the site running and
          secure. We do not use advertising trackers or third-party analytics on this site.
        </p>
        <h3>When you join early access</h3>
        <p>
          Your email address, and if you choose to give them: your company website, which staff you want, and what you
          would hand over first. We also use your network address for a short time to stop the form being abused (see{' '}
          <a href="#how-long">How long we keep it</a>).
        </p>
        <h3>When you have an account</h3>
        <ul>
          <li>Name, email address and a securely hashed password; your two-step sign-in secret if you turn it on.</li>
          <li>Your workspace: its name, timezone, country, members and their roles.</li>
          <li>
            Your company record: the website, summary, offers, prices and other facts you confirm, and the facts we read
            from your website for you to review.
          </li>
          <li>
            Connected accounts: the mailboxes and social accounts you connect. Their passwords and access tokens are
            encrypted and never shown again.
          </li>
          <li>What your staff do and what you decide: drafts, approvals, edits, rejections, and an activity log.</li>
          <li>
            Billing: your plan, invoices, and the reference our payment processor gives us. We never see or store your
            full card number.
          </li>
        </ul>
        <h3>Data your staff handles for you</h3>
        <p>
          Lead details you import or add (such as name, company, work email and website), notes researched from their
          public website, email conversations, social comments and messages on your connected accounts, and, if you use
          the phone line, call details, transcripts and recordings.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-use-it',
    title: 'How we use it, and why we are allowed to',
    body: (
      <>
        <p>
          Where data protection laws such as the GDPR, UK GDPR or Nigeria&rsquo;s NDPA apply, we rely on these legal
          bases:
        </p>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <caption className="sr-only">Purposes and legal bases</caption>
            <thead>
              <tr>
                <th scope="col">What we do</th>
                <th scope="col">Legal basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Send your early access invite and launch news</td>
                <td>Your consent, which you can withdraw at any time</td>
              </tr>
              <tr>
                <td>Run your account and do the work your staff are hired for</td>
                <td>Performing our contract with you</td>
              </tr>
              <tr>
                <td>Bill you and keep financial records</td>
                <td>Contract, and our legal obligations</td>
              </tr>
              <tr>
                <td>Keep the service secure, prevent spam and abuse, and fix problems</td>
                <td>Our legitimate interest in a safe, working service</td>
              </tr>
              <tr>
                <td>Send service messages (security alerts, billing notices, changes to terms)</td>
                <td>Contract, and our legitimate interest</td>
              </tr>
              <tr>
                <td>Process data your staff handles</td>
                <td>Your instructions as controller, under our data processing agreement</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>We do not sell personal data, and we do not use it for advertising.</p>
      </>
    ),
  },
  {
    id: 'ai-processing',
    title: 'How the AI uses your data',
    body: (
      <>
        <p>
          Your staff are powered by large language models. To write a draft or sort a reply, we send the model the task,
          your confirmed company facts, and the relevant text, such as a lead&rsquo;s public web page or the email they
          sent.
        </p>
        <ul>
          <li>
            Our model provider is Anthropic. We use it under commercial terms that do not allow it to train its models
            on what we send. <Placeholder>Link to and date of the provider terms we rely on</Placeholder>.
          </li>
          <li>
            We do not keep the prompts we send or the raw answers we get back. Only the result, such as the draft
            waiting for your approval, is stored.
          </li>
          <li>
            Text from outside your business (web pages, replies, comments) is treated as information, never as
            instructions, and nothing is sent or published unless it passes our checks and, while a task is on
            probation, a person approves it.
          </li>
          <li>
            We do not make decisions about people that have legal or similarly significant effects on them by automated
            means alone.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'calls',
    title: 'Phone calls and recordings',
    body: (
      <>
        <p>If you use the phone line for your Sales Manager Staff:</p>
        <ul>
          <li>Every call opens by saying the caller is speaking to an AI, and that the call may be recorded.</li>
          <li>If the caller objects to recording, recording stops and only a written summary is kept.</li>
          <li>
            Recordings are kept for 30 days by default. You can choose anything from 0 to 90 days, or turn transcripts
            off.
          </li>
          <li>
            Outbound calls only go to people who asked to be called, and we keep a record of that consent as evidence.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share it with',
    body: (
      <>
        <p>
          We share personal data only with service providers that help us run the product (our sub-processors), and only
          as much as each one needs:
        </p>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <caption className="sr-only">Sub-processors</caption>
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">What they do</th>
                <th scope="col">Where</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Anthropic</td>
                <td>Language models that write drafts and sort messages</td>
                <td>
                  <Placeholder>region</Placeholder>
                </td>
              </tr>
              <tr>
                <td>Paystack</td>
                <td>Card payments and subscriptions</td>
                <td>
                  <Placeholder>region</Placeholder>
                </td>
              </tr>
              <tr>
                <td>
                  <Placeholder>hosting provider</Placeholder>
                </td>
                <td>Servers, database and file storage</td>
                <td>
                  <Placeholder>region</Placeholder>
                </td>
              </tr>
              <tr>
                <td>
                  <Placeholder>email delivery provider</Placeholder>
                </td>
                <td>Our own account and service emails</td>
                <td>
                  <Placeholder>region</Placeholder>
                </td>
              </tr>
              <tr>
                <td>
                  <Placeholder>telephony, speech and video providers</Placeholder>
                </td>
                <td>Only if you use the phone line or video: calls, speech recognition, voices and video rendering</td>
                <td>
                  <Placeholder>region</Placeholder>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Your staff also send data to services you connect, such as your own mailbox, Facebook, Instagram, LinkedIn and
          X, when they publish or send on your behalf. Those services handle it under their own privacy policies.
        </p>
        <p>
          We may also disclose data if the law requires it, to protect people from harm, or as part of a sale or
          restructuring of our business, in which case this policy continues to apply to it.
        </p>
      </>
    ),
  },
  {
    id: 'transfers',
    title: 'International transfers',
    body: (
      <p>
        We serve businesses worldwide, so your data may be processed outside the country you are in. Where a transfer
        leaves the UK, the European Economic Area or Nigeria, we use the safeguards the law provides, such as the
        European Commission&rsquo;s standard contractual clauses and the UK addendum.{' '}
        <Placeholder>Confirm the transfer mechanism used with each sub-processor</Placeholder>.
      </p>
    ),
  },
  {
    id: 'how-long',
    title: 'How long we keep it',
    body: (
      <div className="legal-table-wrap">
        <table className="legal-table">
          <caption className="sr-only">Retention periods</caption>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">How long</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Early access sign-up</td>
              <td>Until launch and your invite, or until you ask us to remove it</td>
            </tr>
            <tr>
              <td>Network address used to stop form abuse</td>
              <td>About one hour</td>
            </tr>
            <tr>
              <td>Account, workspace, emails, messages and comments</td>
              <td>While your workspace is open, then deleted 30 days after it closes</td>
            </tr>
            <tr>
              <td>Lead research notes</td>
              <td>180 days</td>
            </tr>
            <tr>
              <td>Call recordings</td>
              <td>30 days by default (you can set 0 to 90 days)</td>
            </tr>
            <tr>
              <td>Activity and audit logs</td>
              <td>2 years</td>
            </tr>
            <tr>
              <td>Consent and do-not-contact records</td>
              <td>5 years after withdrawal, as evidence if a contact is disputed</td>
            </tr>
            <tr>
              <td>Invoices and billing records</td>
              <td>
                As long as tax law requires (<Placeholder>period by jurisdiction</Placeholder>)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: 'security',
    title: 'How we protect it',
    body: (
      <ul>
        <li>Every workspace&rsquo;s data is kept apart, enforced in the database itself as well as in the app.</li>
        <li>Connected account passwords and tokens are encrypted with AES-256.</li>
        <li>Passwords are stored only as secure hashes, and you can turn on two-step sign-in.</li>
        <li>Our logs never contain passwords, tokens, message bodies or AI prompts.</li>
        <li>Data is backed up daily, and we test restoring it.</li>
      </ul>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>Depending on where you live, you can ask us to:</p>
        <ul>
          <li>tell you what personal data we hold about you and give you a copy;</li>
          <li>correct it if it is wrong;</li>
          <li>delete it;</li>
          <li>limit or object to how we use it, including for marketing;</li>
          <li>send it to you or another provider in a usable format;</li>
          <li>withdraw consent you gave, at any time.</li>
        </ul>
        <p>
          Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from the address the request is about. We reply within one
          month and do not charge for it. If you ask us to stop contacting you, we keep a minimal record of that request
          so we can honour it.
        </p>
        <p>
          If you are in California, you also have the right to know, delete and correct, and the right not to be
          discriminated against for using them. We do not sell or share personal data for cross-context behavioural
          advertising.
        </p>
        <p>
          You can also complain to your data protection authority, for example the UK Information Commissioner&rsquo;s
          Office, your EU supervisory authority, or the Nigeria Data Protection Commission. We would like the chance to
          put things right first.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and local storage',
    body: (
      <>
        <p>We only use what the site needs to work:</p>
        <ul>
          <li>Sign-in cookies that keep you logged in to your account. They are secure and not readable by scripts.</li>
          <li>Your light or dark theme choice, saved in your own browser.</li>
        </ul>
        <p>
          We do not use advertising or tracking cookies. If that ever changes, we will update this policy and ask for
          your consent where the law requires it.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        AI as a Staff is a business service for people aged 18 and over. We do not knowingly collect data from children.
        If you think a child has given us their data, tell us and we will delete it.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        When we change this policy we update the date at the top. If a change matters, we tell account holders by email
        before it takes effect. Read it alongside our <Link href="/terms">terms of service</Link> and{' '}
        <Link href="/acceptable-use">acceptable use policy</Link>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated={UPDATED}
      sections={SECTIONS}
      intro={
        <p>
          This policy explains what we collect when you visit our site, join early access or use AI as a Staff, why we
          collect it, who processes it, how long we keep it, and the rights you have. The short version: we collect what
          the service needs, we never sell it, and the AI only works from facts you confirm.
        </p>
      }
    />
  );
}
