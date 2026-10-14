// Redesign stage 8: a test-only gallery of the new app's UI kit for tests/cloud-browser/next-ui.spec.js. The spec
// bundles this file with Vite in memory and serves it from a fake origin; it never ships in the app. It loads the old
// app's styles.css first, as every page does, then the three new stylesheets. Fictional names and fixed times only.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../web/src/styles.css';
import '../../../web/src/next/styles/tokens.css';
import '../../../web/src/next/styles/base.css';
import '../../../web/src/next/styles/components.css';
import {
  Avatar, AvatarStack, Badge, Button, Card, CardButton, Chip, ChipRail, Countdown, Dialog, DriveMeter, FieldMark, GateBanner,
  IconButton, LinkRow, List, LockCell, LockLine, Meter, Move, Overlay, Pill, Rank, Row, Segmented, Sheet, Strip, Tag,
  TeamMark, Text, Toast,
} from '../../../web/src/next/ui/index.js';
import { gateBanner, weekSummary } from '../../../web/src/next/rules.js';
import * as copy from '../../../web/src/next/copy.js';
import { teamMarks } from '../../../web/src/teamLogoRegistry.js';

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'light' ? 'light' : 'dark';

const HOUR = 3_600_000, MIN = 60_000, DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-13T20:03:00Z'); // Tue Oct 13, 1:03 PM PT
const KICKOFF = Date.parse('2026-10-16T00:15:00Z'); // Thu Oct 15, 5:15 PM PT
const PEOPLE = [
  { id: 'acct-1', name: 'Avery Stone' },
  { id: 'acct-2', name: 'Blake Rivers' },
  { id: 'acct-3', name: 'Casey Moore', you: true },
  { id: 'acct-4', name: 'Drew Lane' },
  { id: 'acct-5', name: 'Emery Fox' },
  { id: 'acct-6', name: 'Finley Hart' },
];
const WEEK = weekSummary({ games: [{ id: 'g1', kickoff: KICKOFF }, { id: 'g2', kickoff: KICKOFF + DAY }], entries: {}, now: NOW });
const SHOWDOWN = 'M3 6l6 6-6 6M21 6l-6 6 6 6';

// What the gallery's handlers did, for the spec to read.
window.__events = [];
const record = name => () => window.__events.push(name);

function Section({ title, children }) {
  return (
    <section className="gx-vstack gx-gap-12" aria-label={title}>
      <Text as="h2" variant="section">{title}</Text>
      {children}
    </section>
  );
}

