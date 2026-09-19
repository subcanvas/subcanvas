import Link from "next/link"
import { notFound } from "next/navigation"

import { LegalPage } from "@/components/legal-page"
import { legalDetails } from "@/lib/legal"

export const metadata = { title: "Terms of Service" }

export default function TermsPage() {
  const legal = legalDetails()
  if (!legal) notFound()
  const mail = <a href={`mailto:${legal.contact}`}>{legal.contact}</a>

  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms are the agreement between you and {legal.operator} (&quot;we&quot;, &quot;us&quot;), who
        operates this Subcanvas service (the &quot;service&quot;). By creating an account or using the
        service you agree to them. If you use the service for a company or another organization, you agree on
        its behalf and confirm you are allowed to.
      </p>

      <h2>1. Your account</h2>
      <ul>
        <li>
          You must be at least 13 years old. Where the law requires an older age to agree to terms like these
          without a parent, you must be that age.
        </li>
        <li>Give an email address you control, and keep your password and sign-in links to yourself.</li>
        <li>You are responsible for what happens under your account, and for the people you invite to your org.</li>
        <li>Tell us at {mail} if you think someone else has used your account.</li>
      </ul>

      <h2>2. Your content</h2>
      <p>
        What you put into the service (whiteboards, documents, names, and everything in them) is yours. You give
        us permission to store it, copy it, and show it as needed to run the service for you: to you, to the
        members of your org, and, for a project you make public, to anyone with the link.
      </p>
      <p>
        A public project can be read by anyone on the internet. Do not make a project public if it holds anything
        confidential. You are responsible for your content and for having the right to put it here.
      </p>

      <h2>3. What you may not do</h2>
      <ul>
        <li>Break the law, or store or share content that is illegal where you or we are.</li>
        <li>Share content that infringes someone&apos;s copyright, trademark, or privacy.</li>
        <li>Harass, threaten, or impersonate anyone, or publish malware, phishing pages, or spam.</li>
        <li>Try to get into accounts, orgs, or data that are not yours, or probe the service for weaknesses without our written permission.</li>
        <li>Overload the service, scrape it in bulk, or work around its plan limits.</li>
      </ul>
      <p>
        We may remove content or suspend an account that breaks these rules. Anyone can report a public project
        with the Report button on it, or by writing to {mail}.
      </p>

      <h2>4. Copyright complaints</h2>
      <p>
        If you believe content on the service infringes your copyright, send a notice to {mail} with: the work
        you own, the address of the content here, your contact details, a statement that you believe in good faith
        the use is not authorized, a statement under penalty of perjury that the notice is accurate and that you
        are the owner or act for them, and your signature. We remove content when a notice is valid, tell the
        person who posted it, and close the accounts of people who infringe repeatedly.
      </p>

      <h2>5. Plans and payment</h2>
      <ul>
        <li>The free plan costs nothing. Its limits are shown in the service and may change.</li>
        <li>
          A paid plan is billed per editor, per month, in advance, through Stripe. It renews each month until you
          cancel. You can cancel at any time from Billing; the plan then runs to the end of the month you have
          paid for.
        </li>
        <li>Payments are not refunded for part of a month, except where the law gives you that right.</li>
        <li>We will tell you at least 30 days before a price increase takes effect for you.</li>
        <li>
          When a paid plan ends and an org has more editors than the free plan allows, the org becomes read-only
          after a grace period shown in the service, until it fits the free plan or subscribes again. Nothing is
          deleted because of this.
        </li>
      </ul>

      <h2>6. Open source</h2>
      <p>
        The Subcanvas software is open source under the GNU Affero General Public License, version 3. That license,
        not these terms, covers your use of the source code. These terms cover only this hosted service. A copy of
        Subcanvas that someone else runs is their service, under their terms.
      </p>

      <h2>7. Other services</h2>
      <p>
        Signing in with Google or GitHub, paying through Stripe, and following links in documents all involve
        services we do not run. Their terms apply to your use of them. How your data moves between us and them is
        described in the <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>8. Changes and availability</h2>
      <p>
        The service is young and changes often. We may add, change, or remove features, and the service may be
        unavailable at times. We aim to give reasonable notice before removing something people rely on. Keep your
        own copies of anything you cannot afford to lose.
      </p>

      <h2>9. Ending the agreement</h2>
      <p>
        You can stop using the service at any time, and you can ask us to delete your account at {mail}. We may
        suspend or close an account that breaks these terms, or that puts the service or other people at risk;
        where we reasonably can, we warn you first and give you a chance to take your content with you. When an
        account or an org is deleted, its content is deleted from the live service within 30 days and from
        backups as they expire.
      </p>

      <h2>10. No warranty</h2>
      <p>
        The service is provided &quot;as is&quot; and &quot;as available&quot;. To the fullest extent the law
        allows, we make no warranties, express or implied, including of merchantability, fitness for a particular
        purpose, and non-infringement. We do not promise that the service will be uninterrupted, error-free, or
        that content will never be lost.
      </p>

      <h2>11. Limit of liability</h2>
      <p>
        To the fullest extent the law allows, we are not liable for indirect, incidental, special, consequential,
        or punitive damages, or for lost profits, revenue, or data. Our total liability for all claims about the
        service is limited to the greater of what you paid us in the 12 months before the claim and 100 US
        dollars. Some places do not allow these limits, so they may not all apply to you.
      </p>

      <h2>12. If your use causes a claim</h2>
      <p>
        If someone brings a claim against us because of your content or because you broke these terms, you will
        cover our reasonable costs and losses from that claim, to the extent the law allows.
      </p>

      <h2>13. Governing law</h2>
      <p>
        The laws of the State of {legal.governingLaw}, USA, govern these terms, without regard to its rules on
        conflicts of law. Disputes will be heard in the state or federal courts located in {legal.governingLaw},
        and you and we accept their jurisdiction. If you are a consumer, this does not take away protections that
        the law of the place where you live gives you and that cannot be waived.
      </p>

      <h2>14. Changes to these terms</h2>
      <p>
        We may update these terms. For a change that matters, we will tell you by email or in the service at
        least 30 days before it takes effect. If you keep using the service after that, you accept the new terms.
        If any part of these terms cannot be enforced, the rest still applies.
      </p>

      <h2>15. Contact</h2>
      <p>
        {legal.operator}: {mail}
      </p>
    </LegalPage>
  )
}
