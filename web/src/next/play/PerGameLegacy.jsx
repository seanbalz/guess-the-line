// Compatibility surface for the old Community Picks page. Only downloaded once the server enables M-07.
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import './play.css';
import { useEffect } from 'react';
import { addNextFontLinks } from '../styles/fonts.js';
import { PerGameEditor } from './PerGamePlay.jsx';

export default function PerGameLegacy(props) {
  useEffect(() => { addNextFontLinks(); }, []);
  return <div className="gx gx-legacy-per-game"><div className="gx-live-play"><PerGameEditor {...props}/></div></div>;
}