function Gallery() {
  const [sheet, setSheet] = useState(null);
  const [dialog, setDialog] = useState(false);
  const [toast, setToast] = useState(null);
  const [overlay, setOverlay] = useState(false);
  const [market, setMarket] = useState('spread');
  const [pick, setPick] = useState(2.5);
  const [live, setLive] = useState(null);
  return (
    <div className="gx">
      <main className="gx-screen">
        <div className="gx-screen-head">
          <Text as="h1" variant="title">UI kit</Text>
          <IconButton icon="help" label="How to play" onClick={record('help')}/>
        </div>

        <Section title="Hero">
          <Card as="section" variant="hero" aria-labelledby="hero-title" className="gx-vstack gx-gap-12">
            <Text as="h3" variant="section" tone={2} id="hero-title">{copy.dueIn(6)}</Text>
            <div className="gx-hstack gx-gap-12 gx-wrap">
              <Countdown target={KICKOFF} now={NOW} label={copy.dueIn(6)}/>
              <AvatarStack people={PEOPLE} label="6 of 7 in"/>
            </div>
            <Text variant="meta" tone={2}>Spread in · Total 8 of 14</Text>
            <Button variant="primary" block onClick={record('primary')}>Finish Total picks · 6 left</Button>
          </Card>
          <div className="gx-hstack gx-gap-8 gx-wrap">
            <Countdown target={KICKOFF} now={KICKOFF - 90 * MIN} variant="pill" pillPrefix="Due"/>
            <Countdown target={KICKOFF} now={NOW} variant="pill" pillPrefix="Due"/>
            <Countdown target={KICKOFF} now={KICKOFF + MIN} doneLabel="Picks are due"/>
          </div>
          <Button onClick={() => setLive(Date.now() + 2 * HOUR - MIN + 4000)}>Start a live countdown</Button>
          {live ? <Countdown target={live} label="Live test" announcements={{ twoHours: 'Two hours left in the test.' }}/> : null}
        </Section>

        <Section title="Text and buttons">
          <Text as="p" variant="display">Bullseye</Text>
          <Text as="p" variant="body">Reading text in Figtree, 16 on 24.</Text>
          <Text as="p" variant="meta" tone={2}>Thu 5:15 PM PT · TNF</Text>
          <div className="gx-hstack gx-gap-12 gx-wrap">
            <Text variant="team">SEA</Text>
            <Text variant="n-m">−3</Text>
            <Text variant="n-s">41.5</Text>
            <Text variant="n-xs" tone={2}>−110</Text>
            <Text variant="micro" tone={3}>Spread</Text>
          </div>
          <Button variant="secondary" icon="people" onClick={record('challenge')}>Challenge a friend</Button>
          <Button variant="danger" onClick={() => setDialog(true)}>Skip this week</Button>
          <div className="gx-hstack gx-gap-8 gx-wrap">
            <Button variant="ghost" iconEnd="chevronRight" onClick={record('ghost')}>See all trends</Button>
            <Button variant="ghost-2" onClick={record('ghost2')}>Not now</Button>
            <Button disabled>Lock in picks</Button>
          </div>
          <div className="gx-hstack gx-gap-8">
            <IconButton icon="bell" label="Pick reminders" pressed={false} onClick={record('bell')}/>
            <IconButton icon="settings" label="Settings" onClick={record('settings')}/>
            <IconButton icon="close" label="Close the example" onClick={record('close')}/>
          </div>
        </Section>

        <Section title="Lock">
          <GateBanner gate={gateBanner(WEEK, 'spread')} onCta={record('cta')} onSkip={() => setDialog(true)}/>
          <LockLine>{copy.picksHidden('total')}</LockLine>
          <div className="gx-hstack gx-gap-8">
            <LockCell label={copy.lineLocked('spread')} style={{ width: 113, height: 52 }}/>
            <Text variant="meta" tone={2}>A hidden line</Text>
          </div>
        </Section>

        <Section title="Board">
          <Segmented label="Market" options={[{ value: 'spread', label: 'Spread' }, { value: 'total', label: 'Total' }]} value={market} onChange={setMarket}/>
          <Card variant="flush">
            <List label={`${market === 'spread' ? 'Spread' : 'Total'} board`}>
              <Row size={64} start={<><Rank rank={1}/><Move by={2}/><Avatar id="acct-1" name="Avery Stone" size={36}/></>} title="Avery Stone" sub="Closest streak 4" end={<Text variant="n-m">112.5</Text>}/>
              <Row size={64} you start={<><Rank rank="T-2"/><Move by={-1}/><Avatar id="acct-3" name="Casey Moore" size={36} you/></>} title="You" sub="Pick streak 4" end={<Text variant="n-m">96.5</Text>}/>
              <Row size={64} start={<><Rank rank="T-2"/><Move by={0}/><Avatar id="acct-2" name="Blake Rivers" size={36}/></>} title="Blake Rivers" end={<Text variant="n-m">96.5</Text>}/>
              <Row size={64} start={<><Rank rank={null}/><Move by={null}/><Avatar id="acct-4" name="Drew Lane" size={36}/></>} title="Drew Lane" sub="Ranked after the first scored game" end={<Text variant="n-m" tone={3}>—</Text>}/>
            </List>
          </Card>
          <Card variant="flush">
            <List label="Waiting">
              <Row wait chevron onClick={() => setSheet('main')} start={<Avatar id="acct-2" name="Blake Rivers" size={40}/>} title="Blake Rivers challenged you" sub="SEA @ DEN · Spread · 1U"/>
              <LinkRow icon="settings" onClick={record('linkrow')}>Settings</LinkRow>
            </List>
          </Card>
        </Section>

        <Section title="Status">
          <div className="gx-hstack gx-gap-8 gx-wrap">
            <Pill tone="live">Live</Pill>
            <Pill>Final</Pill>
            <Pill tone="win">Won</Pill>
            <Pill tone="loss">Lost</Pill>
            <Pill tone="pending">Late · 12 min</Pill>
            <Pill tone="data">Provisional</Pill>
            <Pill tone="accent">You</Pill>
            <Pill tone="real">Real slip</Pill>
          </div>
          <div className="gx-hstack gx-gap-8 gx-wrap">
            <Tag>SEA −2.5</Tag>
            <Tag k="Bet">KC −8 · 1U</Tag>
          </div>
          <div className="gx-hstack gx-gap-12">
            <Meter value={2} label="2 of 3 bets"/>
          </div>
          <div className="gx-hstack gx-gap-8">
            <Text variant="label">Pick streak</Text>
            <Text variant="n-s">4</Text>
            <DriveMeter value={4} label="Pick streak, 4 weeks"/>
          </div>
          <div className="gx-hstack gx-gap-12 gx-wrap">
            <Badge iconPath={SHOWDOWN} size={24}/>
            <Badge icon="target" size={40} rarity="uncommon"/>
            <Badge iconPath={SHOWDOWN} rarity="rare" label="Showdown, rare"/>
            <Badge icon="trophy" size={56} rarity="epic" label="Weekly award, epic"/>
            <Badge icon="target" size={56} locked label="Bullseye, locked"/>
          </div>
        </Section>

        <Section title="Picks">
          <ChipRail label="Seattle by">
            {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].map(n => (
              <Chip key={n} selected={pick === n} label={`Seattle by ${n}`} onClick={() => setPick(n)}>{n}</Chip>
            ))}
            <Chip text onClick={record('more')}>More</Chip>
          </ChipRail>
          <Strip
            label="6 guesses from DEN +1 to DEN +4.5; the line is DEN +3"
            linePct={60}
            lowLabel="DEN +1"
            highLabel="DEN +4.5"
            items={PEOPLE.map((p, i) => ({ ...p, pct: [0, 40, 44, 47, 80, 100][i] }))}
          />
          <div className="gx-hstack gx-gap-12">
            <Strip mini label="Where 6 guesses landed" items={PEOPLE.map((p, i) => ({ ...p, pct: [0, 40, 44, 47, 80, 100][i] }))} linePct={60}/>
            <Avatar anyone size={40}/>
          </div>
        </Section>

        <Section title="Teams">
          <div className="gx-hstack gx-gap-12">
            <TeamMark code="BUF" name="Buffalo Bills" size={48}/>
            <TeamMark code="LAR" name="Los Angeles Rams"/>
            <TeamMark code="KC" name="Kansas City Chiefs" size={24}/>
            <TeamMark code="XYZ" size={32}/>
            <FieldMark label="Guess The Line"/>
            <FieldMark size={40}/>
          </div>
          <div className="gx-hstack gx-gap-8 gx-wrap" role="group" aria-label="Every team">
            {Object.keys(teamMarks).sort().map(code => <TeamMark key={code} code={code} size={24}/>)}
          </div>
        </Section>

        <Section title="Layers">
          <CardButton variant="wait" className="gx-vstack gx-gap-4" onClick={() => setSheet('main')}>
            <Text variant="strong">SEA @ DEN</Text>
            <Text variant="meta" tone={2}>Open the game sheet</Text>
          </CardButton>
          <Button onClick={() => setSheet('sub')}>Open a sub-view</Button>
          <Button onClick={() => setOverlay(true)}>Show a celebration</Button>
          <Button onClick={() => setToast({ text: 'Spread picks in · 14 of 14', duration: 3000, key: Date.now() })}>Show a toast</Button>
          <Button onClick={() => setToast({ text: "Couldn't save. Your picks are still here.", tone: 'error', key: Date.now() })}>Show an error</Button>
        </Section>
      </main>

      {/* One sheet whose sub-view changes in place, as the stage 10 host draws it (the head swaps title and back). */}
      {sheet ? (
        <Sheet
          title={sheet === 'sub' ? "Everyone's picks" : 'SEA @ DEN'}
          back={sheet === 'sub' ? { label: 'SEA @ DEN', onBack: () => setSheet('main') } : undefined}
          onClose={() => setSheet(null)}
          footer={sheet === 'main' ? <Button variant="primary" block onClick={record('sheet-primary')}>Guess this game</Button> : undefined}
        >
          {sheet === 'sub' ? (
            <>
              <AvatarStack people={PEOPLE} label="6 are in"/>
              <Button variant="ghost" onClick={record('see-now')}>{copy.SEE_PICKS_NOW}</Button>
            </>
          ) : (
            <>
              <div className="gx-hstack gx-gap-12">
                <TeamMark code="SEA" name="Seattle Seahawks"/>
                <TeamMark code="DEN" name="Denver Broncos"/>
              </div>
              <LockLine>{copy.lineLocked('spread')}</LockLine>
              <Card variant="flush">
                <List label="More">
                  <Row onClick={() => setSheet('sub')} chevron title="Everyone's picks" sub={copy.picksHidden('spread')}/>
                  <Row onClick={record('trends')} chevron title="All trends"/>
                </List>
              </Card>
            </>
          )}
        </Sheet>
      ) : null}

      <Dialog open={dialog} title={copy.skipDialog({ week: 6 }).title} text={copy.skipDialog({ week: 6 }).body} onClose={() => setDialog(false)}>
        <Button onClick={() => setDialog(false)}>{copy.skipDialog({ week: 6 }).cancel}</Button>
        <Button variant="danger" onClick={() => { record('skip')(); setDialog(false); }}>{copy.skipDialog({ week: 6 }).confirm}</Button>
      </Dialog>

      {overlay ? (
        <Overlay label="Bullseye" onClose={() => setOverlay(false)}>
          <Badge iconPath={SHOWDOWN} size={96} rarity="rare"/>
          <Text as="p" variant="display">Bullseye</Text>
          <Text as="p" variant="n-xl" tone="win">+10</Text>
          <Text as="p" variant="meta" tone={2}>SEA −3 exact · Week 6</Text>
          <Button variant="primary" block onClick={record('share')}>Share to league</Button>
          <Button block onClick={() => setOverlay(false)}>Done</Button>
        </Overlay>
      ) : null}

      {toast ? (
        <Toast
          key={toast.key}
          text={toast.text}
          tone={toast.tone}
          duration={toast.duration}
          actionLabel={toast.tone === 'error' ? undefined : 'View'}
          onAction={record('toast-action')}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Gallery/>);
