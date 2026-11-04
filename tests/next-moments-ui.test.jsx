// D-69 moments: the React layer renders nothing of its own and its hooks are safe without a provider.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MomentsProvider, useNewCount, useNewMoments, usePopped, useMomentScope, useMoments } from '../web/src/next/moments/MomentsProvider.jsx';

function Probe() {
  useMomentScope('features');
  const n = useNewCount('features');
  const popped = usePopped('badge:1');
  const moments = useMoments();
  return <span data-n={n} data-popped={String(popped)} data-has={String(moments !== null)}>x</span>;
}

describe('MomentsProvider', () => {
  it('without a provider the hooks do nothing: no NEW, no pop, no engine', () => {
    expect(renderToStaticMarkup(<Probe/>)).toBe('<span data-n="0" data-popped="false" data-has="false">x</span>');
  });
  it('with a provider it adds no markup and starts with nothing new', () => {
    const html = renderToStaticMarkup(<MomentsProvider account="acct" showOverlay={() => {}}><Probe/></MomentsProvider>);
    expect(html).toBe('<span data-n="0" data-popped="false" data-has="true">x</span>');
  });
  it('useNewMoments: nothing waits without a provider, or before its engine exists', () => {
    function Waiting() { return <span data-n={useNewMoments('features').length}>x</span>; }
    expect(renderToStaticMarkup(<Waiting/>)).toBe('<span data-n="0">x</span>');
    expect(renderToStaticMarkup(<MomentsProvider account="acct" showOverlay={() => {}}><Waiting/></MomentsProvider>)).toBe('<span data-n="0">x</span>');
  });
});
