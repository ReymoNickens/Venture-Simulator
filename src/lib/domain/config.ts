export const DEFAULT_GROUP_SIZE = 10;
export const DEFAULT_MAX_PHOTO_BYTES = 800_000;
export const DEFAULT_MAX_PHOTO_EDGE = 1280;
export const JPEG_QUALITY = 0.72;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ASSUMPTION_LANGUAGE =
  /\b(everyone|everybody|all students|most students|will (buy|pay|use)|obviously|always|never)\b/i;

export const SOURCE_TYPES = [
  { value: "interview", label: "Interview" },
  { value: "survey", label: "Survey" },
  { value: "observation", label: "Observation" },
  { value: "quotation", label: "Quotation" },
  { value: "photo", label: "Photograph" },
  { value: "other", label: "Other" },
] as const;

export const CLASSIFICATIONS = [
  { value: "fact", label: "Fact", hint: "Directly observed or independently verifiable." },
  { value: "evidence", label: "Evidence", hint: "A record that supports or challenges a claim." },
  { value: "assumption", label: "Assumption", hint: "Something you are treating as true without proof yet." },
  { value: "inference", label: "Inference", hint: "A conclusion you drew from something else." },
  { value: "opinion", label: "Opinion", hint: "A judgement or preference, not a finding." },
  { value: "unknown", label: "Unknown", hint: "You are not sure yet. That is allowed." },
] as const;

export const IMPORTANCE_LEVELS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export const CONFIDENCE_LEVELS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export const JOURNEY_STEPS = [
  { id: "group", label: "Join group", href: "/studio/group" },
  { id: "opportunity", label: "Find opportunity", href: "/studio/opportunity" },
  { id: "submit", label: "Submit idea", href: "/studio/opportunity" },
  { id: "select", label: "Select venture", href: "/studio/select" },
  { id: "evidence", label: "Collect evidence", href: "/studio/venture" },
  { id: "assumptions", label: "Test assumptions", href: "/studio/venture" },
] as const;
