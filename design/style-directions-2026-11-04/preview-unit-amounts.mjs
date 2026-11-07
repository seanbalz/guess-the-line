// Owner-requested 0.01U minimum for visual previews only. Production rules are unchanged.
export const PREVIEW_MIN_UNITS=0.01;
export const PREVIEW_UNIT_STEP=0.1;
export function validPreviewUnits(value){const n=Number(value);return String(value).trim()!==''&&Number.isFinite(n)&&n>=PREVIEW_MIN_UNITS&&n<=100&&Math.abs(n*100-Math.round(n*100))<1e-7;}
export function previewStepUnits(value,direction){return Math.max(PREVIEW_MIN_UNITS,Math.min(100,Math.round((Number(value)+direction*PREVIEW_UNIT_STEP)*100)/100));}
