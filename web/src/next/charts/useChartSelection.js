import { useState } from 'react';

// A new evidence key resets selection before paint; ordinary rerenders retain it.
export function useChartSelection(key, count) {
  const last = Math.max(0, count - 1);
  const [selection, setSelection] = useState({ key, index: last });
  if (selection.key !== key) setSelection({ key, index: last });
  const index = selection.key === key ? selection.index : last;
  const onSelect = index => setSelection(current => current.key === key && current.index === index ? current : { key, index });
  return { key, index, onSelect };
}
