import { motion } from "framer-motion";
import {
  CheckCircle2,
  ListChecks,
  Monitor,
  Presentation,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { trackEvent } from "@/lib/monitoring";

const manualWorkflows = [
  {
    key: "powerpoint",
    title: "PowerPoint Workflow",
    icon: Presentation,
    steps: [
      "Open PowerPoint",
      "Create slides one by one",
      "Paste each scripture manually",
      "Format every slide",
      "Adjust layouts and re-do it next week",
    ],
    footer: "Time consuming and repetitive.",
  },
  {
    key: "propresenter",
    title: "ProPresenter Workflow",
    icon: Monitor,
    steps: [
      "Open ProPresenter",
      "Create slides one by one",
      "Paste each scripture manually",
      "Format every slide",
      "Adjust layouts and re-do it next week",
    ],
    footer: "Manual slide building every week.",
  },
] as const;

const proWorkflows = [
  {
    key: "structured",
    title: "Structured Builder",
    tagline: "Build point by point with auto-generated scripture.",
    icon: ListChecks,
    steps: [
      "Fill out the sermon form",
      "Enter your points and verse references",
      "We auto-pull the scripture text",
      "Generate the full slide deck",
      "Export to PowerPoint or ProPresenter",
    ],
  },
  {
    key: "quick",
    title: "Quick Build",
    tagline: "Drop in an outline or manuscript — done in under 2 minutes.",
    icon: UploadCloud,
    steps: [
      "Drag in your outline or manuscript",
      "We pull out every point and scripture reference",
      "Full deck built in under 2 minutes",
      "Edit anything you'd like to tweak",
      "Export to PowerPoint or ProPresenter",
    ],
    badge: "New",
  },
] as const;

const WorkflowComparison = () => {
  const navigate = useNavigate();
  const [trackedView, setTrackedView] = useState(false);

  const handleViewportEnter = () => {
    if (trackedView) return;
    setTrackedView(true);
    trackEvent("landing_comparison_viewed");
  };

  return (
    <section id="workflow-comparison" className="py-24 bg-muted/35">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          onViewportEnter={handleViewportEnter}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl text-center"
        >
          <span className="text-accent font-medium text-sm uppercase tracking-wider">
            Two ways to build — both included in every plan
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mt-3 mb-4">
            Build your sermon your way, in a fraction of the time.
          </h2>
          <p className="text-lg text-muted-foreground">
            Go point-by-point with the Structured Builder, or drop in a manuscript and let Quick Build do it for you in under two minutes. Both export straight to PowerPoint or ProPresenter.
          </p>
        </motion.div>

        <div className="mx-auto mt-14 max-w-6xl space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {manualWorkflows.map((workflow, index) => {
              const Icon = workflow.icon;
              return (
                <motion.div
                  key={workflow.key}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: index * 0.08 }}
                  className="rounded-3xl border border-border/80 bg-white/55 p-6 shadow-sm opacity-85"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-serif text-xl font-semibold text-foreground">
                      {workflow.title}
                    </h3>
                  </div>
                  <div className="divide-y divide-border/70 rounded-2xl border border-border/60 bg-white/55">
                    {workflow.steps.map((step, stepIndex) => (
                      <div key={step} className="flex gap-3 px-4 py-3 text-sm text-muted-foreground">
                        <span className="font-medium text-muted-foreground/80">{stepIndex + 1}.</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">{workflow.footer}</p>
                </motion.div>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="rounded-[2rem] border border-primary/25 bg-white p-7 shadow-elevated"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Two ways to build
            </div>
            <h3 className="font-serif text-2xl font-semibold text-foreground">
              The Sermon Slide Pro Workflow
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick the flow that fits how you write — both are included in every paid plan.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {proWorkflows.map((workflow) => {
                const Icon = workflow.icon;
                const isQuick = workflow.key === "quick";
                return (
                  <div
                    key={workflow.key}
                    className="relative flex flex-col rounded-2xl border border-primary/15 bg-primary/5 p-5"
                  >
                    {isQuick && "badge" in workflow && workflow.badge && (
                      <span className="absolute right-4 top-4 rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                        {workflow.badge}
                      </span>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-serif text-lg font-semibold text-foreground">
                          {workflow.title}
                        </h4>
                        <p className="text-xs text-muted-foreground">{workflow.tagline}</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {workflow.steps.map((step) => (
                        <div key={step} className="flex items-start gap-2.5">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                          <span className="text-sm text-foreground">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-7 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 p-4">
              <p className="font-serif text-xl font-semibold text-foreground">
                One platform, two workflows — both in every pricing tier.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                PowerPoint and ProPresenter are powerful tools. Sermon Slide Pro gets your slides ready for them in minutes, not hours.
              </p>
            </div>

            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                variant="hero"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => {
                  trackEvent("landing_comparison_try_free_clicked");
                  navigate("/create");
                }}
              >
                Try Free Now
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => {
                  trackEvent("landing_comparison_unlock_clicked");
                  navigate("/signup");
                }}
              >
                Unlock Full Access
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default WorkflowComparison;
