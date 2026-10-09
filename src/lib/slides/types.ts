// The editor's slide model. Saved inside sermons.slides as editorSlides.
export interface SlideData {
  id: string;
  type: 'title' | 'point' | 'scripture' | 'blank';
  content: {
    title?: string;
    subtitle?: string;
    scripture?: string;
    reference?: string;
  };
  background: string;
  backgroundImage?: string;
  fontFamily: string;
  textColor: string;
  lineSpacing?: number;
  fontSize?: number;
  /** Speaker notes: shown on the stage display only. */
  notes?: string;
}
