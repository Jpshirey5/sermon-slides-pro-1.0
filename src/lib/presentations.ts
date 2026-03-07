// Presentation types and Supabase utilities
import { supabase } from "@/integrations/supabase/client";

export interface SermonPresentation {
  id: string;
  title: string;
  date: string;
  slides: number;
  lastModified: string;
  scripture_reference?: string;
  data?: {
    title: string;
    date: string;
    translation: string;
    verseBreakdown?: string;
    points: Array<{
      id: string;
      type?: 'point' | 'verse';
      title: string;
      scriptures: Array<{
        reference: string;
        text?: string;
        verses?: { text: string; verse: number }[];
      }>;
    }>;
  };
}

// The slides column stores a wrapper object with both form data and editor slides
interface SlidesWrapper {
  formData?: SermonPresentation['data'];
  editorSlides?: any[];
}

function isWrapped(slides: any): slides is SlidesWrapper {
  return slides && typeof slides === 'object' && !Array.isArray(slides) && ('formData' in slides || 'editorSlides' in slides);
}

function extractFormData(slides: any): SermonPresentation['data'] | undefined {
  if (isWrapped(slides)) return slides.formData;
  // Legacy: slides is the form data directly (has 'points')
  if (slides && typeof slides === 'object' && !Array.isArray(slides) && 'points' in slides) return slides as any;
  return undefined;
}

function extractEditorSlides(slides: any): any[] | null {
  if (isWrapped(slides)) return slides.editorSlides || null;
  // Legacy: slides is a raw array of editor slides
  if (Array.isArray(slides)) return slides;
  return null;
}

function countSlides(slides: any): number {
  const editor = extractEditorSlides(slides);
  if (editor) return editor.length;
  return 0;
}

async function getUserAccountId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc('get_user_account_id', { _user_id: user.id });
  return data || null;
}

export async function getPresentations(): Promise<SermonPresentation[]> {
  const accountId = await getUserAccountId();
  if (!accountId) return [];

  const { data, error } = await supabase
    .from('sermons')
    .select('*')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map(row => ({
    id: row.id,
    title: row.title,
    date: row.created_at.split('T')[0],
    slides: countSlides(row.slides),
    lastModified: new Date(row.updated_at).toLocaleDateString(),
    scripture_reference: row.scripture_reference || undefined,
    data: extractFormData(row.slides),
  }));
}

export async function savePresentation(presentation: SermonPresentation): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const accountId = await getUserAccountId();
  if (!accountId) return null;

  // Check if presentation already exists
  const { data: existing } = await supabase
    .from('sermons')
    .select('id, slides')
    .eq('id', presentation.id)
    .maybeSingle();

  // Build wrapper preserving existing editor slides
  const existingEditorSlides = existing ? extractEditorSlides(existing.slides) : null;
  const wrapper: SlidesWrapper = {
    formData: presentation.data,
    ...(existingEditorSlides ? { editorSlides: existingEditorSlides } : {}),
  };

  if (existing) {
    const { error } = await supabase
      .from('sermons')
      .update({
        title: presentation.title,
        slides: wrapper as any,
        scripture_reference: presentation.scripture_reference || null,
      })
      .eq('id', presentation.id);
    
    if (error) {
      console.error('Failed to update sermon:', error);
      return null;
    }
    return presentation.id;
  } else {
    const { data, error } = await supabase
      .from('sermons')
      .insert({
        title: presentation.title,
        account_id: accountId,
        created_by_user_id: user.id,
        slides: wrapper as any,
        scripture_reference: presentation.scripture_reference || null,
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('Failed to save sermon:', error);
      return null;
    }
    return data.id;
  }
}

export async function deletePresentation(id: string): Promise<void> {
  const { error } = await supabase
    .from('sermons')
    .delete()
    .eq('id', id);
  
  if (error) console.error('Failed to delete sermon:', error);
}

export async function getPresentation(id: string): Promise<SermonPresentation | undefined> {
  const { data, error } = await supabase
    .from('sermons')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return undefined;

  return {
    id: data.id,
    title: data.title,
    date: data.created_at.split('T')[0],
    slides: countSlides(data.slides),
    lastModified: new Date(data.updated_at).toLocaleDateString(),
    scripture_reference: data.scripture_reference || undefined,
    data: extractFormData(data.slides),
  };
}

// Save editor slides (the visual slide array) to the sermons table, preserving form data
export async function saveEditorSlides(sermonId: string, slides: any[]): Promise<void> {
  // First read existing to preserve formData
  const { data: existing } = await supabase
    .from('sermons')
    .select('slides')
    .eq('id', sermonId)
    .maybeSingle();

  const existingFormData = existing ? extractFormData(existing.slides) : undefined;

  const wrapper: SlidesWrapper = {
    ...(existingFormData ? { formData: existingFormData } : {}),
    editorSlides: slides,
  };

  const { error } = await supabase
    .from('sermons')
    .update({ slides: wrapper as any })
    .eq('id', sermonId);

  if (error) console.error('Failed to save editor slides:', error);
}

// Get editor slides from the sermons table
export async function getEditorSlides(sermonId: string): Promise<any[] | null> {
  const { data, error } = await supabase
    .from('sermons')
    .select('slides')
    .eq('id', sermonId)
    .maybeSingle();

  if (error || !data) return null;
  return extractEditorSlides(data.slides);
}
