// Your gap's two shared pieces (D-69 step 4): a game's two marks for a picture row, and the error and notice lines,
// drawn by whichever of the list and the gap layer shows (the hidden one draws none, so each line is said once).
import { Button, Card, TeamMark } from '../../ui/index.js';
import { GAP_COPY } from './gapModel.js';

export const marks = (away, home) => <><TeamMark code={away} size={24} decorative/><TeamMark code={home} size={24} decorative/></>;

export function GapMessages({ gap }) {
  return <>
    {gap.error ? <Card variant="s2" role="alert" data-gap="error"><p className="gx-t-body">{gap.error}</p>
      <Button onClick={gap.refresh} disabled={gap.loading || gap.busy}>{gap.uncertain ? GAP_COPY.checkSaved : GAP_COPY.tryAgain}</Button></Card> : null}
    {gap.notice ? <p className="gx-t-body" role="status" data-gap="notice">{gap.notice}</p> : null}
  </>;
}
