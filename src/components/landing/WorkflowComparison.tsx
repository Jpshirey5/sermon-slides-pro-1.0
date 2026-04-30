import { motion } from "framer-motion";
import { CheckCircle2, Monitor, Presentation, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { trackEvent } from "@/lib/monitoring";

const manualWorkflows = [
  {
    title: "PowerPoint Workflow",
    icon: Presentation,
    steps: [
      "Open PowerPoint",
      "Create slides one by one",
      "Paste scripture",
      "Format each slide",
      "Adjust layouts manually",
    ],
    footer: "Time consuming and repetitive",
  },
  {
    title: "ProPresenter Workflow",
    icon: Monitor,
    steps: [
      "Open ProPresenter",
      "Create slides one by one",
      "Paste scripture",
      "Format each slide",
      "Adjust layouts manually",
    ],
    footer: "Manual slide building every week",
  },
];

const proWorkflowSteps = [
  "Fill out sermon form",
  "Add points and scriptures",
  "Generate full deck",
  "Edit if needed",
  "Export to PowerPoint or ProPresenter",
];

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
            Built for pastors and church teams
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mt-3 mb-4">
            Stop building every sermon slide from scratch.
          </h2>
          <p className="text-lg text-muted-foreground">
            Generate your sermon once, then export it to PowerPoint or ProPresenter.
          </p>
        </motion.div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="order-2 space-y-5 lg:order-1">
            {manualWorkflows.map((workflow, index) => (
              <motion.div
                key={workflow.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="rounded-3xl border border-border/80 bg-white/55 p-6 shadow-sm opacity-85"
              >
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <workflow.icon className="h-5 w-5" />
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
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="order-1 rounded-[2rem] border border-primary/25 bg-white p-7 shadow-elevated lg:order-2"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Fastest workflow
            </div>
            <h3 className="font-serif text-2xl font-semibold text-foreground">
              Sermon Slide Pro Workflow
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Built to speed up sermon slide creation before PowerPoint or ProPresenter.
            </p>

            <div className="mt-7 space-y-3">
              {proWorkflowSteps.map((step) => (
                <div key={step} className="flex items-center gap-3 rounded-2xl bg-primary/5 px-4 py-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-foreground">{step}</span>
                </div>
              ))}
            </div>

            <div className="mt-7 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 p-4">
              <p className="font-serif text-xl font-semibold text-foreground">
                Build your entire sermon deck in minutes
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                PowerPoint and ProPresenter are powerful. Sermon Slide Pro helps you get there faster.
              </p>
            </div>

            <Button
              variant="hero"
              size="lg"
              className="mt-7 w-full sm:w-auto"
              onClick={() => {
                trackEvent("landing_comparison_try_now_clicked");
                navigate("/create");
              }}
            >
              Try it now
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default WorkflowComparison;
