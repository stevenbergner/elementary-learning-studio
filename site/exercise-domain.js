import { compileSurfaceDomain, resolveDomainEvidence } from "./vendor/local-speech-interface/domain-grammar.js";

function nonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be non-empty text`);
  return value.trim();
}

export function compileExerciseSheet(sheet) {
  const id = nonEmpty(sheet?.id, "exercise sheet id");
  const locale = nonEmpty(sheet?.locale, "exercise sheet locale");
  if (!Array.isArray(sheet?.prompts) || !sheet.prompts.length) throw new TypeError("exercise sheet requires prompts");
  const prompts = new Map();

  for (const prompt of sheet.prompts) {
    const promptId = nonEmpty(prompt?.id, "prompt id");
    if (prompts.has(promptId)) throw new Error(`duplicate prompt id: ${promptId}`);
    if (!Array.isArray(prompt?.answers) || !prompt.answers.length) throw new TypeError(`prompt ${promptId} requires accepted answers`);
    const entries = prompt.answers.flatMap((answer) => {
      const answerId = nonEmpty(answer?.id, `answer id for ${promptId}`);
      const canonical = nonEmpty(answer?.canonical, `canonical answer ${answerId}`);
      if (!Array.isArray(answer?.surfaces) || !answer.surfaces.length) throw new TypeError(`answer ${answerId} requires surfaces`);
      return answer.surfaces.map((surface) => ({
        locale,
        surface,
        value: { kind: "exercise-answer", promptId, answerId },
        canonicalForm: canonical,
      }));
    });
    const domain = compileSurfaceDomain({
      id: `${id}:${promptId}`,
      locales: [locale],
      entries,
      key: (value) => `${value.promptId}:${value.answerId}`,
    });
    prompts.set(promptId, Object.freeze({ ...prompt, domain }));
  }

  return Object.freeze({
    id,
    locale,
    promptIds: Object.freeze([...prompts.keys()]),
    resolve(promptId, evidence) {
      const prompt = prompts.get(promptId);
      if (!prompt) throw new RangeError(`unknown prompt: ${promptId}`);
      return resolveDomainEvidence(evidence, prompt.domain, { locale });
    },
  });
}
