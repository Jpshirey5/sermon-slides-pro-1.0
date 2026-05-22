import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, FileText, CreditCard, ShieldAlert, Scale } from "lucide-react";

const sections = [
  {
    title: "Acceptance of Terms",
    body: [
      "By accessing or using Sermon Slide Pro, a product of Boosted Technology Co., LLC (\"we,\" \"us,\" or \"our\"), you agree to be bound by these Terms and Conditions and any policies referenced in them. If you do not agree, do not use the service.",
    ],
  },
  {
    title: "Eligibility and Accounts",
    body: [
      "You are responsible for ensuring that the information you provide when creating an account is accurate and up to date.",
      "You are responsible for maintaining the confidentiality of your login credentials and for activity that occurs under your account or your organization’s account.",
    ],
  },
  {
    title: "Use of the Service",
    body: [
      "Sermon Slide Pro is provided to help users create, manage, and export sermon slide content and related presentation materials.",
      "You agree not to use the service in a way that is unlawful, abusive, fraudulent, harmful, or that interferes with the availability, security, or proper operation of the platform.",
      "You may not attempt to reverse engineer, scrape, automate, disrupt, or gain unauthorized access to the service, its infrastructure, or other customer data.",
    ],
  },
  {
    title: "Customer Content",
    body: [
      "You retain ownership of the content you create, upload, or store in Sermon Slide Pro, including sermon outlines, slide text, exported presentation data, and related materials.",
      "You grant us the limited rights necessary to host, process, back up, transmit, and display your content solely to operate and improve the service, provide support, and comply with legal obligations.",
      "You are responsible for ensuring that you have the rights and permissions necessary to use the content you place into the platform.",
    ],
  },
  {
    title: "Subscriptions, Payments, and Exports",
    body: [
      "Certain features require a paid subscription or one-time payment. Payment processing is handled through Stripe.",
      "Subscriptions may renew automatically unless canceled in accordance with the product’s cancellation flow. If a subscription is canceled, access may continue through the end of the current paid term where applicable.",
      "One-time export purchases and subscriptions are subject to the pricing, billing interval, and checkout terms shown at the time of purchase.",
    ],
  },
  {
    title: "Support, Availability, and Changes",
    body: [
      "We may modify, suspend, or discontinue portions of the service from time to time. We may also add, remove, or change features to improve the product or address technical, security, or operational needs.",
      "We aim to provide reliable service, but we do not guarantee uninterrupted availability or error-free operation.",
    ],
  },
  {
    title: "Termination",
    body: [
      "We may suspend or terminate access if we believe a user or organization is violating these Terms, misusing the service, creating risk to the platform, or engaging in fraudulent or unlawful conduct.",
      "You may stop using the service at any time. Subscription cancellation and account deletion remain subject to the billing and offboarding rules made available in the product.",
    ],
  },
  {
    title: "Intellectual Property",
    body: [
      "Sermon Slide Pro, including the service design, software, branding, and related materials, is owned by Boosted Technology Co., LLC or its licensors and is protected by applicable intellectual property laws.",
      "These Terms do not grant you ownership of the service itself, only the limited right to use it according to these Terms.",
    ],
  },
  {
    title: "Disclaimers and Limitation of Liability",
    body: [
      "The service is provided on an “as is” and “as available” basis to the fullest extent permitted by law.",
      "To the fullest extent permitted by law, Boosted Technology Co., LLC will not be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenues, goodwill, data, or business interruption arising from or related to the use of the service.",
      "Nothing in these Terms limits liability where such limitation is not permitted by applicable law.",
    ],
  },
  {
    title: "Changes to These Terms",
    body: [
      "We may update these Terms and Conditions from time to time. Continued use of the service after an update becomes effective means you accept the revised Terms.",
    ],
  },
];

export default function TermsAndConditions() {
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
                <FileText className="h-4 w-4 text-primary" />
                Terms and Conditions
              </div>
              <h1 className="mt-5 font-serif text-3xl font-bold text-foreground sm:text-5xl">
                Terms and Conditions for Sermon Slide Pro
              </h1>
              <p className="mt-4 text-base text-muted-foreground sm:text-lg">
                Effective date: May 22, 2026
              </p>
              <p className="mt-4 text-base text-muted-foreground sm:text-lg">
                These Terms and Conditions are an agreement between you and Boosted Technology Co., LLC, a
                Florida limited liability company (“Boosted Technology Co., LLC,” “we,” “us,” or “our”).
                Sermon Slide Pro is a product of Boosted Technology Co., LLC. These Terms describe the
                rules and expectations that apply when you use Sermon Slide Pro’s website, subscriptions,
                exports, support channels, and related services.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                { icon: CreditCard, title: "Subscriptions and price", text: "Paid plans, one-time exports, and billing flows are governed by the pricing shown at checkout." },
                { icon: ShieldAlert, title: "Responsible use", text: "Use of the platform must remain lawful, secure, and respectful of the service and other users." },
                { icon: Scale, title: "Content and rights", text: "You keep ownership of your content while granting only the rights needed to operate the service." },
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
                <h2 className="font-serif text-2xl font-semibold text-foreground">Related Policy</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Please also review our{" "}
                  <Link to="/privacy-policy" className="font-medium text-primary hover:underline">
                    Privacy Policy
                  </Link>
                  , which explains how we collect, use, and protect information when you use the service.
                </p>
              </section>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
