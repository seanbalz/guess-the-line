// D-69 moments under React's development double effects (StrictMode, as `npm run dev` and main.jsx render the app),
// for tests/cloud-browser/next-moments-strict.spec.js. One card holds the `features` scope and reports one badge the
// way useFeatures reports a read: from its first render when the read is cached ('cached'), or when it arrives later
// ('later', window.__deliver). Fixture ids only.
import { createRoot } from 'react-dom/client';
import { StrictMode, useEffect, useState } from 'react';
import { MomentsProvider, useMoments, useMomentScope, useNewCount } from '../../../web/src/next/moments/MomentsProvider.jsx';
import { markNavigated, markSettled, resetLaunch } from '../../../web/src/next/moments/launch.js';
import { momentsKey } from '../../../web/src/next/moments/seen.js';

const BADGE = { id: 'badge:fixture', kind: 'badge', scopes: ['features'], title: 'Bullseye' };
window.__shown = [];

function Card({ cached }) {
  useMomentScope('features');
  const moments = useMoments();
  const [read, setRead] = useState(cached ? [BADGE] : null);
  window.__deliver = () => setRead([BADGE]);
  useEffect(() => { if (read) moments?.report(read, { source: 'features:community' }); }, [read, moments?.report]);
  return <span data-new={useNewCount('features')}>card</span>;
}

window.__mount = (strict, when) => {
  resetLaunch();
  markSettled();
  markNavigated();
  localStorage.clear();
  localStorage.setItem(momentsKey('acct'), JSON.stringify(['source:features:community']));
  const root = document.createElement('div');
  document.body.append(root);
  const tree = <MomentsProvider account="acct" showOverlay={id => window.__shown.push(id)}><Card cached={when === 'cached'}/></MomentsProvider>;
  createRoot(root).render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};
