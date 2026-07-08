// QUICK BUILD ADDITION — shared types for the manuscript-upload flow

export type SermonCreationMode = "structured_builder" | "quick_build";

export type QuickBuildErrorCode =
  | "LIMIT_REACHED"
  | "INVALID_FILE"
  | "FILE_TOO_LARGE"
  | "EXTRACTION_FAILED"
  | "PARSE_FAILED"
  | "AUTH_FAILED"
  | "INTERNAL";

export interface QuickBuildSuccessResponse {
  success: true;
  /** quick_build_parses row id — threaded to the save step to close the learning loop. */
  parse_id?: string | null;
  sermon_id: string;
  title: string;
  series: string | null;
  presentation_date: string;
  campus_id: string | null;
  form_data: any;
  points_count: number;
  verses_count: number;
  parsing_duration_ms: number;
  warnings: string[];
}

export interface QuickBuildErrorResponse {
  success: false;
  error_code: QuickBuildErrorCode;
  error_message: string;
  upgrade_required?: boolean;
}

export type QuickBuildResponse = QuickBuildSuccessResponse | QuickBuildErrorResponse;
