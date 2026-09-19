import Link from "next/link"
import { notFound } from "next/navigation"

import { LegalPage } from "@/components/legal-page"
import { legalDetails } from "@/lib/legal"

export const metadata = { title: "Privacy Policy" }

export default function PrivacyPage() {
  const legal = legalDetails()
  if (!legal) notFound()
  const mail = <a href={`mailto:${legal.contact}`}>{legal.contact}</a>

  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what personal information this Subcanvas service collects, why, and what you can do
        about it. The service is operated by {legal.operator} (&quot;we&quot;, &quot;us&quot;), who is the
        controller of that information. Questions and requests go to {mail}.
      </p>
      <p>
        The short version: we collect what is needed to run your account and your documents, we do not show ads,
        we do not use tracking or analytics scripts, and we do not sell or share your information for advertising.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>
          <strong>Account.</strong> Your email address, and a display name and profile picture if you add them. If
          you set a password, our authentication provider stores it only as a salted hash; we never see it.
        </li>
        <li>
          <strong>Sign-in with Google or GitHub.</strong> If you choose one of these, we receive your name, email
          address, and profile picture from that provider, and nothing else. See section 3.
        </li>
        <li>
          <strong>Your content.</strong> The whiteboards, documents, folders, projects, and orgs you create, and
          everything you put in them.
        </li>
        <li>
          <strong>Orgs and invitations.</strong> Which orgs you belong to, your role in each, and the email
          addresses of people you invite.
        </li>
        <li>
          <strong>Billing.</strong> If you subscribe, Stripe collects your payment details. We never receive your
          card number. We store the Stripe customer and subscription identifiers and the state of your plan.
        </li>
        <li>
          <strong>Reports.</strong> If you report a public project, the reason you give and, if you choose to
          leave it, your email address.
        </li>
        <li>
          <strong>Technical records.</strong> Our hosting providers log requests: IP address, browser type, the
          address requested, and the time. While you view a document, a random identifier that is not tied to
          your identity is kept briefly so that others can see how many people are watching.
        </li>
        <li>
          <strong>Cookies and local storage.</strong> Cookies that keep you signed in, and your light or dark theme
          choice stored in your browser. There are no advertising or analytics cookies.
        </li>
      </ul>

      <h2>2. How we use it</h2>
      <ul>
        <li>To run the service: sign you in, store and sync your content, and show it to the people you work with.</li>
        <li>To email you sign-in links, confirmations, password resets, invitations, and notices about the service or your plan.</li>
        <li>To take payment for paid plans.</li>
        <li>To keep the service secure, investigate abuse, and handle reports.</li>
        <li>To meet legal obligations.</li>
      </ul>
      <p>We do not use your content to train machine-learning models, and we do not send marketing email.</p>

      <h2>3. Information from Google</h2>
      <p>
        When you sign in with Google, we ask only for your basic profile: name, email address, and profile
        picture. We use it only to create your account, sign you in, and show your name and picture to the people
        you collaborate with. We do not request access to any other Google data. We do not use Google user data
        for advertising, do not sell it, and do not transfer it to anyone except the providers in section 4 as
        needed to run the service, or as the law requires. The same applies to sign-in with GitHub.
      </p>

      <h2>4. Who receives it</h2>
      <ul>
        <li>
          <strong>People you work with.</strong> Members of your orgs can see your name, email address, picture,
          and what you create and edit there, including your cursor while you work.
        </li>
        <li>
          <strong>The public,</strong> for projects you make public: anyone with the link can read everything in
          the project.
        </li>
        <li>
          <strong>Providers that run the service for us:</strong> Supabase (database, authentication, and
          real-time sync, hosted in the United States), Vercel (web hosting), Resend (sending email), Stripe
          (payments), and Cloudflare (domain name service). They process information on our instructions and
          under their own security and privacy commitments.
        </li>
        <li>
          <strong>Google or GitHub,</strong> if you sign in with them. They learn that you signed in to this
          service.
        </li>
        <li>
          <strong>Authorities or other parties,</strong> when the law requires it, or to protect someone&apos;s
          safety or our legal rights.
        </li>
      </ul>
      <p>We do not sell personal information, and we do not share it for cross-context behavioral advertising.</p>

      <h2>5. How long we keep it</h2>
      <p>
        We keep your account and content for as long as your account exists. Documents in the trash stay until
        they are deleted for good. When you ask us to delete your account, we delete your account information and
        the content of orgs that have no other members from the live service within 30 days, and from backups as
        they expire. Request logs are kept by our hosting providers for a limited time. We keep billing records
        as long as tax and accounting law requires.
      </p>

      <h2>6. Your choices and rights</h2>
      <p>
        You can see and change your content in the service at any time. Depending on where you live, you may also
        have the right to get a copy of your personal information, correct it, delete it, restrict or object to
        how we use it, and take it elsewhere. To use any of these rights, write to {mail}. We answer within 30
        days and will not treat you differently for asking. If you are in the European Economic Area or the
        United Kingdom, you can also complain to your data protection authority.
      </p>
      <p>
        For people in the European Economic Area and the United Kingdom, our legal bases are: performing our
        agreement with you (running your account and content), our legitimate interests (keeping the service
        secure and handling abuse), your consent where we ask for it, and legal obligations (billing records).
      </p>

      <h2>7. Where it is processed</h2>
      <p>
        The service and its providers operate in the United States, so your information is processed there. Where
        the law requires it, transfers from other regions rely on safeguards such as standard contractual clauses
        offered by our providers.
      </p>

      <h2>8. Security</h2>
      <p>
        Traffic is encrypted in transit, data is encrypted at rest by our database provider, and database rules
        limit each account to the orgs it belongs to. No system is perfectly secure. If a breach affects your
        information, we will tell you as the law requires.
      </p>

      <h2>9. Children</h2>
      <p>
        The service is not meant for children under 13, and we do not knowingly collect their information. If you
        believe a child has given us information, write to {mail} and we will delete it.
      </p>

      <h2>10. Self-hosted copies</h2>
      <p>
        Subcanvas is open source. This policy covers only this service. A copy that someone else runs is governed
        by their policy, and we receive no information from it.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update this policy. For a change that matters, we will tell you by email or in the service before
        it takes effect. The date at the top shows the latest version. See also the{" "}
        <Link href="/terms">Terms of Service</Link>.
      </p>

      <h2>12. Contact</h2>
      <p>
        {legal.operator}: {mail}
      </p>
    </LegalPage>
  )
}
