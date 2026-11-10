// Native EPL shell presentations with local shell/navigation injection only.
// No AppData, authenticated Menu, registry, API, storage or navigation controller imports.
import React from 'react';
import {Avatar,Button,Card,Icon,List,Row,Sheet} from '../../web/src/next/ui/index.js';
export const EPL_COPY = Object.freeze({
  nav: 'EPL',
  skip: 'Skip to main content',
  tabs: { home: 'Home', play: 'Play', bets: 'Bets', research: 'Research' },
  sections: { pick: 'Pick a Team', guess: 'Guess the Line', leaderboard: 'Leaderboard', fantasy: 'Fantasy' },
  noBets: "Bets aren't available for the Premier League.",
});

export function EplLeaguesView({shell}) {
  return <Sheet title="Your leagues" onClose={shell.closeSheet}>
    <Card variant="flush"><List label="Leagues">
      <Row size={64} start={<Avatar id="fepl" name="FEPL" size={40}/>} title="FEPL" sub="Premier League"
        end={<Icon icon="check" size={20} className="gx-c-accent"/>} aria-current="true" onClick={shell.closeSheet}/>
    </List></Card>
    <p className="gx-t-meta">Pick a Team and Fantasy use FEPL. Your NFL leagues remain available when you switch to NFL.</p>
  </Sheet>;
}
export function EplHistoryView({shell,navigateSport}) {
  return <div className="gx-screen" data-page="history">
    <Button haptic={false} variant="ghost" onClick={shell.closePage}><Icon icon="chevronLeft" size={20}/>Back</Button>
    <h1 className="gx-t-title">History</h1>
    <section className="gx-empty"><Icon icon="clock" size={32} aria-hidden="true"/><p className="gx-t-body">EPL history is not available here yet. Your saved picks and records are kept.</p></section>
    <Button haptic={false} onClick={() => navigateSport('#history')}>View NFL history</Button>
  </div>;
}
export function EplBetsView() {
  return <div className="gx-screen">
    <h1 className="gx-t-title">{EPL_COPY.tabs.bets}</h1>
    <section className="gx-empty"><Icon icon="ticket" size={32} aria-hidden="true"/><p className="gx-t-body">{EPL_COPY.noBets}</p></section>
  </div>;
}
