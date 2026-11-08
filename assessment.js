import {assessmentInput, assessmentFingerprint, normalizeAssessment, rubricAssessment} from './assessment-rules.js';
export {assessmentMatches, assessmentFingerprint, explanationHints} from './assessment-rules.js';

export async function requestAssessment(work, {signal} = {}) {
  const previous = normalizeAssessment(work.assessment, work);
  if (previous?.source === 'ai' && previous.accepted) return previous;
  const payload = assessmentInput(work);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 32000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, {once: true});
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const response = await fetch('/api/assess', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), signal: controller.signal});
    if (!response.ok) throw new Error(`assessment-${response.status}`);
    const raw = await response.json();
    const result = normalizeAssessment(raw, work);
    if (!result) throw new Error('Invalid assessment');
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    return rubricAssessment(work);
  } finally {
    clearTimeout(timer);signal?.removeEventListener('abort', abort);
  }
}
