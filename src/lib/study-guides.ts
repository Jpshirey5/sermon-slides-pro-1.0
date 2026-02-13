// Study Guide and Conference data types and localStorage utilities

export interface WeekContent {
  week: number;
  title: string;
  keyPoints: string[];
  discussionQuestions: string[];
  scriptureReferences: string[];
  rawContent: string;
}

export interface SessionContent {
  session: number;
  title: string;
  typeLabel: 'Breakout Session' | 'Main Session' | 'Workshop';
  teachingOutline: string[];
  keyTakeaways: string[];
  discussionPrompts: string[];
  scriptureReferences: string[];
  facilitatorNotes: string;
  rawContent: string;
}

export interface StudyGuide {
  id: string;
  title: string;
  sourceType: 'manuscript' | 'presentation';
  sourceId?: string;
  outputType: 'study-guide' | 'conference';
  // Study guide fields
  weeks?: number;
  content?: WeekContent[];
  // Conference fields
  eventTitle?: string;
  eventDescription?: string;
  sessionDuration?: number;
  sessions?: SessionContent[];
  // Metadata
  createdAt: string;
  lastModified: string;
}

const STORAGE_KEY = 'sermon-study-guides';

export function getStudyGuides(): StudyGuide[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  return [];
}

export function saveStudyGuide(guide: StudyGuide): void {
  const guides = getStudyGuides();
  const existingIndex = guides.findIndex(g => g.id === guide.id);
  if (existingIndex >= 0) {
    guides[existingIndex] = guide;
  } else {
    guides.unshift(guide);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(guides));
}

export function deleteStudyGuide(id: string): void {
  const guides = getStudyGuides().filter(g => g.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(guides));
}

export function getStudyGuide(id: string): StudyGuide | undefined {
  return getStudyGuides().find(g => g.id === id);
}
