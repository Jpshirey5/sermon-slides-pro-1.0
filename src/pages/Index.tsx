import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import WorkflowComparison from "@/components/landing/WorkflowComparison";
import Pricing from "@/components/landing/Pricing";
import Testimonials from "@/components/landing/Testimonials";
import CTA from "@/components/landing/CTA";
import Footer from "@/components/landing/Footer";
import ScrollToTopButton from "@/components/ScrollToTopButton";

const Index = () => {
  return (
    <div className="min-h-screen grid-noise">
      <Header />
      <main>
        <Hero />
        <WorkflowComparison />
        <Features />
        <Testimonials />
        <Pricing />
        <CTA />
      </main>
      <Footer />
      <ScrollToTopButton />
    </div>
  );
};

export default Index;
