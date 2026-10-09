// Presenter core types. The bundle shapes come straight from the edge
// functions so the server and every presenter (browser now, desktop later)
// agree on one definition.

export type {
  BundleItem,
  BundleItemType,
  BundleTranslation,
  PresenterSlide,
  PresenterSlideKind,
  PresenterStatus,
  ServiceBundle,
  SlideStyle,
} from "../../../supabase/functions/_shared/presenter/types.ts";

import type { PresenterSlide } from "../../../supabase/functions/_shared/presenter/types.ts";

/** Where the operator is in the service. */
export interface Cursor {
  item: number;
  slide: number;
}

/** What the projector should show right now. */
export type OutputFrame =
  | { kind: "black" }
  | { kind: "logo"; logoPath: string | null }
  | { kind: "slide"; slide: PresenterSlide };

export type OutputMode = "live" | "black" | "logo";
