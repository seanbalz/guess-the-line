// Native ProfileSettings validation predicate, isolated for the visual preview.
export const MAX_NAME=60;
export function profileDraft(text){const clean=typeof text==='string'?text.trim():'';return{clean,valid:!!clean&&clean.length<=MAX_NAME&&!/[\x00-\x1f\x7f]/.test(clean)};}
