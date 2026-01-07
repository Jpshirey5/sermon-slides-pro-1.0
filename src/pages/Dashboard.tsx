import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookOpen,
  Plus,
  Search,
  Calendar,
  MoreVertical,
  Trash2,
  Edit,
  Download,
  LogOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SermonPresentation {
  id: string;
  title: string;
  date: string;
  slides: number;
  lastModified: string;
  data?: {
    title: string;
    date: string;
    translation: string;
    points: Array<{
      id: string;
      title: string;
      scriptures: Array<{
        reference: string;
        text?: string;
      }>;
    }>;
  };
}

// Store presentations in localStorage for persistence
const STORAGE_KEY = 'sermon-presentations';

export function getPresentations(): SermonPresentation[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return [];
}

export function savePresentation(presentation: SermonPresentation): void {
  const presentations = getPresentations();
  const existingIndex = presentations.findIndex(p => p.id === presentation.id);
  if (existingIndex >= 0) {
    presentations[existingIndex] = presentation;
  } else {
    presentations.unshift(presentation);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presentations));
}

export function deletePresentation(id: string): void {
  const presentations = getPresentations().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presentations));
}

export function getPresentation(id: string): SermonPresentation | undefined {
  return getPresentations().find(p => p.id === id);
}

const Dashboard = () => {
  const [sermons, setSermons] = useState<SermonPresentation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    setSermons(getPresentations());
  }, []);

  const filteredSermons = sermons.filter((sermon) =>
    sermon.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = (id: string) => {
    deletePresentation(id);
    setSermons(getPresentations());
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-serif text-xl font-semibold text-foreground">
                SermonSlides
              </span>
            </Link>

            {/* Actions */}
            <div className="flex items-center gap-4">
              <Link to="/create">
                <Button variant="hero">
                  <Plus className="w-4 h-4" />
                  New Presentation
                </Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-10 h-10 rounded-full gradient-hero flex items-center justify-center text-primary-foreground font-semibold">
                    JS
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Edit className="w-4 h-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/")}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            My Presentations
          </h1>
          <p className="text-muted-foreground">
            Create and manage your sermon presentations
          </p>
        </motion.div>

        {/* Search & Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-col sm:flex-row gap-4 mb-8"
        >
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search presentations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12"
            />
          </div>
        </motion.div>

        {/* Sermons Grid */}
        {filteredSermons.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredSermons.map((sermon, index) => (
              <motion.div
                key={sermon.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 + index * 0.05 }}
                className="group relative bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/20 hover:shadow-elevated transition-all duration-300"
              >
                {/* Preview */}
                <Link to={`/editor/${sermon.id}`}>
                  <div className="aspect-video bg-gradient-to-br from-muted to-secondary flex items-center justify-center">
                    <div className="text-center p-4">
                      <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mx-auto mb-2">
                        <BookOpen className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {sermon.slides} slides
                      </p>
                    </div>
                  </div>
                </Link>

                {/* Content */}
                <div className="p-4">
                  <Link to={`/editor/${sermon.id}`}>
                    <h3 className="font-serif text-lg font-semibold text-foreground mb-1 hover:text-primary transition-colors">
                      {sermon.title}
                    </h3>
                  </Link>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(sermon.date).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Modified {sermon.lastModified}
                  </p>
                </div>

                {/* Actions */}
                <div className="absolute top-3 right-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="w-8 h-8 rounded-lg bg-background/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4 text-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/editor/${sermon.id}`}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Download className="w-4 h-4 mr-2" />
                        Export
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(sermon.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center py-16"
          >
            <div className="w-20 h-20 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-6 shadow-glow">
              <BookOpen className="w-10 h-10 text-primary-foreground" />
            </div>
            <h3 className="font-serif text-2xl font-semibold text-foreground mb-2">
              {searchQuery ? "No presentations found" : "No presentations yet"}
            </h3>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              {searchQuery
                ? "Try adjusting your search query"
                : "Create your first sermon presentation and start sharing your message beautifully."}
            </p>
            {!searchQuery && (
              <Link to="/create">
                <Button variant="hero" size="lg">
                  <Plus className="w-5 h-5" />
                  Create Your First Presentation
                </Button>
              </Link>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;