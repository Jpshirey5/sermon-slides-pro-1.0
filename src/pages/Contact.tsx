import { Link } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function Contact() {
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("US");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("");
  const [agreedToPolicies, setAgreedToPolicies] = useState(false);

  const canSubmit =
    Boolean(firstName.trim()) &&
    Boolean(lastName.trim()) &&
    Boolean(organization.trim()) &&
    Boolean(email.trim()) &&
    Boolean(phoneCountry.trim()) &&
    Boolean(phoneNumber.trim()) &&
    Boolean(message.trim()) &&
    agreedToPolicies;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const firstName = String(formData.get("first-name") ?? "").trim();
    const lastName = String(formData.get("last-name") ?? "").trim();
    const organization = String(formData.get("company") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phoneCountry = String(formData.get("country") ?? "").trim();
    const phoneNumber = String(formData.get("phone-number") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const agreedToPolicies = formData.get("agree-to-policies") === "on";

    if (!firstName || !lastName || !organization || !email || !phoneCountry || !phoneNumber || !message || !agreedToPolicies) {
      toast.error("Please complete every field before submitting.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("contact-support", {
        body: {
          firstName,
          lastName,
          organization,
          email,
          phoneCountry,
          phoneNumber,
          message,
          agreedToPolicies,
        },
      });

      if (error) {
        toast.error(error.message || "Could not send your message. Please try again.");
        return;
      }

      form.reset();
      setFirstName("");
      setLastName("");
      setOrganization("");
      setEmail("");
      setPhoneCountry("US");
      setPhoneNumber("");
      setMessage("");
      setAgreedToPolicies(false);
      toast.success("Thanks! Your message has been sent to support.");
    } catch {
      toast.error("Could not send your message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
            <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">
                Sermon Slide Pro
              </span>
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
          className="mx-auto max-w-3xl"
        >
          <div className="rounded-2xl glass-panel p-6 sm:p-8 shadow-elevated">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
                Contact Us
              </h2>
              <p className="mt-2 text-muted-foreground">
                Reach out to us with any questions, feedback, or inquiries about Sermon Slide Pro. We&apos;re here to help and would love to hear from you!
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mx-auto mt-10 max-w-2xl space-y-6 sm:mt-12">
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first-name">First name</Label>
                  <Input id="first-name" name="first-name" type="text" autoComplete="given-name" className="h-11" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name">Last name</Label>
                  <Input id="last-name" name="last-name" type="text" autoComplete="family-name" className="h-11" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="company">Organization</Label>
                  <Input id="company" name="company" type="text" autoComplete="organization" className="h-11" value={organization} onChange={(e) => setOrganization(e.target.value)} required />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" autoComplete="email" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="phone-number">Phone number</Label>
                  <div className="flex rounded-md border border-input bg-background">
                    <div className="grid shrink-0 grid-cols-1 focus-within:relative border-r border-input">
                      <select
                        id="country"
                        name="country"
                        autoComplete="country"
                        aria-label="Country"
                        value={phoneCountry}
                        onChange={(e) => setPhoneCountry(e.target.value)}
                        className="col-start-1 row-start-1 h-11 w-full appearance-none rounded-l-md bg-transparent py-2 pr-7 pl-3 text-sm text-muted-foreground focus-visible:outline-none"
                        required
                      >
                        <option>US</option>
                        <option>CA</option>
                        <option>EU</option>
                      </select>
                      <ChevronDown
                        aria-hidden="true"
                        className="pointer-events-none col-start-1 row-start-1 mr-2 size-4 self-center justify-self-end text-muted-foreground"
                      />
                    </div>
                    <input
                      id="phone-number"
                      name="phone-number"
                      type="text"
                      placeholder="123-456-7890"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="block h-11 min-w-0 grow bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" name="message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} required />
                </div>
                <div className="flex gap-x-3 sm:col-span-2">
                  <div className="pt-0.5">
                    <input
                      id="agree-to-policies"
                      name="agree-to-policies"
                      type="checkbox"
                      aria-label="Agree to policies"
                      checked={agreedToPolicies}
                      onChange={(e) => setAgreedToPolicies(e.target.checked)}
                      className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-ring"
                      required
                    />
                  </div>
                  <Label htmlFor="agree-to-policies" className="text-sm font-normal text-muted-foreground">
                    By selecting this, you agree to our{" "}
                    <Link to="/privacy-policy" className="font-medium text-primary hover:underline">
                      privacy policy
                    </Link>
                    .
                  </Label>
                </div>
              </div>

              <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading || !canSubmit}>
                {loading ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
