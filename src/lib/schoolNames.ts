/**
 * Canonical English → Chinese mappings for schools whose Chinese name
 * the LLM commonly mis-translates. Keyed by the English name (case-
 * insensitive, normalized whitespace).
 *
 * Per the project rule of "never guess", this table starts with ONLY
 * entries that are independently verifiable from real failure data.
 * Extend it by sending a verified pair to llm.test.ts as a fixture.
 */
export const SCHOOL_NAME_OVERRIDES: Record<string, string> = {
  // 智谱 GLM-4.6V-Flash returned "伦敦大学学院" (UCL's Chinese name) when
  // extracting an Imperial offer. Confirmed wrong from raw extraction log.
  "imperial college london": "帝国理工学院",
};

/**
 * Look up the canonical Chinese name for a school by its English name.
 * Returns undefined if no override is registered.
 */
export function lookupSchoolZh(school: string | undefined): string | undefined {
  if (!school) return undefined;
  const key = school.trim().toLowerCase().replace(/\s+/g, " ");
  return SCHOOL_NAME_OVERRIDES[key];
}
