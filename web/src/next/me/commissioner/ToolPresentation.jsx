// Presentation only: values and actions belong to the existing commissioner controllers.
import { Icon as Glyph, TeamMark } from '../../ui/index.js';

export function ToolHeading({ icon: Icon, children, detail }) {
  return <div className="gx-cm-heading"><span className="gx-cm-icon">{typeof Icon === 'string' ? <Glyph icon={Icon} size={26}/> : <Icon size={26} aria-hidden="true"/>}</span><div><h3 className="gx-t-strong">{children}</h3>{detail && <p className="gx-t-meta gx-c-2">{detail}</p>}</div></div>;
}

export function ToolMatchup({ game }) {
  return <div className="gx-cm-matchup" aria-hidden="true"><TeamMark code={game.awayCode ?? game.away} size={48} decorative/><span>at</span><TeamMark code={game.homeCode ?? game.home} size={48} decorative/></div>;
}

// Render composition keeps each tool's actions beside its controller state.
// Standalone views retain an inline fallback; the production host supplies Sheet.footer.
export const inlineTool = (body, footer) => <>{body}{footer}</>;
