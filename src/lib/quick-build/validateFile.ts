// QUICK BUILD ADDITION — client-side file gate before any network request

import { ACCEPTED_TYPES, MAX_FILE_SIZE_BYTES, ACCEPTED_EXTENSIONS } from "./constants";
import type { QuickBuildErrorCode } from "./types";

export interface FileValidationResult {
  valid: boolean;
  errorCode?: QuickBuildErrorCode;
  errorMessage?: string;
}

const matchesAcceptedType = (file: File) => {
  if ((ACCEPTED_TYPES as readonly string[]).includes(file.type)) return true;
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
};

export function validateFile(file: File): FileValidationResult {
  if (!matchesAcceptedType(file)) {
    return {
      valid: false,
      errorCode: "INVALID_FILE",
      errorMessage: "This file type isn't supported. Please upload a .docx or .pdf file under 10MB.",
    };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      errorCode: "FILE_TOO_LARGE",
      errorMessage: "Your file is too large. Please upload a file under 10MB.",
    };
  }
  return { valid: true };
}
