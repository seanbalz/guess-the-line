// A pick screen's matchup with each team's record (D-62 rule 2), each side a 44px button that opens that team's sheet.
// Records come from the shared team read (teamsData.js); until it answers they come from the bundled file, so the card
// never waits. With `as` ("h2"), the matchup is that heading, named in one sentence with the records.
import { useShell } from '../shell/context.js';
import { Matchup, matchupWords, teamCode } from '../ui/index.js';
import { matchupRecords } from './teamModel.js';
import { useTeamSeason } from './teamsData.js';

/** `<TeamMatchup away="PHI" home="JAX" season={2026} as="h2"/>`; `from` is the back label when opened over a sheet. */
export function TeamMatchup({ away, home, season = null, size = 48, layout = 'stack', from = null, as: Heading = null, className, headingClassName }) {
  const shell = useShell();
  const { data } = useTeamSeason();
  const records = matchupRecords(data, away, home, season);
  const open = code => shell.openSheet('sh.team', from ? { team: code, from } : { team: code });
  const drawn = <Matchup away={away} home={home} size={size} layout={layout} records={records} onTeam={open} className={className}/>;
  if (!Heading) return drawn;
  return <Heading className={headingClassName} aria-label={matchupWords(teamCode(away), teamCode(home), records)}>{drawn}</Heading>;
}
