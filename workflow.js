import {freshClay} from './clay.js';

// Returning to an earlier station restarts that station and every later process.
export function restartFrom(work, station) {
  if (!work) return;
  work.assessment = null;
  work.preview = null;
  work.inspection = null;
  work.explanationUse = '';
  work.explanationBeauty = '';
  work.title = '';
  delete work.titleMotif;
  work.firing = [];
  if (station === 'clay' || station === 'shape' || station === 'decorate') {
    work.placements = [];
    work.strokes = [];
    work.drawingLabel = null;
    work.decorPhase = 0;
    work.decorDone = false;
    delete work.inlay;
    delete work.inlayMode;
  }
  if (station === 'clay' || station === 'shape') {
    work.knead = 0;
    work.sculpt = null;
    work.viewFrame = 0;
  }
  if (station === 'clay') work.clay = freshClay();
  work.step = station === 'decorate' ? 1 : station === 'kiln' ? 2 : 0;
  work.stationView = station === 'clay' ? 'clay' : 'game';
}

export function restartInlay(work) {
  work.decorDone = false;
  work.decorPhase = 1;
  work.firing = [];
  work.assessment = null;
  work.preview = null;
  delete work.inlay;
  work.inlayMode = 'fill';
}
