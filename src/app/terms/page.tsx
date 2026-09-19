import Link from "next/link"
import { notFound } from "next/navigation"

import { LegalAttribution, LegalPage } from "@/components/legal-page"
import { legalDetails } from "@/lib/legal"

export const metadata = { title: "Terms of Service" }

// Adapted from the Basecamp open-source policies (CC BY 4.0). Their wording is
// kept wherever it applies; the liability clause is theirs word for word.
// Sections marked "ours" have no counterpart there: eligibility, public
// projects, open source, and governing law.
export default function TermsPage() {
  const legal = legalDetails()
  if (!legal) notFound()
  const mail = <a href={`mailto:${legal.contact}`}>{legal.contact}</a>

  return (
    <LegalPage title="Terms of Service">
      <p>
        Thank you for using Subcanvas. Because we don&apos;t know every one of our users personally, we have to
        put in place some Terms of Service to help keep the ship afloat.
      </p>
      <p>
        When we say &quot;we&quot;, &quot;our&quot;, or &quot;us&quot; in this document, we are referring to{" "}
        {legal.operator}, who operates this service. When we say &quot;Services&quot;, we mean this website and
        the Subcanvas application delivered through it. When we say &quot;you&quot; or &quot;your&quot;, we are
        referring to the people or organizations that own an account or an org on the Services.
      </p>
      <p>
        We may update these Terms of Service (&quot;Terms&quot;) in the future. Whenever we make a significant
        change, we will refresh the date at the top of this page and take any other appropriate steps to notify
        account holders.
      </p>
      <p>
        When you use our Services, now or in the future, you are agreeing to the latest Terms. There may be times
        where we do not exercise or enforce a right or provision of the Terms; however, that does not mean we are
        waiving that right or provision. <strong>These Terms do contain a limitation of our liability.</strong>
      </p>
      <p>
        If you violate any of the Terms, we may terminate your account. That&apos;s a broad statement and it means
        you need to place a lot of trust in us. We do our best to deserve that trust by being open about how the
        Services work (the source code is public) and keeping an open door to your feedback at {mail}.
      </p>

      <h2>Account Terms</h2>
      <ul>
        {/* Ours: Basecamp's terms set no age. */}
        <li>
          You must be at least 13 years old to use the Services. Where the law requires an older age to agree to
          terms like these without a parent or guardian, you must be that age.
        </li>
        <li>
          You are responsible for maintaining the security of your account and password and for ensuring that any
          of your users do the same. We cannot and will not be liable for any loss or damage from your failure to
          comply with this security obligation.
        </li>
        <li>
          You may not use the Services for any purpose outlined in the <a href="#use-restrictions">Use Restrictions</a>{" "}
          below, and you may not permit any of your users to do so, either.
        </li>
        <li>
          You are responsible for all content posted to and activity that occurs under your account, including
          content posted by and activity of any users in your org.
        </li>
        <li>You must be a human. Accounts registered by &quot;bots&quot; or other automated methods are not permitted.</li>
      </ul>

      <h2 id="use-restrictions">Use Restrictions</h2>
      <p>When you use the Services, you acknowledge that you may not:</p>
      <ul>
        <li>Collect or extract information and/or user data from accounts which do not belong to you.</li>
        <li>Circumvent, disable, or otherwise interfere with security-related features of the Services.</li>
        <li>
          Trick, defraud, or mislead us or other users, including but not limited to making false reports or
          impersonating another user.
        </li>
        <li>
          Upload or transmit (or attempt to upload or to transmit) viruses or any type of malware, or information
          collection mechanism, including 1×1 pixels, web bugs, cookies, or other similar devices.
        </li>
        <li>Interfere with, disrupt, or create an undue burden on the Services or the networks or the Services connected.</li>
        <li>Harass, annoy, intimidate, or threaten others, or anyone engaged in providing any portion of the Services to you.</li>
        <li>Use the Services in a manner inconsistent with any applicable laws or regulations.</li>
      </ul>
      <p>
        Accounts found to be in violation of any of the above are subject to cancellation without prior notice.
        Violations can be reported with the Report button on any public project, or by emailing {mail} with
        detailed information about the content or behavior you are reporting and how you found it, including
        addresses or screenshots. We will not disclose your identity to anyone associated with the reported
        account.
      </p>

      {/* Ours. */}
      <h2>Public Projects</h2>
      <p>
        A project is private unless you make it public. Everything in a public project, including nested documents
        and the descriptions on nodes and arrows, can be read by anyone on the internet who has the link. Do not
        make a project public if it holds anything confidential. Making it private again stops new visits, but
        cannot take back what someone has already seen or copied.
      </p>

      <h2>Payment, Refunds, and Plan Changes</h2>
      <ul>
        <li>
          If you are using a free version of the Services, it is really free: we do not ask you for your credit
          card and, just like for customers who pay for our Services, we do not sell your data.
        </li>
        <li>
          Paid plans are billed per editor, per month, in advance, through Stripe. If you are upgrading from a
          free plan to a paid plan, we will charge your card immediately and your billing cycle starts on the day
          of upgrade. When you add or remove editors during a cycle, the change in price is prorated.
        </li>
        <li>
          All fees are exclusive of all taxes, levies, or duties imposed by taxing authorities. Where required, we
          will collect those taxes on behalf of the taxing authority and remit them. Otherwise, you are responsible
          for payment of all taxes, levies, or duties.
        </li>
        <li>
          We want our customers to be treated fairly. If you were charged in error, or were charged after you
          meant to cancel, write to {mail} and we will work it out with you, including a full or partial refund
          where that is the fair result.
        </li>
      </ul>

      <h2>Cancellation and Termination</h2>
      <ul>
        <li>
          You are solely responsible for properly canceling your paid plan. You can do it at any time from
          Billing in the Services. An email request to cancel is not automatically considered cancellation. If you
          need help canceling, you can always contact us at {mail}.
        </li>
        <li>
          If you cancel a paid plan before the end of your current paid up month, you will not be charged again.
          We do not automatically prorate unused time in the last billing cycle. When a paid plan ends and an org
          has more editors than the free plan includes, the org becomes read-only after the grace period shown in
          the Services, until it fits the free plan or subscribes again. No content is deleted because of this.
        </li>
        <li>
          To delete your account or an org, write to {mail} from the email address on the account. All of your
          content will be inaccessible from the Services immediately upon deletion. Within 30 days, all content
          will be permanently deleted from active systems and logs. Within 60 days, all content will be
          permanently deleted from our backups. We cannot recover this information once it has been permanently
          deleted.
        </li>
        <li>
          We have the right to suspend or terminate your account and refuse any and all current or future use of
          our Services for any reason at any time. Suspension means you and any other users on your account will
          not be able to access the account or any content in the account. Termination will furthermore result in
          the deletion of your account or your access to your account, and the forfeiture and relinquishment of
          all content in your account. We also reserve the right to refuse the use of the Services to anyone for
          any reason at any time. We have this clause because statistically speaking, out of all the accounts on
          our Services, there is at least one doing something nefarious. There are some things we staunchly stand
          against and this clause is how we exercise that stance.
        </li>
        <li>
          Verbal, physical, written or other abuse (including threats of abuse or retribution) of anyone who works
          on the Services will result in immediate account termination.
        </li>
      </ul>

      <h2>Modifications to the Service and Prices</h2>
      <ul>
        <li>
          Sometimes it becomes technically impossible to continue a feature or we redesign a part of our Services
          because we think it could be better. We reserve the right at any time to modify or discontinue,
          temporarily or permanently, any part of our Services with or without notice.
        </li>
        <li>
          Sometimes we change the pricing structure for our products. When we do that, we tend to exempt existing
          customers from those changes. However, we may choose to change the prices for existing customers. If we
          do so, we will give at least 30 days notice and will notify you via the email address on record. We may
          also post a notice about changes on our website or the affected Services themselves.
        </li>
      </ul>

      <h2>Uptime, Security, and Privacy</h2>
      <ul>
        <li>
          Your use of the Services is at your sole risk. We provide these Services on an &quot;as is&quot; and
          &quot;as available&quot; basis. We do not offer service-level agreements, but do take uptime of our
          application seriously.
        </li>
        <li>
          We reserve the right to temporarily disable your account if your usage significantly exceeds the average
          usage of other customers of the Services. Of course, we&apos;ll reach out to the account owner before
          taking any action except in rare cases where the level of use may negatively impact the performance of
          the Service for other customers.
        </li>
        <li>
          We take measures to protect and secure your data, including encryption at rest by our database provider
          and access rules that limit each account to its own orgs. We enforce encryption for data transmission
          from the public Internet. Keep your own copies of anything you cannot afford to lose.
        </li>
        <li>
          When you use our Services, you entrust us with your data. We take that trust to heart. You agree that we
          may process your data as described in our <Link href="/privacy">Privacy Policy</Link> and for no other
          purpose. We as humans can access your data for the following reasons:
          <ul className="mt-1.5">
            <li>
              <strong>To help you with support requests you make.</strong> We&apos;ll ask for express consent
              before accessing your account.
            </li>
            <li>
              <strong>On the rare occasions when an error occurs that stops an automated process partway through.</strong>{" "}
              When we can fix the issue without looking at any personal data, we do. In rare cases, we have to
              look at a minimum amount of personal data to fix the issue.
            </li>
            <li>
              <strong>To safeguard the Services.</strong> We&apos;ll look at logs and metadata as part of our work
              to ensure the security of your data and the Services as a whole. If necessary, we may also access
              accounts as part of an abuse report investigation.
            </li>
            <li>
              <strong>To the extent required by applicable law.</strong> We only preserve or share customer data
              if compelled by a US government authority with a legally binding order or proper request, or in
              limited circumstances in the event of an emergency request.
            </li>
          </ul>
        </li>
        <li>
          We use third party vendors and hosting partners to provide the necessary hardware, software, networking,
          storage, and related technology required to run the Services. They are listed in the{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </li>
      </ul>

      <h2>Copyright and Content Ownership</h2>
      <ul>
        <li>
          All content posted on the Services must comply with U.S. copyright law. To report content that infringes
          your copyright, send a notice to {mail} that identifies the work you own and the address of the content
          on the Services, and includes your contact details, a statement that you believe in good faith the use
          is not authorized, a statement under penalty of perjury that the notice is accurate and that you are
          the owner or are authorized to act for the owner, and your signature.
        </li>
        <li>
          You give us a limited license to use the content posted by you and your users in order to provide the
          Services to you, but we claim no ownership rights over those materials. All materials you submit to the
          Services remain yours.
        </li>
        <li>
          We do not pre-screen content, but we reserve the right (but not the obligation) in our sole discretion to
          refuse or remove any content that is available via the Service.
        </li>
        {/* Ours, in place of Basecamp's proprietary-software clause. */}
        <li>
          The Subcanvas software is open source under the GNU Affero General Public License, version 3. That
          license, not these Terms, governs your use of the source code. These Terms cover only this hosted
          Service; a copy of Subcanvas that someone else runs is their service, under their terms. The Subcanvas
          name and logo are not covered by that license; please ask at {mail} before using them to promote
          something of your own.
        </li>
      </ul>

      <h2>Features and Bugs</h2>
      <p>
        We design our Services with care, based on our own experience and the experiences of customers who share
        their time and feedback. However, there is no such thing as a service that pleases everybody. We make no
        guarantees that our Services will meet your specific requirements or expectations.
      </p>
      <p>
        We also test our features before shipping them. As with any software, our Services inevitably have some
        bugs. We track the bugs reported to us and work through priority ones, especially any related to security
        or privacy. Not all reported bugs will get fixed and we don&apos;t guarantee completely error-free
        Services.
      </p>

      <h2>Sign-in and Other Third-Party Services</h2>
      <p>
        You can sign in with Google or GitHub, and paid plans are charged through Stripe. Those are services we do
        not run, and their own terms apply to your use of them. We are not liable or accountable for any
        third-party service, or for anything a link in a document leads to.
      </p>

      <h2>Liability</h2>
      <p>We mention liability throughout these Terms but to put it all in one section:</p>
      <p>
        <strong>
          <em>
            You expressly understand and agree that we shall not be liable, in law or in equity, to you or to any
            third party for any direct, indirect, incidental, lost profits, special, consequential, punitive or
            exemplary damages, including, but not limited to, damages for loss of profits, goodwill, use, data or
            other intangible losses (even if we have been advised of the possibility of such damages), resulting
            from: (i) the use or the inability to use the Services; (ii) the cost of procurement of substitute
            goods and services resulting from any goods, data, information or services purchased or obtained or
            messages received or transactions entered into through or from the Services; (iii) unauthorized access
            to or alteration of your transmissions or data; (iv) statements or conduct of any third party on the
            service; (v) or any other matter relating to these Terms or the Services, whether as a breach of
            contract, tort (including negligence whether active or passive), or any other theory of liability.
          </em>
        </strong>
      </p>
      <p>
        In other words: choosing to use our Services does mean you are making a bet on us. If the bet does not
        work out, that&apos;s on you, not us. We do our best to be as safe a bet as possible. If you choose to use
        our Services, thank you for betting on us.
      </p>

      {/* Ours: Basecamp's terms name no governing law. */}
      <h2>Governing Law</h2>
      <p>
        The laws of the State of {legal.governingLaw}, USA, govern these Terms, without regard to its rules on
        conflicts of law. Disputes will be heard in the state or federal courts located in {legal.governingLaw},
        and you and we accept their jurisdiction. If you are a consumer, this does not take away protections that
        the law of the place where you live gives you and that cannot be waived by agreement.
      </p>

      <p>
        If you have a question about any of these Terms, please contact {legal.operator} at {mail}.
      </p>

      <LegalAttribution />
    </LegalPage>
  )
}
