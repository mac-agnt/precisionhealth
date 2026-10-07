/* The participant questionnaire shown in the portal preview. The questions, sections and helpers
   now live in the model (src/ph/model/questionnaire.ts) so the nurse form, the clinician viewer and
   the participant report read the same keys. Re-exported here so portal pages keep their imports. */
export {
  SECTION_QUESTIONS, SECTIONS, CONSENT_KEYS, isBlank, visible, sectionErrors, sectionPayload, answerText, questionLabel,
} from "../../model";
export type { AnswerValue as Answer, Answers, Question, QuestionCtx } from "../../model";
