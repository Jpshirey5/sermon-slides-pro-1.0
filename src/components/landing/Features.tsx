import { motion } from "framer-motion";
import {
  Wand2,
  FileDown,
  Palette,
  BookOpen,
  Share2,
  Type,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: Wand2,
    title: "Auto-Generate Slides",
    description:
      "Enter your sermon points and scriptures. We'll create beautiful, structured slides automatically.",
  },
  {
    icon: FileDown,
    title: "Export Anywhere",
    description:
      "Build your deck first, then export to PowerPoint (.pptx) or ProPresenter (.probundle).",
  },
  {
    icon: BookOpen,
    title: "Scripture Integration",
    description:
      "Search any Bible translation worldwide. Verses are formatted and styled automatically.",
  },
  {
    icon: Palette,
    title: "Custom Backgrounds",
    description:
      "Upload your own images or choose from our curated library of worship-ready backgrounds.",
  },
  {
    icon: Type,
    title: "50+ Fonts",
    description:
      "Access a library of beautiful fonts perfect for worship presentations and readability.",
  },
  {
    icon: Zap,
    title: "Drag & Drop Editor",
    description:
      "Reorder slides, customize layouts, and perfect your presentation with intuitive controls.",
  },
  // {
  //   icon: Upload,
  //   title: "Church Branding",
  //   description:
  //     "Save your church colors, logos, and preferences for consistent branding across all sermons.",
  // },
  // {
  //   icon: Share2,
  //   title: "Easy Sharing",
  //   description:
  //     "Send presentations via email or shareable link. Team members can access instantly.",
  // },
];

const Features = () => {
  return (
    <section id="features" className="py-24">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <span className="text-accent font-medium text-sm uppercase tracking-wider">
            Features
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mt-3 mb-4">
            Everything You Need to Create{" "}
            <span className="text-gradient">Powerful Presentations</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Built specifically for ministry leaders. Speed up sermon slide
            creation before PowerPoint or ProPresenter.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group p-6 rounded-2xl glass-panel hover:border-primary/20 hover:shadow-elevated transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mb-4 group-hover:shadow-glow transition-shadow duration-300">
                <feature.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
