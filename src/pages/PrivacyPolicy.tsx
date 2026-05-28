import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Lock, Database, CreditCard, Mail, ScrollText } from "lucide-react";

const sections = [
  {
    title: "Information We Collect",
    body: [
      "We collect information you provide directly to us, such as your name, email address, organization name, church role, account details, support requests, team-invite details, and any content you create or store inside Sermon Slide Pro.",
      "When you subscribe or purchase an export, payment and billing details are processed by Stripe. We do not store full payment card information directly inside the application.",
      "We also collect limited technical and usage information needed to operate and improve the platform, including session information, device/browser details, route activity, and product telemetry that helps us understand feature usage and errors.",
    ],
  },
  {
    title: "How We Use Information",
    body: [
      "We use your information to provide the service, create and manage accounts, save presentations, power AI-assisted sermon analysis and slide generation when you choose to use those features, process billing, support teams, send product-related emails, respond to support requests, and maintain platform security and reliability.",
      "We may use limited usage analytics and error reporting to improve features, diagnose issues, monitor performance, and understand how the product is being used. We aim to avoid collecting unnecessary personal data in that process.",
      "We may also use your information to communicate about your account, subscription, product updates, support matters, legal obligations, and operational notices related to the service.",
    ],
  },
  {
    title: "Third-Party Services",
    body: [
      "Sermon Slide Pro relies on a small set of service providers to operate core parts of the product. Supabase supports authentication, database, and storage infrastructure. Stripe supports subscription billing and payment flows. Resend supports certain transactional email delivery. API.Bible supports scripture retrieval and translation delivery. Anthropic (Claude API) supports AI-assisted sermon analysis and slide generation, as described in the “AI-Assisted Sermon Generation” section.",
      "These providers may process data on our behalf only as needed to support their role in delivering the service.",
    ],
  },
  {
    title: "Cookies, Local Storage, and Product Telemetry",
    body: [
      "We use browser storage and similar technologies to support sign-in, saved preferences, product tours, session handling, checkout continuity, and other functional parts of the app.",
      "We may also collect limited telemetry and diagnostic information to understand product usage and troubleshoot issues. We design that telemetry to avoid including sermon content where reasonably possible.",
    ],
  },
  {
    title: "User Content",
    body: [
      "Presentations, sermon outlines, scripture selections, exported slide data, and other content you create in the platform remain your content. We process and store that content only to provide the service, support expected product functionality, respond to support issues, and comply with legal obligations.",
      "We do not claim ownership of your sermon content solely because it is stored or processed through Sermon Slide Pro.",
    ],
  },
  {
    title: "AI-Assisted Sermon Generation",
    body: [
      "Sermon Slide Pro includes AI-assisted features that read sermon outlines or manuscripts you upload, identify the main points and scripture references in that content, and use them to help build your slides. To power these features, we use Anthropic’s Claude API as a sub-processor. When you use an AI-assisted feature, the relevant sermon text is sent to Anthropic solely to generate the requested output, and the AI response is returned to Sermon Slide Pro for use in your presentation.",
      "Anthropic processes this content only to return a result for that request. Under Anthropic’s API terms, content sent through the Claude API is not used to train Anthropic’s models and is not retained beyond what is needed to deliver the response and meet Anthropic’s standard operational and safety requirements.",
      "Sermon Slide Pro does not sell, share, or repurpose your sermon content outside the platform. Saved sermons, slides, points, and verses remain inside the Sermon Slide Pro infrastructure (hosted on Supabase) and are used only to operate the service for you and your team. You can stop using AI-assisted features at any time without losing access to the rest of the platform.",
    ],
  },
  {
    title: "Data Sharing and Disclosure",
    body: [
      "We do not sell your personal information or your sermon content. We may share information with service providers that help us operate the platform, process payments, deliver email, provide scripture access, provide AI-assisted features, secure infrastructure, or comply with law.",
      "We may also disclose information when required to comply with legal obligations, protect our rights, investigate fraud or abuse, or support a business transfer such as a merger, acquisition, or sale of assets.",
    ],
  },
  {
    title: "Data Retention and Security",
    body: [
      "We retain information for as long as needed to operate the service, maintain records, resolve disputes, comply with legal obligations, and support legitimate business needs.",
      "We use commercially reasonable administrative, technical, and organizational measures designed to protect information, but no system can guarantee absolute security.",
    ],
  },
  {
    title: "Your Choices and Rights",
    body: [
      "You may update certain account information from within the product, and you may contact us regarding account, support, or privacy questions. Depending on where you live, you may have rights to request access to, correction of, or deletion of personal information, subject to applicable law and operational limitations.",
      "If you want to make a privacy-related request, contact us using the information below.",
    ],
  },
  {
    title: "Children’s Privacy",
    body: [
      "Sermon Slide Pro is intended for adult users and ministry teams. We do not knowingly collect personal information from children under 13.",
    ],
  },
  {
    title: "Changes to This Policy",
    body: [
      "We may update this Privacy Policy from time to time. When we make material changes, we may revise the effective date on this page and, when appropriate, provide additional notice inside the service or by email.",
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="app-shell flex flex-col">
      <header className="border-b border-border/60 bg-white/65 backdrop-blur-md">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>
            <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-90">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-hero">
                <BookOpen className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">Sermon Slide Pro</span>
            </Link>
            <div className="w-20" />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-5xl"
        >
          <div className="rounded-2xl glass-panel p-6 shadow-elevated sm:p-8">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/70 px-4 py-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4 text-primary" />
                Privacy Policy
              </div>
              <h1 className="mt-5 font-serif text-3xl font-bold text-foreground sm:text-5xl">
                Privacy Policy for Sermon Slide Pro
              </h1>
              <p className="mt-4 text-base text-muted-foreground sm:text-lg">
                Effective date: May 22, 2026
              </p>
              <p className="mt-4 text-base text-muted-foreground sm:text-lg">
                This Privacy Policy explains how Boosted Technology Co., LLC, a Florida limited liability
                company (“Boosted Technology Co., LLC,” “we,” “us,” or “our”), collects, uses, stores, and
                shares information when you use Sermon Slide Pro — our website, applications, exports,
                subscriptions, support flows, and related services. Sermon Slide Pro is a product of
                Boosted Technology Co., LLC.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-4">
              {[
                { icon: Database, title: "Core account data", text: "Account details, saved sermons, teams, and settings used to run the product." },
                { icon: CreditCard, title: "Billing via Stripe", text: "Payments and subscription workflows are handled through Stripe." },
                { icon: Mail, title: "Support communication", text: "Support requests and transactional emails may be delivered through Resend." },
                { icon: ScrollText, title: "Product telemetry", text: "Limited usage and diagnostic data helps us improve reliability and features." },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl border border-border/70 bg-white/70 p-5">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl gradient-hero">
                      <Icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <h2 className="font-serif text-xl font-semibold text-foreground">{item.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.text}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-10 space-y-6">
              {sections.map((section) => (
                <section key={section.title} className="rounded-2xl border border-border/70 bg-white/70 p-6">
                  <h2 className="font-serif text-2xl font-semibold text-foreground">{section.title}</h2>
                  <div className="mt-4 space-y-4">
                    {section.body.map((paragraph) => (
                      <p key={paragraph} className="text-sm leading-7 text-muted-foreground">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              ))}

              <section className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
                <h2 className="font-serif text-2xl font-semibold text-foreground">Contact</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  If you have questions about this Privacy Policy or want to contact us about privacy
                  matters, please reach out through our{" "}
                  <Link to="/contact" className="font-medium text-primary hover:underline">
                    Contact page
                  </Link>
                  .
                </p>
              </section>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
