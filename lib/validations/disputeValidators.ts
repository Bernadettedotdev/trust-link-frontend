import type { DisputeFormValues } from "./dispute";
import {
  DISPUTE_ERRORS,
  DISPUTE_FIELD_LIMITS,
  EMAIL_REGEX,
  getDisputeFileError,
  MAX_DISPUTE_FILES,
} from "./dispute";

type ErrorRecord = Partial<Record<keyof DisputeFormValues, string>>;

export function validateStep1Data(formData: DisputeFormValues): ErrorRecord {
  const newErrors: ErrorRecord = {};

  const name = formData.name?.trim() ?? "";
  if (!name) {
    newErrors.name = DISPUTE_ERRORS.nameRequired;
  } else if (name.length > DISPUTE_FIELD_LIMITS.name) {
    newErrors.name = DISPUTE_ERRORS.nameTooLong;
  }

  const email = formData.email?.trim() ?? "";
  if (!email) {
    newErrors.email = DISPUTE_ERRORS.emailRequired;
  } else if (email.length > DISPUTE_FIELD_LIMITS.email) {
    newErrors.email = DISPUTE_ERRORS.emailTooLong;
  } else if (!EMAIL_REGEX.test(email)) {
    newErrors.email = DISPUTE_ERRORS.emailInvalid;
  }

  const orderNumber = formData.orderNumber?.trim() ?? "";
  if (!orderNumber) {
    newErrors.orderNumber = DISPUTE_ERRORS.orderNumberRequired;
  } else if (orderNumber.length > DISPUTE_FIELD_LIMITS.orderNumber) {
    newErrors.orderNumber = DISPUTE_ERRORS.orderNumberTooLong;
  }

  return newErrors;
}

export function validateStep2Data(formData: DisputeFormValues): ErrorRecord {
  const newErrors: ErrorRecord = {};

  const reason = formData.reason?.trim() ?? "";
  if (!reason) {
    newErrors.reason = DISPUTE_ERRORS.reasonRequired;
  } else if (reason.length > DISPUTE_FIELD_LIMITS.reason) {
    newErrors.reason = DISPUTE_ERRORS.reasonTooLong;
  }

  const description = formData.description?.trim() ?? "";
  if (!description) {
    newErrors.description = DISPUTE_ERRORS.descriptionRequired;
  } else if (description.length < 20) {
    newErrors.description = DISPUTE_ERRORS.descriptionTooShort;
  } else if (description.length > DISPUTE_FIELD_LIMITS.description) {
    newErrors.description = DISPUTE_ERRORS.descriptionTooLong;
  }

  return newErrors;
}

export function validateStep3Data(formData: DisputeFormValues): ErrorRecord {
  const newErrors: ErrorRecord = {};

  if (formData.files.length === 0) {
    newErrors.files = DISPUTE_ERRORS.filesRequired;
    return newErrors;
  }

  if (formData.files.length > MAX_DISPUTE_FILES) {
    newErrors.files = DISPUTE_ERRORS.filesTooMany;
    return newErrors;
  }

  const fileError = formData.files
    .map((file) => getDisputeFileError(file))
    .find((message): message is string => message !== null);

  if (fileError) {
    newErrors.files = fileError;
  }

  return newErrors;
}

export function validateStep4Data(formData: DisputeFormValues): ErrorRecord {
  const newErrors: ErrorRecord = {};

  if (!formData.agreeToTerms) {
    newErrors.agreeToTerms = DISPUTE_ERRORS.agreeToTerms;
  }

  return newErrors;
}
