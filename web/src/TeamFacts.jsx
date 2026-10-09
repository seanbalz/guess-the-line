import React from 'react';
import records from '../../shared/team-records-2026.json';
import { matchupFacts } from '../../shared/team-records.mjs';
import './teamFacts.css';

/** Plain records only (D-21): overall plus the away team's road and the home team's home record. */
export const isNeutral = (week, awayCode, homeCode) => (records.neutral_games || []).includes(`${week}:${awayCode}-${homeCode}`);

export default function TeamFacts({ week, awayCode, homeCode }) {
  const neutral = isNeutral(week, awayCode, homeCode);
  const facts = matchupFacts(records, awayCode, homeCode, { neutral });
  return <p className="team-facts mono"><span>{facts.away}</span><span>{facts.home}</span><small className="muted">Records {facts.as_of}{neutral ? ' · neutral site' : ''}</small></p>;
}
