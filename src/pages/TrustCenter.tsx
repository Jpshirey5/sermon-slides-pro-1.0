import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  ShieldCheck,
  Database,
  CreditCard,
  ServerCog,
  CircleHelp,
  ExternalLink,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const principles = [
  {
    icon: ShieldCheck,
    title: "Security-first product design",
    description:
      "We aim to handle customer data with care by building on managed infrastructure, authenticated access, and trusted third-party services rather than custom security systems we cannot confidently maintain at the same level.",
  },
  {
    icon: Database,
    title: "Data used to operate the platform",
    description:
      "We use account, presentation, and subscription data to support sign-in, saved work, billing access, and product functionality. We keep the focus on operating the platform, not collecting more data than is needed for the core experience.",
  },
  {
    icon: Lock,
    title: "Clear boundaries around sensitive data",
    description:
      "Payment processing is delegated to Stripe. Scripture delivery is delegated to API.Bible. Core application auth, database, and storage are handled through Supabase. That separation helps keep responsibilities clear across the platform.",
  },
];

const vendors = [
  {
    title: "Supabase",
    subtitle: "Authentication, database, and storage infrastructure",
    icon: ServerCog,
    claims: [
      "Supabase publicly states that its platform is SOC 2 Type II compliant.",
      "Supabase also publishes security and compliance information for teams evaluating infrastructure trust and data handling.",
      "Within Sermon Slide Pro, Supabase supports account authentication, application data storage, and stored presentation assets.",
    ],
    href: "https://supabase.com/security",
  },
  {
    title: "Stripe",
    subtitle: "Subscription billing and payment flows",
    icon: CreditCard,
    claims: [
      "Stripe publicly states that it is certified as a PCI Service Provider Level 1, which is the highest level of certification in the payments industry.",
      "Stripe also publishes information about SOC 1, SOC 2, and SOC 3 reporting for its platform.",
      "Within Sermon Slide Pro, Stripe is used for subscriptions, billing portals, and customer payment workflows rather than storing full card information directly in the app.",
    ],
    href: "https://stripe.com/docs/security/stripe",
  },
  {
    title: "API.Bible",
    subtitle: "Scripture content and translation delivery",
    icon: BookOpen,
    claims: [
      "API.Bible is used to retrieve supported scripture translations and verse content inside the product.",
      "We rely on API-level access for scripture delivery instead of storing a separate local scripture dataset inside the application.",
      "We do not make broader compliance claims for API.Bible on this page beyond what is clearly documented and visible from their public platform materials.",
    ],
    href: "https://api.bible/",
  },
];

export default function TrustCenter() {
  return (
    <div className="app-shell flex flex-col">
      <header className="border-b border-border/60 bg-white/65 backdrop-blur-md">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link
              to="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">
                Sermon Slide Pro
              </span>
            </div>
            <div className="w-20" />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-6xl"
        >
          <div className="rounded-2xl glass-panel p-6 sm:p-8 shadow-elevated">
            <div className="mx-auto max-w-4xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/70 px-4 py-2 text-sm text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Trust Center
              </div>
              <h1 className="mt-5 font-serif text-3xl font-bold text-foreground sm:text-5xl">
                A deeper look at how we handle trust, security, and customer data
              </h1>
              <p className="mt-4 text-base text-muted-foreground sm:text-lg">
                This page explains how Sermon Slide Pro approaches security and data handling across
                the platform, and how we use trusted providers like Supabase, Stripe, and API.Bible
                to support critical parts of the product.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {principles.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.07 * index }}
                    className="rounded-2xl border border-border/70 bg-white/70 p-6 backdrop-blur-sm"
                  >
                    <div className="w-11 h-11 rounded-xl gradient-hero flex items-center justify-center mb-4">
                      <Icon className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h2 className="font-serif text-xl font-semibold text-foreground">
                      {item.title}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </motion.div>
                );
              })}
            </div>

            <section className="mt-10">
              <div className="max-w-3xl">
                <h2 className="font-serif text-3xl font-semibold text-foreground">
                  Core vendors and how they fit into the platform
                </h2>
                <p className="mt-3 text-muted-foreground">
                  We use a small set of specialized providers for infrastructure, payments, and
                  scripture delivery. Where appropriate, this page reflects public vendor claims from
                  their own documentation rather than unsupported internal marketing language.
                </p>
              </div>

              <div className="mt-6 grid gap-5">
                {vendors.map((vendor, index) => {
                  const Icon = vendor.icon;
                  return (
                    <motion.div
                      key={vendor.title}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.08 * index }}
                      className="rounded-2xl border border-border/70 bg-white/70 p-6 backdrop-blur-sm"
                    >
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="max-w-3xl">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl gradient-hero flex items-center justify-center">
                              <Icon className="w-5 h-5 text-primary-foreground" />
                            </div>
                            <div>
                              <h3 className="font-serif text-2xl font-semibold text-foreground">
                                {vendor.title}
                              </h3>
                              <p className="text-sm text-muted-foreground">{vendor.subtitle}</p>
                            </div>
                          </div>

                          <div className="mt-5 space-y-3">
                            {vendor.claims.map((claim) => (
                              <div
                                key={claim}
                                className="rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-sm leading-6 text-muted-foreground"
                              >
                                {claim}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="lg:pt-1">
                          <a
                            href={vendor.href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                          >
                            View vendor documentation
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
              <h2 className="font-serif text-2xl font-semibold text-foreground">
                Need a direct answer from us?
              </h2>
              <p className="mt-2 text-muted-foreground">
                If your team has questions about security, billing, vendor use, or how customer data
                is handled inside the platform, contact us and we will help directly.
              </p>
              <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/contact">
                  <Button variant="hero" size="lg">
                    Contact Us
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
