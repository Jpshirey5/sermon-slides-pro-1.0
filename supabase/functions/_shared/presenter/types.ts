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

export type PresenterSlideKind = "title" | "point" | "scripture" | "blank" | "logo" | "credits" | "missing";

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
  style: SlideStyle;
}

export type BundleItemType = "sermon" | "scripture" | "blank" | "logo" | "credits";

export interface BundleItem {
  id: string;
  type: BundleItemType;
  label: string;
  /** Earliest expiry of the scripture in this item, or null if it has none. */
  expires_at: string | null;
  /** Translations whose text appears in this item, so a revocation can drop it. */
  translation_ids: string[];
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
