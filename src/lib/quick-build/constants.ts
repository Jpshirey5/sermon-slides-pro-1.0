// QUICK BUILD ADDITION — shared constants for the manuscript-upload flow

export const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx"] as const;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const QUICK_BUILD_STEPS = [
  "Uploading your outline...",
  "Reading your document...",
  "Parsing sermon structure...",
  "Validating scripture references...",
  "Building your sermon...",
  "Done! Taking you to Sermon Review...",
] as const;
