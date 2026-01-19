// Presentation types and localStorage utilities

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
