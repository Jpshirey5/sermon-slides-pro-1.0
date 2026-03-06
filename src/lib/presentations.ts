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
    slides: Array.isArray(row.slides) ? (row.slides as any[]).length : 0,
    lastModified: new Date(row.updated_at).toLocaleDateString(),
    scripture_reference: row.scripture_reference || undefined,
    data: row.slides && typeof row.slides === 'object' && 'points' in (row.slides as any)
      ? row.slides as any
      : undefined,
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
    .select('id')
    .eq('id', presentation.id)
    .maybeSingle();

  if (existing) {
    // Update
    const { error } = await supabase
      .from('sermons')
      .update({
        title: presentation.title,
        slides: presentation.data as any || [],
        scripture_reference: presentation.scripture_reference || null,
      })
      .eq('id', presentation.id);
    
    if (error) {
      console.error('Failed to update sermon:', error);
      return null;
    }
    return presentation.id;
  } else {
    // Insert
    const { data, error } = await supabase
      .from('sermons')
      .insert({
        title: presentation.title,
        account_id: accountId,
        created_by_user_id: user.id,
        slides: presentation.data as any || [],
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
    slides: Array.isArray(data.slides) ? (data.slides as any[]).length : 0,
    lastModified: new Date(data.updated_at).toLocaleDateString(),
    scripture_reference: data.scripture_reference || undefined,
    data: data.slides && typeof data.slides === 'object' && 'points' in (data.slides as any)
      ? data.slides as any
      : undefined,
  };
}

// Save editor slides (the visual slide array) to the sermons table
export async function saveEditorSlides(sermonId: string, slides: any[]): Promise<void> {
  const { error } = await supabase
    .from('sermons')
    .update({
      slides: slides as any,
    })
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
  
  // If slides is an array of slide objects (editor format), return it
  if (Array.isArray(data.slides)) {
    return data.slides as any[];
  }
  return null;
}
