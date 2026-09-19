import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { LegalAttribution, LegalPage } from "@/components/legal-page"
import { legalDetails } from "@/lib/legal"

export const metadata = { title: "Privacy Policy" }

// Adapted from the Basecamp open-source policies (CC BY 4.0). Their wording is
// kept wherever it applies. What Subcanvas does not do is left out (ads,
// analytics, CAPTCHA, mobile apps, newsletters), and what they do not cover is
// added and marked "ours": sign-in with Google and GitHub, public projects,
// the list of providers, children, and self-hosted copies.
export default async function PrivacyPage() {
  // The operator comes from the server's environment, so render on request:
  // a build made before it was set must not bake in "not found".
  await connection()
  const legal = legalDetails()
  if (!legal) notFound()
  const mail = <a href={`mailto:${legal.contact}`}>{legal.contact}</a>

  return (
    <LegalPage title="Privacy Policy">
      <p>
        The privacy of your data (and it is your data, not ours!) is a big deal to us. In this policy, we lay out:
        what data we collect and why; how your data is handled; and your rights with respect to your data. We
        promise we never sell your data: never have, never will.
      </p>
      <p>
        This policy applies to this Subcanvas service, which is operated by {legal.operator} (&quot;we&quot;,
        &quot;us&quot;). It applies to our handling of information about site visitors and people with accounts.
        We refer collectively to these categories of individuals as &quot;you&quot; throughout this policy.
      </p>

      <h2>What we collect and why</h2>
      <p>Our guiding principle is to collect only what we need. Here&apos;s what that means in practice:</p>

      <h3>Identity and access</h3>
      <p>
        When you sign up, we ask for your email address, and you can add a name and a profile picture that display
        in the product. That&apos;s so you can personalize your account, the people you work with can tell who is
        who, and we can send you sign-in links, confirmations, password resets, invitations, and other essential
        information. If you set a password, it is stored only as a salted hash by our authentication provider; we
        never see it. We do not send marketing email.
      </p>
      <p>
        We&apos;ll never sell your personal information to third parties, and we won&apos;t use your name or
        company in marketing statements without your permission either.
      </p>

      {/* Ours. The second paragraph is what Google's API Services User Data Policy asks apps to state. */}
      <h3>Sign-in with Google or GitHub</h3>
      <p>
        If you choose to sign in with Google or GitHub, we receive your name, email address, and profile picture
        from that provider, and nothing else. We use them only to create your account, sign you in, and show your
        name and picture to the people you collaborate with.
      </p>
      <p>
        We do not request access to any other Google data. We do not use Google user data for advertising, do not
        sell it, do not use it to train machine-learning models, and do not transfer it to anyone except the
        providers listed below as needed to run the service, or as the law requires. The same applies to GitHub.
      </p>

      <h3>Billing information</h3>
      <p>
        If you sign up for a paid plan, you will be asked to provide your payment information and billing address.
        Credit card information is submitted directly to our payment processor, Stripe, and doesn&apos;t hit our
        servers. We store the Stripe customer and subscription identifiers and the state of your plan, for
        purposes of account history, invoicing, and billing support.
      </p>

      <h3>Product interactions</h3>
      <p>
        We store on our servers the content that you create or maintain in your account: whiteboards, documents,
        folders, projects, and orgs, which orgs you belong to and your role in each, and the email addresses of
        people you invite. This is so you can use the product as intended. We keep this content as long as your
        account is active. If you delete your account, we&apos;ll delete the content within 60 days. We do not use
        your content to train machine-learning models.
      </p>

      {/* Ours. */}
      <h3>Public projects and reports</h3>
      <p>
        If you make a project public, anyone on the internet with the link can read everything in it. While
        someone views a document, a random identifier that is not tied to their identity is kept briefly so that
        others can see how many people are watching. If you report a public project, we keep the reason you give
        and, if you choose to leave it, your email address, so we can follow up.
      </p>

      <h3>General Geolocation data</h3>
      <p>
        Our hosting providers log requests to the service by full IP address, along with browser type, the address
        requested, and the time, for security and fraud prevention purposes. We do not use this to build a profile
        of you.
      </p>

      <h3>Cookies</h3>
      <p>
        A cookie is a piece of text stored by your browser. We use first-party cookies to keep you signed in, and
        your browser&apos;s local storage to remember your light or dark theme. We do not use advertising cookies,
        third-party cookies, or analytics scripts. You can block cookies in your browser settings, although the
        application won&apos;t work if you turn them off.
      </p>

      <h3>Voluntary correspondence</h3>
      <p>
        When you email us with a question or to ask for help, we keep that correspondence, including your email
        address, so that we have a history of past correspondence to reference if you reach out in the future.
      </p>

      <h2>When we access or disclose your information</h2>
      <p>
        <strong>To provide products or services you&apos;ve requested.</strong> We use some third-party
        subprocessors to help run the application and provide the service to you:
      </p>
      {/* Ours: the list itself. */}
      <ul>
        <li><strong>Supabase</strong>: database, authentication, and real-time sync, hosted in the United States.</li>
        <li><strong>Vercel</strong>: hosting of the web application.</li>
        <li><strong>Resend</strong>: sending email.</li>
        <li><strong>Stripe</strong>: payments, for paid plans.</li>
        <li><strong>Cloudflare</strong>: domain name service.</li>
        <li><strong>Google and GitHub</strong>: sign-in, only if you choose them. They learn that you signed in to this service.</li>
      </ul>
      <p>
        Members of your orgs can see your name, email address, and picture, what you create and edit there, and
        your cursor while you work.
      </p>
      <p>
        No human looks at your content except for limited purposes with your express permission, for example, if
        an error occurs that stops an automated process from working and requires manual intervention to fix.
        These are rare cases, and when they happen, we look for root cause solutions as much as possible to avoid
        them recurring. We may also access your data if required in order to respond to legal process (see
        &quot;When required under applicable law&quot; below).
      </p>
      <p>
        <strong>To help you troubleshoot or squash a software bug, with your permission.</strong> If at any point
        we need to access your content to help you with a support case, we will ask for your consent before
        proceeding.
      </p>
      <p>
        <strong>To investigate, prevent, or take action regarding restricted uses.</strong> Accessing a
        customer&apos;s account when investigating potential abuse is a measure of last resort. We want to protect
        the privacy and safety of both our customers and the people reporting issues to us, and we do our best to
        balance those responsibilities throughout the process. If we discover you are using our products for a
        restricted purpose, we will take action as necessary, including notifying appropriate authorities where
        warranted.
      </p>
      <p>
        <strong>When required under applicable law.</strong> This service is operated from the U.S. and all data
        infrastructure is located in the U.S.
      </p>
      <ul>
        <li>
          Requests for user data. Our policy is to not respond to government requests for user data unless we are
          compelled by legal process or in limited circumstances in the event of an emergency request. However, if
          U.S. law enforcement authorities have the necessary warrant, criminal subpoena, or court order requiring
          us to disclose data, we must comply. It is our policy to notify affected users before we disclose data
          unless we are legally prohibited from doing so, and except in some emergency cases.
        </li>
        <li>
          If we are audited by a tax authority, we may be required to disclose billing-related information. If that
          happens, we will disclose only the minimum needed.
        </li>
      </ul>
      <p>
        Finally, if the service is acquired by or merges with another company, we&apos;ll notify you well before
        any of your personal information is transferred or becomes subject to a different privacy policy.
      </p>

      <h2>Your rights with respect to your information</h2>
      <p>We strive to apply the same data rights to all customers, regardless of their location. Some of these rights include:</p>
      <ul>
        <li>
          <strong>Right to Know.</strong> You have the right to know what personal information is collected, used,
          shared or sold. We outline both the categories and specific bits of data we collect, as well as how they
          are used, in this privacy policy.
        </li>
        <li>
          <strong>Right of Access.</strong> This includes your right to access the personal information we gather
          about you, and your right to obtain information about the sharing, storage, security and processing of
          that information.
        </li>
        <li><strong>Right to Correction.</strong> You have the right to request correction of your personal information.</li>
        <li>
          <strong>Right to Erasure / &quot;To Be Forgotten&quot;.</strong> This is your right to request, subject
          to certain limitations under applicable law, that your personal information be erased from our
          possession and, by extension, from all of our service providers. Fulfillment of some data deletion
          requests may prevent you from using the service because the application may then no longer work. In such
          cases, a data deletion request may result in closing your account.
        </li>
        <li>
          <strong>Right to Complain.</strong> You have the right to make a complaint regarding our handling of
          your personal information with the appropriate supervisory authority.
        </li>
        <li>
          <strong>Right to Restrict Processing.</strong> This is your right to request restriction of how and why
          your personal information is used or processed, including opting out of sale of your personal
          information. (Again: we never have and never will sell your personal data.)
        </li>
        <li>
          <strong>Right to Object.</strong> You have the right, in certain situations, to object to how or why
          your personal information is processed.
        </li>
        <li>
          <strong>Right to Portability.</strong> You have the right to receive the personal information we have
          about you and the right to transmit it to another party. Write to us and we will send you an export.
        </li>
        <li>
          <strong>Right to not Be Subject to Automated Decision-Making.</strong> We make no decisions about you
          that have a legal or similarly significant effect based solely on automated processes.
        </li>
        <li>
          <strong>Right to Non-Discrimination.</strong> We do not and will not charge you a different amount to use
          our products, offer you different discounts, or give you a lower level of customer service because you
          have exercised your data privacy rights. However, the exercise of certain rights may, by virtue of your
          exercising those rights, prevent you from using our Services.
        </li>
      </ul>
      <p>
        Many of these rights can be exercised by signing in and updating your account information. Please note
        that certain information may be exempt from such requests under applicable law. For example, we need to
        retain certain information in order to provide our services to you.
      </p>
      <p>
        In some cases, we also need to take reasonable steps to verify your identity before responding to a
        request, which may include, at a minimum, verifying your name and email address. If we are unable to
        verify you, we may be unable to respond to your requests. If you have questions about exercising these
        rights or need assistance, please contact us at {mail}. If an authorized agent is corresponding on your
        behalf, we will need written consent with a signature from the account holder before proceeding.
      </p>
      <p>
        Depending on applicable law, you may have the right to appeal our decision to deny your request, if
        applicable. We will provide information about how to exercise that right in our response denying the
        request. You also have the right to lodge a complaint with a supervisory authority. If you are in the EU
        or UK, you can contact your data protection authority to file a complaint or learn more about local
        privacy laws.
      </p>

      <h2>How we secure your data</h2>
      <p>
        All data is encrypted via SSL/TLS when transmitted from our servers to your browser. Data is encrypted at
        rest by our database provider, and database rules limit each account to the orgs it belongs to.
      </p>

      <h2>What happens when you delete content</h2>
      <p>
        Documents you trash stay in the project&apos;s trash, where you can restore them, until you delete them
        for good. If you ask us to delete your account, your content will become immediately inaccessible and
        should be purged from our systems in full within 60 days.
      </p>

      <h2>Data retention</h2>
      <p>
        We keep your information for the time necessary for the purposes for which it is processed. The length of
        time for which we retain information depends on the purposes for which we collected and use it and your
        choices, after which time we may delete and/or aggregate it. We may also retain and use this information
        as necessary to comply with our legal obligations, resolve disputes, and enforce our agreements.
      </p>

      <h2>Location of site and data</h2>
      <p>
        This service is operated in the United States. If you are located in the European Union, UK, or elsewhere
        outside of the United States,{" "}
        <strong>
          please be aware that any information you provide to us will be transferred to and stored in the United
          States
        </strong>
        . By using the service and/or providing us with your personal information, you consent to this transfer.
      </p>

      {/* Ours. */}
      <h2>Children</h2>
      <p>
        The service is not meant for children under 13, and we do not knowingly collect their information. If you
        believe a child has given us information, write to {mail} and we will delete it.
      </p>

      {/* Ours. */}
      <h2>Self-hosted copies</h2>
      <p>
        Subcanvas is open source. This policy covers only this service. A copy that someone else runs is governed
        by their policy, and we receive no information from it.
      </p>

      <h2>Changes and questions</h2>
      <p>
        We may update this policy as needed to comply with relevant regulations and reflect any new practices.
        Whenever we make a significant change to our policies, we will refresh the date at the top of this page
        and take any other appropriate steps to notify users. See also the{" "}
        <Link href="/terms">Terms of Service</Link>.
      </p>
      <p>
        Have any questions, comments, or concerns about this privacy policy, your data, or your rights with
        respect to your information? Please get in touch with {legal.operator} by emailing {mail} and we&apos;ll
        be happy to try to answer them!
      </p>

      <LegalAttribution />
    </LegalPage>
  )
}
