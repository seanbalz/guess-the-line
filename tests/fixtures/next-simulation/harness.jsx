// TEST ONLY. Bundle in memory and serve from a Playwright fake origin; never register in the production app.
import { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../web/src/styles.css';
import '../../../web/src/next/styles/tokens.css';
import '../../../web/src/next/styles/base.css';
import '../../../web/src/next/styles/components.css';
import { ReplayViewer } from '../../../web/src/next/simulation/ReplayViewer.jsx';
import { replayFixture } from './replay.mjs';

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'light' ? 'light' : 'dark';
const root = createRoot(document.getElementById('root'));
function Harness() {
  const [replay, setReplay] = useState(replayFixture);
  const [active, setActive] = useState(true);
  const [motion, setMotion] = useState(params.get('motion') === 'reduce' ? 'reduce' : undefined);
  useLayoutEffect(() => {
    window.__replayHarness = { setReplay, setActive, setMotion, fixture: replayFixture, unmount: () => root.unmount() };
    return () => { delete window.__replayHarness; };
  }, []);
  return <div className="gx" data-motion={motion}><main className="gx-screen"><h1 className="gx-t-title">Replay viewer test fixture</h1><ReplayViewer replay={replay} active={active}/></main></div>;
}
root.render(<Harness/>);
