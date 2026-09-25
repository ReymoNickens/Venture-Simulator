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

export const EXPERIMENT_METHODS = [
  { value: "interviews", label: "Talk to people", hint: "5–10 short conversations with the people who have the problem." },
  { value: "observation", label: "Watch and count", hint: "Go where it happens. Count, time, photograph." },
  { value: "survey", label: "Quick survey", hint: "A few specific questions to more people. Numbers, not opinions." },
  { value: "pre_sale", label: "Ask them to pay", hint: "Take a deposit or a pre-order. Money is the strongest signal." },
  { value: "prototype_test", label: "Try a rough version", hint: "A paper sketch, a WhatsApp group, a table outside the hall." },
  { value: "other", label: "Something else", hint: "Describe it in the hypothesis." },
] as const;

export const EXPERIMENT_RESULTS = [
  { value: "supports", label: "It held up", hint: "What you saw met your success line." },
  { value: "challenges", label: "It didn't hold", hint: "What you saw contradicts the assumption." },
  { value: "inconclusive", label: "Not sure yet", hint: "Too little data, or mixed signals." },
] as const;

export const valuesOf = <T extends readonly { value: string }[]>(list: T) => new Set(list.map((x) => x.value));
export const VALID = {
  source: valuesOf(SOURCE_TYPES),
  classification: valuesOf(CLASSIFICATIONS),
  importance: valuesOf(IMPORTANCE_LEVELS),
  confidence: valuesOf(CONFIDENCE_LEVELS),
  method: valuesOf(EXPERIMENT_METHODS),
  result: valuesOf(EXPERIMENT_RESULTS),
  relationship: new Set(["supports", "challenges"]),
  stage: new Set(["idea", "selection", "evidence"]),
};

export const JOURNEY_STEPS = [
  { id: "team", label: "Team", href: "/studio/group" },
  { id: "idea", label: "Your idea", href: "/studio/opportunity" },
  { id: "decide", label: "Decide", href: "/studio/select" },
  { id: "evidence", label: "Evidence", href: "/studio/venture" },
  { id: "assumptions", label: "Assumptions", href: "/studio/venture" },
  { id: "test", label: "Test", href: "/studio/venture" },
] as const;

/** Where the course goes after this build. Shown so students see the whole arc. */
export const LATER_CHAPTERS = [
  { title: "Business model", body: "Who pays, for what, and what it costs you." },
  { title: "Prototype", body: "Build a rough version and put it in front of people." },
  { title: "Money", body: "Pricing, costs and break-even from your own evidence." },
  { title: "Plan & pitch", body: "Your evidence record becomes the plan you defend." },
] as const;
