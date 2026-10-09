// The shape of a presenter bundle: everything a presenter needs to run one
// service. No imports, so the browser presenter (and later the desktop shell)
// can share these types.
//
// Scripture slides carry their attribution line as data. A renderer shows it
// whenever it shows the text; there is no option to hide it.

export interface SlideStyle {
  background: string;
  /** Storage path or data URL, resolved by the client like the editor does. */
  backgroundImage?: string | null;
  fontFamily: string;
  textColor: string;
  lineSpacing?: number | null;
  fontSize?: number | null;
}

export type PresenterSlideKind = "title" | "point" | "scripture" | "lyrics" | "graphic" | "video" | "blank" | "logo" | "credits" | "missing";

/** What happens when a video reaches its end. */
export type VideoEndAction = "hold" | "clear" | "next";

export interface SlideVideo {
  media_id: string;
  /** Path in the private service-media bucket; the operator turns it into a playable URL. */
  storage_path: string;
  duration_seconds: number | null;
  loop: boolean;
  end_action: VideoEndAction;
  /** Resolved playable URL, filled in by the operator before a frame is sent. */
  src?: string;
}

/** Stage display layouts. Each item picks one; the operator can switch live. */
export type StageTemplate = "worship" | "message" | "video" | "simple";

export const STAGE_TEMPLATES: readonly StageTemplate[] = ["worship", "message", "video", "simple"];

export interface PresenterSlide {
  id: string;
  kind: PresenterSlideKind;
  title?: string;
  subtitle?: string;
  /** Scripture only. */
  text?: string;
  /** Scripture only, for example "John 3:16-17 (NIV)". */
  reference?: string;
  /** Scripture only. Always rendered with the text. */
  attribution?: string;
  translation_id?: string;
  /** Scripture only. Reported through FUMS each time the slide is shown. */
  fums_tokens?: string[];
  /** Credits only: one full notice per translation used in the service. */
  notices?: { translation_id: string; name: string; notice: string }[];
  /** Missing only: why this slide has no text. */
  missing_reason?: string;
  /** Lyrics only: the section, for example "Chorus". */
  label?: string;
  /** Lyrics only: song credit line (title, author, copyright, CCLI numbers). */
  credit?: string;
  /** Speaker notes. Shown on the stage display only, never on the main screen. */
  notes?: string;
  /**
   * Where this slide comes from, so the workspace can edit it: a sermon's
   * editor slides, or a custom Slides item's own list.
   */
  source?: { sermon_id?: string; item_id?: string; slide_indexes: number[] };
  /** Video slides only. */
  video?: SlideVideo;
  style: SlideStyle;
}

export type BundleItemType = "sermon" | "scripture" | "song" | "slides" | "video" | "blank" | "logo" | "credits";

export interface BundleItem {
  id: string;
  type: BundleItemType;
  label: string;
  /** Earliest expiry of the scripture in this item, or null if it has none. */
  expires_at: string | null;
  /** Translations whose text appears in this item, so a revocation can drop it. */
  translation_ids: string[];
  /** Stage display settings for this item. */
  stage: { template: StageTemplate; timer_seconds: number | null };
  sermon_id?: string | null;
  song_id?: string | null;
  media_id?: string | null;
  slides: PresenterSlide[];
}

export interface BundleTranslation {
  id: string;
  name: string;
  attribution: string;
  notice: string;
  is_public_domain: boolean;
}

export interface ServiceBundle {
  service: { id: string; title: string; service_date: string | null; logo_path: string | null };
  items: BundleItem[];
  translations: Record<string, BundleTranslation>;
  issued_at: string;
  /** Never more than 24 hours after issued_at, and never after any item expires. */
  bundle_expires_at: string;
  revocation_epoch: number;
}

export interface PresenterStatus {
  revocation_epoch: number;
  /** Translations this account may not show right now. */
  unavailable_translations: string[];
  can_present: boolean;
  checked_at: string;
}
