// Redesign stage 8: the new app's UI kit (web/src/next/ui). vitest + react-dom/server, no browser (the browser checks
// are tests/cloud-browser/next-ui.spec.js). Every component renders with gx- classes only, accessible names, every svg
// hidden or labelled, emoji only inside data-emoji-ok; then each component's own contract. Fixture people are
// fictional; no player data is used.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ui from '../web/src/next/ui/index.js';
import { gateBanner, weekSummary } from '../web/src/next/rules.js';
import * as copy from '../web/src/next/copy.js';
import { countdown } from '../web/src/next/format.js';
import { approvedTeamLogos, teamMarks } from '../web/src/teamLogoRegistry.js';
import { EMOJI, markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const {
  Avatar, AvatarStack, Badge, Button, Card, CardButton, Chip, ChipRail, Countdown, Dialog, DriveMeter, FieldMark, GateBanner,
  Icon, IconButton, LinkRow, List, LockCell, LockLine, Meter, Move, Overlay, Pill, Rank, Row, Segmented, Sheet, Strip, Switch, Tag,
  TeamMark, Text, Toast,
} = ui;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UI_DIR = join(ROOT, 'web/src/next/ui');
const html = node => renderToStaticMarkup(<div className="gx">{node}</div>);
const tree = node => parseMarkup(html(node));
const els = (node, test) => [...walk(tree(node))].filter(n => n.tag && test(n));
const one = (node, test) => {
  const found = els(node, test);
  expect(found).toHaveLength(1);
  return found[0];
};
const byClass = cls => n => (n.attrs.class ?? '').split(/\s+/).includes(cls);
const classes = n => (n.attrs.class ?? '').split(/\s+/).filter(Boolean);
const text = node => nameFrom(tree(node)).replace(/\s+/g, ' ').trim();
const clean = node => expect(markupProblems(html(node))).toEqual([]);
/** The bounds of SVG paths drawn with M, L, H, V and Z (absolute or relative), as a viewBox: "x y width height". */
const pathBounds = ds => {
  const xs = [], ys = [];
  for (const d of ds) {
    let x = 0, y = 0;
    for (const [, cmd, args] of d.matchAll(/([MLHVZmlhvz])([^MLHVZmlhvz]*)/g)) {
      const n = (args.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number), rel = cmd === cmd.toLowerCase(), pair = /[ml]/i.test(cmd);
      for (let i = 0; i < n.length; i += pair ? 2 : 1) {
        if (pair) { x = (rel ? x : 0) + n[i]; y = (rel ? y : 0) + n[i + 1]; } else if (/h/i.test(cmd)) x = (rel ? x : 0) + n[i]; else y = (rel ? y : 0) + n[i];
        xs.push(x); ys.push(y);
      }
    }
  }
  return `${Math.min(...xs)} ${Math.min(...ys)} ${Math.max(...xs) - Math.min(...xs)} ${Math.max(...ys) - Math.min(...ys)}`;
};

const HOUR = 3_600_000, MIN = 60_000, DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-13T20:03:00Z'); // Tue Oct 13, 1:03 PM PT
const KICKOFF = Date.parse('2026-10-16T00:15:00Z'); // Thu Oct 15, 5:15 PM PT
const PEOPLE = [
  { id: 'acct-1', name: 'Avery Stone' },
  { id: 'acct-2', name: 'Blake Rivers' },
  { id: 'acct-3', name: 'Casey Moore', you: true },
  { id: 'acct-4', name: 'Drew Lane' },
  { id: 'acct-5', name: 'Emery Fox' },
];

describe('the markup checker (tests/helpers/ui-markup.mjs)', () => {
  it('catches each broken rule', () => {
    const bad = {
      '<span class="pill">x</span>': 'class "pill" is not gx-',
      '<svg viewBox="0 0 24 24"><path d="M1 1"></path></svg>': 'an svg must be',
      '<svg role="img"><path d="M1 1"></path></svg>': 'svg has no accessible name',
      '<p class="gx-t-body">Nice 🔥</p>': 'emoji outside data-emoji-ok',
      '<button type="button"><svg aria-hidden="true"></svg></button>': 'button has no accessible name',
      '<a href="#x"><span aria-hidden="true">Go</span></a>': 'a has no accessible name',
      '<section role="dialog"><p>x</p></section>': 'dialog has no accessible name',
      '<dialog class="gx-dialog"><p>x</p></dialog>': 'dialog has no accessible name',
      '<div role="dialog" aria-labelledby="nope">x</div>': 'missing id nope',
      '<p aria-describedby="gone">x</p>': 'missing id gone',
      '<img src="/team-logos/kc.png"/>': 'img without alt',
      '<div role="group"><button type="button">A</button></div>': 'group has no accessible name',
      '<div role="timer">2d</div>': 'timer has no accessible name',
    };
    for (const [markup, problem] of Object.entries(bad)) {
      const found = markupProblems(markup);
      expect(found.some(p => p.includes(problem)), `${markup} → ${found.join(' | ')}`).toBe(true);
    }
  });

  it('leaves the allowed forms alone', () => {
    const fine = [
      '<div class="gx"><span class="gx-pill gx-pill--live">LIVE</span></div>',
      '<span data-emoji-ok="true"><button type="button" class="gx-chip" aria-pressed="true">🔥 4</button></span>',
      '<p class="gx-t-meta">✓ ▲1 ▼2 ● ◆ · › ‹ SEA −3 2–0–0 Late · 12 min</p>',
      '<svg class="lucide lucide-lock gx-ic" aria-hidden="true"><path d="M1 1"></path></svg>',
      '<span role="img" aria-label="Pick streak, 4 weeks"><span class="gx-drive-seg"></span></span>',
      '<h2 id="t">Title</h2><section role="dialog" aria-labelledby="t">x</section>',
      '<button type="button" aria-label="Close"><svg aria-hidden="true"></svg></button>',
      '<button type="button"><span class="gx-sr-only">Rank 2</span><span aria-hidden="true">2</span></button>',
      '<img src="/a.svg" alt=""/>',
    ];
    for (const markup of fine) expect(markupProblems(markup), markup).toEqual([]);
  });

  it('treats typographic marks as text and pictographs as emoji', () => {
    for (const mark of ['✓', '▲', '▼', '●', '◆', '·', '›', '‹', '−', '–', '—']) expect(EMOJI.test(mark), mark).toBe(false);
    for (const glyph of ['✔', '★', '©', '↗', '⏱', '🔒', '💬', '👍', '🔥', '😂', '😬', '🎯', '👏']) expect(EMOJI.test(glyph), glyph).toBe(true);
  });
});

// Every component, at once, as a screen would compose them.
function KitchenSink() {
  const week = weekSummary({ games: [{ id: 'g1', kickoff: KICKOFF }, { id: 'g2', kickoff: KICKOFF + DAY }], entries: {}, now: NOW });
  return (
    <div className="gx-screen">
      <Text as="h1" variant="title">Lines</Text>
      <Text variant="meta" tone={2}>Tue 1:03 PM PT</Text>
      <Text variant="n-m" tnum>−3</Text>
      <Button variant="primary" block>Lock in Spread picks</Button>
      <Button variant="secondary" icon="people">Challenge a friend</Button>
      <Button variant="danger">Skip this week</Button>
      <Button variant="ghost" iconEnd="chevronRight">See all</Button>
      <Button variant="ghost-2" disabled>Not yet</Button>
      <IconButton icon="help" label="How to play"/>
      <Card as="section" variant="hero" aria-label="This week"><Countdown target={KICKOFF} now={NOW} label="Week 6 picks due in"/></Card>
      <CardButton variant="wait" aria-label="Open the challenge">Waiting for you</CardButton>
      <Card variant="flush">
        <List label="Board">
          <Row size={64} start={<Rank rank={1}/>} title="Avery Stone" sub="Pick streak 4" end={<Text variant="n-m">96.5</Text>}/>
          <Row size={64} you start={<Rank rank="T-2"/>} title="You" end={<Move by={2}/>}/>
          <Row onClick={() => {}} chevron start={<Avatar id="acct-2" name="Blake Rivers" size={36}/>} title="Blake Rivers" sub="Sent you a challenge"/>
          <LinkRow icon="settings" onClick={() => {}}>Settings</LinkRow>
        </List>
      </Card>
      <Pill tone="live">Live</Pill>
      <Pill tone="pending">Late · 12 min</Pill>
      <Pill tone="real">Real slip</Pill>
      <Tag>SEA −2.5</Tag>
      <Tag k="Bet">KC −8 · 1U</Tag>
      <ChipRail label="Seattle by">
        <Chip selected label="Seattle by 2.5">2.5</Chip>
        <Chip label="Seattle by 3">3</Chip>
        <Chip text>More</Chip>
      </ChipRail>
      <Segmented label="Market" options={[{ value: 'spread', label: 'Spread' }, { value: 'total', label: 'Total' }]} value="spread" onChange={() => {}}/>
      <Switch label="Reduce motion" sub="Your phone's setting also counts." checked onChange={() => {}}/>
      <GateBanner gate={gateBanner(week, 'spread')} onCta={() => {}} onSkip={() => {}}/>
      <LockLine>{copy.lineLocked('total')}</LockLine>
      <LockCell label={copy.lineLocked('total')}/>
      <Countdown target={KICKOFF} now={KICKOFF - 90 * MIN} variant="pill" pillPrefix="Due"/>
      <Meter value={2} label="2 of 3 bets"/>
      <DriveMeter value={4} label="Pick streak, 4 weeks"/>
      <Badge iconPath="M3 6l6 6-6 6" rarity="rare" label="Showdown, rare"/>
      <Badge icon="trophy" size={40} locked/>
      <Strip label="5 guesses from DEN +1 to DEN +4.5; the line is DEN +3" linePct={60} lowLabel="DEN +1" highLabel="DEN +4.5" items={PEOPLE.map((p, i) => ({ ...p, pct: i * 22 }))}/>
      <Strip mini label="Where 5 guesses landed" items={PEOPLE.map((p, i) => ({ ...p, pct: i * 22 }))}/>
      <AvatarStack people={PEOPLE} label="5 are in"/>
      <Avatar anyone size={40}/>
      <TeamMark code="SEA" name="Seattle Seahawks"/>
      <TeamMark code="BUF" size={24} decorative/>
      <FieldMark size={40}/>
      <FieldMark label="Guess The Line"/>
      <Icon icon="diamond" size={16} fill/>
      <Toast text="Spread picks in · 15 of 15" onDismiss={() => {}}/>
      <Sheet title="SEA @ DEN" onClose={() => {}} footer={<Button variant="primary" block>Guess this game</Button>}><p className="gx-t-body">Body</p></Sheet>
      <Dialog open title="Skip Week 6 Guess the Line?" text="Lines show right away." onClose={() => {}}>
        <Button>Keep playing</Button>
        <Button variant="danger">Skip this week</Button>
      </Dialog>
      <Overlay label="Bullseye" onClose={() => {}}><p className="gx-t-display">Bullseye</p></Overlay>
    </div>
  );
}

describe('every component together', () => {
  const markup = html(<KitchenSink/>);
  it('has gx- classes only, names for every control, hidden or labelled svgs and no stray emoji', () => {
    expect(markupProblems(markup)).toEqual([]);
  });
  it('uses each shared class the kit is built on', () => {
    const used = new Set([...walk(parseMarkup(markup))].flatMap(n => (n.tag ? classes(n) : [])));
    for (const cls of ['gx-t-title', 'gx-btn--primary', 'gx-icon-btn', 'gx-card--hero', 'gx-card-btn', 'gx-list', 'gx-row--you', 'gx-row-btn', 'gx-link-row',
      'gx-pill--live', 'gx-live-dot', 'gx-tag-k', 'gx-chip--on', 'gx-chip-rail', 'gx-seg-btn--on', 'gx-lock-card', 'gx-lock-line', 'gx-lock-cell', 'gx-cd-tile',
      'gx-rank--1', 'gx-rank--t', 'gx-move--up', 'gx-meter3-seg--on', 'gx-drive-seg--on', 'gx-badge--rare', 'gx-badge--locked', 'gx-strip-tick', 'gx-strip--mini',
      'gx-av-stack', 'gx-av--anyone', 'gx-team', 'gx-mono', 'gx-toast', 'gx-sheet', 'gx-dialog', 'gx-ov-card', 'gx-switch-row', 'gx-switch']) {
      expect(used.has(cls), cls).toBe(true);
    }
  });
  it('the barrel exports one component per plan item (stage 8 scope)', () => {
    for (const name of ['Text', 'Button', 'IconButton', 'Card', 'List', 'Row', 'Pill', 'Tag', 'Chip', 'ChipRail', 'Segmented', 'GateBanner', 'LockLine', 'Countdown',
      'Rank', 'Meter', 'Badge', 'Strip', 'Sheet', 'Dialog', 'Toast', 'Overlay', 'TeamMark', 'FieldMark', 'Icon']) {
      expect(typeof ui[name], name).toBe('function');
    }
  });
});

describe('Text, Button, IconButton, Icon', () => {
  it('Text maps a variant and a tone to one type class and one color', () => {
    const h = one(<Text as="h2" variant="section" tone="data">Lines</Text>, n => n.tag === 'h2');
    expect(classes(h)).toEqual(['gx-t-section', 'gx-c-data']);
    expect(classes(one(<Text variant="n-xs" tnum truncate>1.5U</Text>, n => n.tag === 'span'))).toEqual(['gx-n-xs', 'gx-tnum', 'gx-truncate']);
    expect(classes(one(<Text variant="nope">x</Text>, n => n.tag === 'span'))).toEqual(['gx-t-body']);
  });

  it('Button is a type="button" with its variant, and its icons are hidden', () => {
    for (const variant of ui.BUTTON_VARIANTS) {
      const b = one(<Button variant={variant}>Go</Button>, n => n.tag === 'button');
      expect(b.attrs.type).toBe('button');
      expect(classes(b)).toEqual(['gx-btn', `gx-btn--${variant}`]);
    }
    expect(classes(one(<Button variant="lime">Go</Button>, n => n.tag === 'button'))).toContain('gx-btn--secondary');
    const b = one(<Button variant="primary" block icon="check" iconEnd="chevronRight" disabled>Lock in</Button>, n => n.tag === 'button');
    expect(classes(b)).toContain('gx-btn--block');
    expect('disabled' in b.attrs).toBe(true);
    expect(els(<Button icon="check" iconEnd="chevronRight">x</Button>, n => n.tag === 'svg').every(s => s.attrs['aria-hidden'] === 'true')).toBe(true);
    expect(one(<Button type="submit">Send</Button>, n => n.tag === 'button').attrs.type).toBe('submit');
  });

  it('IconButton needs a label, which is its whole name', () => {
    expect(() => html(<IconButton icon="close"/>)).toThrow(/accessible name/);
    expect(() => html(<IconButton icon="close" label="  "/>)).toThrow(/accessible name/);
    const b = one(<IconButton icon="close" label="Close" pressed={false}/>, n => n.tag === 'button');
    expect(b.attrs).toMatchObject({ type: 'button', class: 'gx-icon-btn', 'aria-label': 'Close', 'aria-pressed': 'false' });
    clean(<IconButton icon="bell" label="Reminders"/>);
  });

  it('Icon is hidden by default, an image with a label, and sized by class', () => {
    const hiddenIcon = one(<Icon icon="lock" size={16}/>, n => n.tag === 'svg');
    expect(hiddenIcon.attrs['aria-hidden']).toBe('true');
    expect(hiddenIcon.attrs.focusable).toBe('false');
    expect(classes(hiddenIcon)).toEqual(expect.arrayContaining(['gx-ic', 'gx-ic-16']));
    const named = one(<Icon icon="alert" label="Warning"/>, n => n.tag === 'svg');
    expect(named.attrs).toMatchObject({ role: 'img', 'aria-label': 'Warning' });
    expect(classes(one(<Icon icon="lock" size={17}/>, n => n.tag === 'svg'))).not.toContain('gx-ic-17');
    expect(classes(one(<Icon icon="diamond" fill/>, n => n.tag === 'svg'))).toContain('gx-ic-fill');
    expect(() => html(<Icon icon="not-an-icon"/>)).toThrow(/Unknown icon/);
    for (const key of Object.keys(ui.icons)) clean(<Icon icon={key}/>);
  });
});

describe('Card, List, Row', () => {
  it('Card takes one or several variants; CardButton is one button', () => {
    expect(classes(one(<Card variant={['flush', 'tint', 'bogus']}>x</Card>, byClass('gx-card')))).toEqual(['gx-card', 'gx-card--flush', 'gx-card--tint']);
    const b = one(<CardButton variant="wait" aria-label="Open">x</CardButton>, n => n.tag === 'button');
    expect(b.attrs.type).toBe('button');
    expect(classes(b)).toEqual(['gx-card', 'gx-card-btn', 'gx-card--wait']);
  });

  it('List is a real list with one item per row, skipping empty children', () => {
    const t = tree(<List label="Board"><Row title="A"/>{null}{false}<Row title="B"/></List>);
    const list = [...walk(t)].find(n => n.tag === 'ul');
    expect(list.attrs).toMatchObject({ class: 'gx-list', role: 'list', 'aria-label': 'Board' });
    expect(list.children.map(c => c.tag)).toEqual(['li', 'li']);
    expect([...walk(tree(<List ordered><Row title="A"/></List>))].some(n => n.tag === 'ol')).toBe(true);
  });

  it('Row is a div, a button with onClick or a link with href, with its size and state classes', () => {
    expect(one(<Row title="A"/>, byClass('gx-row')).tag).toBe('div');
    const b = one(<Row title="A" sub="B" onClick={() => {}} size={72} you wait chevron/>, byClass('gx-row'));
    expect(b.tag).toBe('button');
    expect(b.attrs.type).toBe('button');
    expect(classes(b)).toEqual(['gx-row', 'gx-row--72', 'gx-row--you', 'gx-row--wait', 'gx-row-btn']);
    const a = one(<Row title="A" href="#feed"/>, byClass('gx-row'));
    expect(a.tag).toBe('a');
    expect(classes(one(<Row title="A" size={57}/>, byClass('gx-row')))).toEqual(['gx-row']);
    expect(els(<Row title="A" sub=""/>, byClass('gx-row-sub'))).toHaveLength(0);
    // Only phrasing content inside a row, so the row stays valid as a button.
    const row = one(<Row title="A" sub="B" end="1" start={<Rank rank={2}/>} chevron onClick={() => {}}/>, byClass('gx-row'));
    expect([...walk(row)].filter(n => n.tag && !['span', 'svg', 'path', 'circle', 'rect', 'polyline', 'line'].includes(n.tag))).toEqual([]);
    clean(<LinkRow icon="logOut" href="#signout">Sign out</LinkRow>);
  });
});

describe('Pill, Tag, Chip, ChipRail, Segmented', () => {
  it('Pill uses its tone, and only a live pill gets the pulsing dot', () => {
    for (const tone of ui.PILL_TONES.filter(t => t !== 'neutral')) expect(classes(one(<Pill tone={tone}>x</Pill>, byClass('gx-pill')))).toEqual(['gx-pill', `gx-pill--${tone}`]);
    expect(classes(one(<Pill>Final</Pill>, byClass('gx-pill')))).toEqual(['gx-pill']);
    expect(els(<Pill tone="live">Live</Pill>, byClass('gx-live-dot'))).toHaveLength(1);
    expect(els(<Pill tone="win">Won</Pill>, byClass('gx-live-dot'))).toHaveLength(0);
    expect(text(<Pill tone="live">Live</Pill>)).toBe('Live');
  });

  it('Tag reads "You" then the value, each its own flex item', () => {
    expect(html(<Tag>SEA −2.5</Tag>)).toContain('<span class="gx-tag"><span class="gx-tag-k">You</span><span>SEA −2.5</span></span>');
    expect(html(<Tag k="Bet">KC −8 · 1U</Tag>)).toContain('<span class="gx-tag-k">Bet</span><span>KC −8 · 1U</span>');
    expect(html(<Tag k="">41</Tag>)).toContain('<span class="gx-tag"><span>41</span></span>');
  });

  it('Chip is a toggle with a check when selected, never color alone', () => {
    const off = one(<Chip>3</Chip>, n => n.tag === 'button');
    expect(off.attrs).toMatchObject({ type: 'button', 'aria-pressed': 'false', class: 'gx-chip' });
    expect(els(<Chip>3</Chip>, n => n.tag === 'svg')).toHaveLength(0);
    const on = one(<Chip selected label="Seattle by 3" text tall>3</Chip>, n => n.tag === 'button');
    expect(on.attrs['aria-pressed']).toBe('true');
    expect(on.attrs['aria-label']).toBe('Seattle by 3');
    expect(classes(on)).toEqual(['gx-chip', 'gx-chip--text', 'gx-chip--48', 'gx-chip--on']);
    expect(els(<Chip selected>3</Chip>, n => n.tag === 'svg')).toHaveLength(1);
    // No pop on first render: motion only explains a change.
    expect(classes(on)).not.toContain('gx-anim-pop');
  });

  it('ChipRail and Segmented are named groups', () => {
    expect(() => html(<ChipRail><Chip>1</Chip></ChipRail>)).toThrow(/accessible name/);
    expect(one(<ChipRail label="Total"><Chip>41</Chip></ChipRail>, byClass('gx-chip-rail')).attrs).toMatchObject({ role: 'group', 'aria-label': 'Total' });
    expect(() => html(<Segmented options={[]}/>)).toThrow(/accessible name/);
    const seg = <Segmented label="Board" value="season" options={[{ value: 'week', label: 'Week' }, { value: 'season', label: 'Season' }]} fit/>;
    const buttons = els(seg, n => n.tag === 'button');
    expect(buttons.map(b => [b.attrs['aria-pressed'], classes(b)])).toEqual([
      ['false', ['gx-seg-btn', 'gx-seg-btn--fit']],
      ['true', ['gx-seg-btn', 'gx-seg-btn--on', 'gx-seg-btn--fit']],
    ]);
    clean(seg);
  });
});

describe('GateBanner and the lock (D-36 line lock, D-39 per-game lock-in)', () => {
  const games = [{ id: 'g1', kickoff: KICKOFF }, { id: 'g2', kickoff: KICKOFF + DAY }];
  const hiddenWeek = weekSummary({ games, entries: {}, now: NOW });
  const openWeek = weekSummary({ games, entries: { spread: { g1: { value: -3, lockedAt: NOW - HOUR }, g2: { value: 2.5, lockedAt: NOW - HOUR } } }, now: NOW });

  it('draws rules.js gateBanner(): the lock sentence, the way in and the skip', () => {
    const gate = gateBanner(hiddenWeek, 'spread');
    expect(gate.locked).toBe(true);
    const node = <GateBanner gate={gate} onCta={() => {}} onSkip={() => {}}/>;
    const t = text(node);
    expect(t).toContain(copy.lineLockedBanner('spread'));
    expect(t).toContain(gate.ctaLabel);
    expect(t).toContain(copy.SKIP_LABEL);
    expect(els(node, n => n.tag === 'button').map(classes)).toEqual([['gx-btn', 'gx-btn--ghost'], ['gx-btn', 'gx-btn--ghost-2']]);
    expect(els(node, n => n.tag === 'svg' && classes(n).includes('lucide-lock'))).toHaveLength(1);
    clean(node);
  });

  it('never offers a dead button, and renders nothing once the lines are open', () => {
    const gate = gateBanner(hiddenWeek, 'spread');
    expect(els(<GateBanner gate={gate}/>, n => n.tag === 'button')).toHaveLength(0);
    expect(els(<GateBanner gate={gate} onCta={() => {}}/>, n => n.tag === 'button')).toHaveLength(1);
    expect(els(<GateBanner gate={{ ...gate, canSkip: false }} onSkip={() => {}}/>, n => n.tag === 'button')).toHaveLength(0);
    expect(gateBanner(openWeek, 'spread').locked).toBe(false);
    expect(html(<GateBanner gate={gateBanner(openWeek, 'spread')} onCta={() => {}}/>)).toBe('<div class="gx"></div>');
    expect(html(<GateBanner gate={null}/>)).toBe('<div class="gx"></div>');
  });

  // D-39 per-game lock-in (after M-01, M-02 and M-07); without rules, copy reads as today's rules.
  const LOCK_IN = Object.freeze({ sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff' });
  it('a hidden cell is a lock with the sentence as its name, never "—"', () => {
    expect(() => html(<LockCell/>)).toThrow(/accessible name/);
    const cell = one(<LockCell label={copy.lineLocked('spread', LOCK_IN)}/>, byClass('gx-lock-cell'));
    expect(cell.attrs).toMatchObject({ role: 'img', 'aria-label': 'Lock in your Spread pick to see this line.' });
    expect(html(<LockCell label="x"/>)).not.toContain('—');
    expect(text(<LockLine>{copy.lineLocked('total', LOCK_IN)}</LockLine>)).toBe('Lock in your Total pick to see this line.');
  });
});

describe('Countdown (format.js countdown, design system 7.14)', () => {
  it('shows days, hours and minutes above a day, as a named timer that is not read every tick', () => {
    const node = <Countdown target={KICKOFF} now={NOW} label="Week 6 picks due in"/>;
    const timer = one(node, n => n.attrs.role === 'timer');
    expect(timer.attrs['aria-live']).toBe('off');
    expect(timer.attrs['aria-label']).toBe(`Week 6 picks due in ${countdown(KICKOFF, NOW).aria}`);
    expect(timer.attrs['aria-label']).toBe('Week 6 picks due in 2 days 4 hours 12 minutes');
    const tiles = els(node, byClass('gx-cd-tile'));
    expect(tiles.map(t => t.children.map(c => nameFrom({ ...c, attrs: {} })).join(' '))).toEqual(['2 DAYS', '04 HRS', '12 MIN']);
    expect(tiles.every(t => t.attrs['aria-hidden'] === 'true')).toBe(true);
    expect(html(node)).not.toContain('gx-c-pending');
    expect(html(node)).not.toContain('gx-cd-tick');
    clean(node);
  });

  it('turns pending under two hours, shows minutes and seconds under an hour, and the done words at zero', () => {
    expect(html(<Countdown target={KICKOFF} now={KICKOFF - 90 * MIN}/>)).toContain('gx-c-pending');
    expect(els(<Countdown target={KICKOFF} now={KICKOFF - 9 * MIN - 5000}/>, byClass('gx-cd-tile')).map(t => nameFrom({ ...t.children[1], attrs: {} }))).toEqual(['MIN', 'SEC']);
    const done = <Countdown target={KICKOFF} now={KICKOFF + MIN} doneLabel="Picks are due"/>;
    expect(ui.COUNTDOWN_ANNOUNCEMENTS.done).toBe('Time is up.');
    expect(one(done, n => n.attrs.role === 'timer').attrs['aria-label']).toBe('Picks are due');
    expect(els(done, byClass('gx-cd-tile'))).toHaveLength(0);
    clean(done);
  });

  it('a missing time reads "—", never 0', () => {
    const node = <Countdown target={null} now={NOW}/>;
    expect(one(node, n => n.attrs.role === 'timer').attrs['aria-label']).toBe('Time not available');
    expect(html(node)).toContain('>—<');
    expect(html(node)).not.toMatch(/>0</);
  });

  it('has a pill form with the caller\'s word ("due", D-39)', () => {
    const node = <Countdown target={KICKOFF} now={NOW} variant="pill" pillPrefix="Due"/>;
    const pill = one(node, byClass('gx-pill'));
    expect(pill.attrs.role).toBe('timer');
    expect(nameFrom({ ...pill, attrs: {} })).toBe('Due 2d 4h');
    expect(classes(one(<Countdown target={KICKOFF} now={KICKOFF - HOUR} variant="pill"/>, byClass('gx-pill')))).toContain('gx-pill--pending');
    clean(node);
  });

  it('announces only at a day, two hours, 15 minutes and zero', () => {
    const at = left => ui.countdownMilestone(KICKOFF, KICKOFF - left);
    // Above an hour the time rounds up to whole minutes, like the digits: 23:59:30 still shows "1d 0h".
    expect([at(3 * DAY), at(DAY), at(DAY - 30_000), at(DAY - MIN), at(2 * HOUR), at(2 * HOUR - 30_000), at(2 * HOUR - MIN), at(16 * MIN), at(15 * MIN), at(1000), at(0), at(-MIN)])
      .toEqual([null, null, null, 'day', 'day', 'day', 'twoHours', 'twoHours', 'quarter', 'quarter', 'done', 'done']);
    // "Two hours left" arrives with the pending digits.
    for (const left of [2 * HOUR, 2 * HOUR - 30_000, 2 * HOUR - MIN, HOUR]) expect(at(left) === 'twoHours', String(left)).toBe(countdown(KICKOFF, KICKOFF - left).pending);
    expect(ui.countdownMilestone(null, NOW)).toBe(null);
    // The polite line is present and empty on first render: what is already true is on screen.
    const polite = one(<Countdown target={KICKOFF} now={KICKOFF - HOUR}/>, n => n.attrs['aria-live'] === 'polite');
    expect(polite.children).toEqual([]);
  });
});

describe('Rank, Move, Meter, DriveMeter, Badge', () => {
  it('Rank: first in the ringed tile, second and third ringed, ties "T-2", no rank "—"', () => {
    const r1 = one(<Rank rank={1}/>, byClass('gx-rank'));
    expect(classes(r1)).toEqual(['gx-rank', 'gx-rank--1']);
    expect(text(<Rank rank={1}/>)).toBe('Rank 1');
    expect(classes(one(<Rank rank="T-2"/>, byClass('gx-rank')))).toEqual(['gx-rank', 'gx-rank--t', 'gx-rank--top']);
    expect(text(<Rank rank="T-2"/>)).toBe('Rank 2, tied');
    expect(html(<Rank rank="T-2"/>)).toContain('>T-2<');
    expect(classes(one(<Rank rank={5} tied/>, byClass('gx-rank')))).toEqual(['gx-rank', 'gx-rank--t']);
    for (const n of [2, 3]) expect(classes(one(<Rank rank={n}/>, byClass('gx-rank')))).toEqual(['gx-rank', 'gx-rank--top']);
    expect(classes(one(<Rank rank="7"/>, byClass('gx-rank')))).toEqual(['gx-rank']);
    for (const none of [null, undefined, 0, -1, 1.5, 'abc', '']) {
      expect(text(<Rank rank={none}/>)).toBe('Not ranked');
      expect(html(<Rank rank={none}/>)).toContain('>—<');
    }
    expect(ui.parseRank(' t-12 ')).toEqual({ n: 12, tied: true });
  });

  it('Move: ▲ up in win, ▼ down in loss, an en dash for none, in words for a screen reader', () => {
    expect(classes(one(<Move by={2}/>, byClass('gx-move')))).toEqual(['gx-move', 'gx-move--up']);
    expect(html(<Move by={2}/>)).toContain('▲2');
    expect(text(<Move by={2}/>)).toBe('up 2');
    expect(html(<Move by={-3}/>)).toContain('▼3');
    expect(text(<Move by={-3}/>)).toBe('down 3');
    for (const none of [0, null, undefined, NaN]) expect(text(<Move by={none}/>)).toBe('no change');
  });

  it('Meter fills whole steps toward the minimum; DriveMeter stays full from five on', () => {
    const on = node => els(node, n => classes(n).some(c => c.endsWith('-seg--on'))).length;
    const segs = node => els(node, n => classes(n).some(c => /-seg$/.test(c))).length;
    expect([segs(<Meter value={2}/>), on(<Meter value={2}/>)]).toEqual([3, 2]);
    expect(on(<Meter value={2.5}/>)).toBe(2);
    expect(on(<Meter value={7}/>)).toBe(3);
    expect(on(<Meter value={-1}/>)).toBe(0);
    expect(on(<Meter value={null}/>)).toBe(0);
    expect(segs(<Meter value={1} max={5}/>)).toBe(5);
    expect(one(<Meter value={2}/>, byClass('gx-meter3')).attrs['aria-hidden']).toBe('true');
    expect(one(<Meter value={2} label="2 of 3 bets"/>, byClass('gx-meter3')).attrs).toMatchObject({ role: 'img', 'aria-label': '2 of 3 bets' });
    expect([segs(<DriveMeter value={9}/>), on(<DriveMeter value={9}/>), on(<DriveMeter value={3}/>)]).toEqual([5, 5, 3]);
    clean(<DriveMeter value={4} label="Pick streak, 4 weeks"/>);
  });

  it('Badge: size, rarity ring and locked, with an original line icon', () => {
    expect(classes(one(<Badge iconPath="M3 6h18"/>, byClass('gx-badge')))).toEqual(['gx-badge']);
    expect(classes(one(<Badge iconPath="M3 6h18" size={96} rarity="epic"/>, byClass('gx-badge')))).toEqual(['gx-badge', 'gx-badge--96', 'gx-badge--epic']);
    expect(classes(one(<Badge iconPath="M3 6h18" rarity="rare" locked/>, byClass('gx-badge')))).toEqual(['gx-badge', 'gx-badge--locked']);
    expect(classes(one(<Badge iconPath="M3 6h18" size={33} rarity="mythic"/>, byClass('gx-badge')))).toEqual(['gx-badge']);
    const svg = one(<Badge iconPath="M3 6h18" size={24}/>, n => n.tag === 'svg');
    expect(classes(svg)).toEqual(['gx-ic', 'gx-ic-12']);
    expect(svg.attrs['aria-hidden']).toBe('true');
    expect(one(<Badge icon="trophy" label="Weekly award"/>, byClass('gx-badge')).attrs).toMatchObject({ role: 'img', 'aria-label': 'Weekly award' });
    clean(<Badge icon="target" size={40} rarity="uncommon"/>);
  });
});

describe('Strip and avatars (faces first)', () => {
  it('stacks faces closer than one face width, and grows to fit', () => {
    const layout = ui.stripLayout({ items: [{ id: 'a', pct: 50 }, { id: 'b', pct: 52 }, { id: 'c', pct: 55 }, { id: 'd', pct: 80 }], linePct: 51 });
    expect(layout.items.map(i => i.level)).toEqual([0, 1, 2, 0]);
    expect(layout.items.map(i => i.bottom)).toEqual(['28px', '44px', '60px', '28px']);
    expect(layout.height).toBe('84px');
    expect(layout.hasTick).toBe(true);
    expect(layout.tickLeft).toBe('calc(12px + 0.51 * (100% - 24px))');
    expect(ui.stripLayout({ items: [{ pct: 50 }] }).height).toBe('72px');
    expect(ui.stripLayout({ items: [{ pct: 150 }, { pct: -10 }] }).items.map(i => i.pct)).toEqual([100, 0]);
    expect(ui.stripLayout({ items: [{ pct: 50 }, { pct: 50 }] }, { mini: true }).items.map(i => i.level)).toEqual([0, 0]);
  });

  it('draws no line tick while the line is hidden', () => {
    expect(ui.stripLayout({ items: [], linePct: null }).hasTick).toBe(false);
    expect(els(<Strip label="x" items={[{ id: 'a', name: 'Avery Stone', pct: 10 }]}/>, byClass('gx-strip-tick'))).toHaveLength(0);
    expect(() => html(<Strip items={[]}/>)).toThrow(/accessible name/);
    const strip = one(<Strip label="Where 1 guess landed" items={[{ id: 'a', name: 'Avery Stone', pct: 10, you: true }]}/>, byClass('gx-strip'));
    expect(strip.attrs).toMatchObject({ role: 'img', 'aria-label': 'Where 1 guess landed' });
  });

  it('gives each account one fill from a stable hash, never from rank or result', () => {
    expect(ui.avatarFill('acct-1')).toBe(ui.avatarFill('acct-1'));
    expect(ui.AVATAR_FILLS).toContain(ui.avatarFill('acct-1'));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => ui.avatarFill(`account-${i}`)));
    expect(seen.size).toBe(8);
    expect(classes(one(<Avatar id="acct-1" name="Avery Stone" size={40}/>, byClass('gx-av')))).toEqual(['gx-av', 'gx-av--40', `gx-av-${ui.avatarFill('acct-1')}`]);
    expect(classes(one(<Avatar id="acct-1" name="Avery Stone" fill="mint" you/>, byClass('gx-av')))).toEqual(['gx-av', 'gx-av--32', 'gx-av-mint', 'gx-av--you']);
  });

  it('shows initials, hidden beside the name; a stack shows three faces then "+N"', () => {
    expect([ui.initials('Avery Stone'), ui.initials('blake'), ui.initials(' casey  de moore '), ui.initials(''), ui.initials(null)]).toEqual(['AS', 'B', 'CM', '?', '?']);
    expect(one(<Avatar name="Avery Stone"/>, byClass('gx-av')).attrs['aria-hidden']).toBe('true');
    const stack = <AvatarStack people={PEOPLE} label="5 are in"/>;
    expect(els(stack, byClass('gx-av'))).toHaveLength(3);
    expect(html(stack)).toContain('+2');
    expect(text(stack)).toBe('5 are in');
    expect(els(<AvatarStack people={PEOPLE.slice(0, 2)}/>, byClass('gx-av-more'))).toHaveLength(0);
  });
});

describe('Sheet, Dialog, Toast, Overlay', () => {
  it('Sheet is a modal dialog named by its title, with one close button and a scrim that only a pointer uses', () => {
    const node = <Sheet title="SEA @ DEN" onClose={() => {}} footer={<Button variant="primary" block>Guess this game</Button>}><p className="gx-t-body">x</p></Sheet>;
    const panel = one(node, n => n.attrs.role === 'dialog');
    expect(panel.attrs).toMatchObject({ class: 'gx-sheet', 'aria-modal': 'true', tabindex: '-1' });
    const title = one(node, n => n.attrs.id === panel.attrs['aria-labelledby']);
    expect([title.tag, classes(title), nameFrom(title)]).toEqual(['h2', ['gx-sheet-title'], 'SEA @ DEN']);
    const scrim = one(node, byClass('gx-scrim'));
    expect(scrim.attrs).toMatchObject({ type: 'button', tabindex: '-1', 'aria-hidden': 'true' });
    expect(els(node, n => n.tag === 'button' && n.attrs['aria-label'] === 'Close')).toHaveLength(1);
    expect(one(node, n => n.attrs['aria-label'] === 'Close').attrs.class).toBe('gx-icon-btn');
    expect(els(node, byClass('gx-sheet-foot'))).toHaveLength(1);
    clean(node);
  });

  it('a sub-view sheet backs out to its parent and titles itself in the body', () => {
    const node = <Sheet title="Everyone's picks" back={{ label: 'SEA @ DEN', onBack: () => {} }} onClose={() => {}} tall>x</Sheet>;
    const back = one(node, byClass('gx-sheet-back'));
    expect(nameFrom(back)).toBe('SEA @ DEN');
    const panel = one(node, n => n.attrs.role === 'dialog');
    const title = one(node, n => n.attrs.id === panel.attrs['aria-labelledby']);
    expect(classes(title)).toEqual(['gx-t-section']);
    expect(title.parent.attrs.class).toBe('gx-sheet-body');
    expect(els(node, byClass('gx-sheet-inner--tall'))).toHaveLength(1);
    clean(node);
  });

  it('Dialog is a native <dialog>, closed until showModal(), named by its title and described by its text', () => {
    const node = <Dialog open title="See picks now?" text="It counts as sitting out." onClose={() => {}}><Button>Make my picks first</Button></Dialog>;
    const dialog = one(node, n => n.tag === 'dialog');
    expect('open' in dialog.attrs).toBe(false);
    expect(dialog.attrs).toMatchObject({ class: 'gx-dialog', role: 'alertdialog', 'aria-modal': 'true' });
    expect(nameFrom(one(node, n => n.attrs.id === dialog.attrs['aria-labelledby']))).toBe('See picks now?');
    expect(nameFrom(one(node, n => n.attrs.id === dialog.attrs['aria-describedby']))).toBe('It counts as sitting out.');
    expect(els(node, byClass('gx-dialog-actions'))).toHaveLength(1);
    const plain = one(<Dialog open={false} title="Name" alert={false}>x</Dialog>, n => n.tag === 'dialog');
    expect(plain.attrs.role).toBeUndefined();
    expect(plain.attrs['aria-describedby']).toBeUndefined();
    clean(node);
  });

  it('Toast is polite (an error is an alert), leaves after 4 s or 6 s with an action, and an error stays', () => {
    expect(ui.toastDuration({})).toBe(4000);
    expect(ui.toastDuration({ actionLabel: 'Show friends' })).toBe(6000);
    expect(ui.toastDuration({ tone: 'error' })).toBe(null);
    expect(ui.toastDuration({ tone: 'error', duration: 8000 })).toBe(8000);
    expect(ui.toastDuration({ duration: null })).toBe(null);
    expect(one(<Toast text="Saved" onDismiss={() => {}}/>, byClass('gx-toast')).attrs.role).toBe('status');
    expect(one(<Toast text="Couldn't save" tone="error" onDismiss={() => {}}/>, byClass('gx-toast')).attrs.role).toBe('alert');
    const withAction = <Toast text="Bet placed · DEN +3 · 1U" actionLabel="Show friends" onAction={() => {}} onDismiss={() => {}} bottom={136}/>;
    expect(els(withAction, n => n.tag === 'button').map(nameFrom)).toEqual(['Show friends', 'Dismiss']);
    expect(one(withAction, byClass('gx-toast')).attrs.style).toBe('bottom:136px');
    expect(els(<Toast text="x" actionLabel="Undo" onDismiss={() => {}}/>, n => n.tag === 'button')).toHaveLength(1);
    expect(els(<Toast text="x" tone="plain" onDismiss={() => {}}/>, n => n.tag === 'svg')).toHaveLength(1); // the dismiss icon only
    clean(withAction);
    // Stage 10: a host that announces toasts in its own live region drops the toast's role, an error's too.
    expect(one(<Toast text="Saved" live={false} onDismiss={() => {}}/>, byClass('gx-toast')).attrs.role).toBeUndefined();
    expect(one(<Toast text="Couldn't save" tone="error" live={false} onDismiss={() => {}}/>, byClass('gx-toast')).attrs.role).toBeUndefined();
  });

  it('Switch is a checkbox with role="switch", named by its words, described by its meta line, covering its row', () => {
    const node = <Switch label="Reduce motion" sub="Your phone's setting also counts." checked onChange={() => {}}/>;
    const row = one(node, n => n.tag === 'label');
    expect(classes(row)).toEqual(['gx-switch-row']);
    const input = one(node, n => n.tag === 'input');
    expect(input.attrs).toMatchObject({ type: 'checkbox', role: 'switch', class: 'gx-switch-input' });
    expect('checked' in input.attrs).toBe(true);
    // Its name is its words alone: the label wraps the meta line too, which would join the name and be read twice.
    const byId = id => one(node, n => n.attrs.id === id);
    expect(input.attrs['aria-labelledby'].trim().split(/\s+/)).toHaveLength(1);
    expect(nameFrom(byId(input.attrs['aria-labelledby']))).toBe('Reduce motion');
    expect(nameFrom(byId(input.attrs['aria-describedby']))).toBe("Your phone's setting also counts.");
    expect(one(node, byClass('gx-switch')).attrs['aria-hidden']).toBe('true');
    expect(text(node)).toContain('Reduce motion');
    const plainNode = <Switch label="Pick reminders"/>;
    const plain = one(plainNode, n => n.tag === 'input');
    expect('checked' in plain.attrs).toBe(false);
    expect(plain.attrs['aria-describedby']).toBeUndefined();
    expect(nameFrom(one(plainNode, n => n.attrs.id === plain.attrs['aria-labelledby']))).toBe('Pick reminders');
    clean(node);
  });

  it('Overlay is a named modal dialog around a card or a full panel', () => {
    expect(() => html(<Overlay>x</Overlay>)).toThrow(/accessible name/);
    const card = one(<Overlay label="Bullseye" onClose={() => {}}>x</Overlay>, n => n.attrs.role === 'dialog');
    expect(card.attrs).toMatchObject({ class: 'gx-ov-card', 'aria-modal': 'true', 'aria-label': 'Bullseye', tabindex: '-1' });
    const full = one(<><h2 id="results">3 new results</h2><Overlay labelledBy="results" full>x</Overlay></>, n => n.attrs.role === 'dialog');
    expect(full.attrs).toMatchObject({ class: 'gx-ov-full', 'aria-labelledby': 'results' });
    expect(full.attrs['aria-label']).toBeUndefined();
  });
});

describe('TeamMark (D-46 official logos, D-22 badge fallback, sized for DP-27) and the Field monogram', () => {
  it('every team resolves to its registered mark in a fixed box, with the code shown until the image decodes', () => {
    expect(Object.keys(teamMarks)).toHaveLength(32);
    for (const [code, mark] of Object.entries(teamMarks)) {
      for (const size of ui.TEAM_MARK_SIZES) {
        const node = <TeamMark code={code} size={size}/>;
        const box = one(node, byClass('gx-team'));
        expect(classes(box)).toEqual(['gx-team', `gx-team--${size}`]);
        expect(box.attrs).toMatchObject({ role: 'img', 'aria-label': code, 'data-mark': mark.rightsStatus });
        const img = one(node, n => n.tag === 'img');
        expect(img.attrs).toMatchObject({ src: mark.src, width: String(size), height: String(size), alt: '', decoding: 'async', class: 'gx-team-img' });
        expect(nameFrom({ ...one(node, byClass('gx-team-code')), attrs: {} })).toBe(code);
      }
    }
  });

  it('shows the official D-46 logo for every team, as a local PNG sized like every other mark', () => {
    expect(Object.keys(approvedTeamLogos)).toHaveLength(32);
    for (const code of Object.keys(approvedTeamLogos)) {
      const node = <TeamMark code={code} size={24} decorative/>;
      const img = one(node, n => n.tag === 'img');
      expect(img.attrs.src).toBe(`/team-logos/${code.toLowerCase()}.png`);
      expect([img.attrs.width, img.attrs.height]).toEqual(['24', '24']);
      expect(one(node, byClass('gx-team')).attrs['data-mark']).toBe('trademark-identification');
      expect(one(node, byClass('gx-team')).attrs['data-backing']).toBe(['KC', 'LAC', 'PIT', 'TEN'].includes(code) ? 'dark' : undefined);
    }
  });

  it('accepts aliases, names itself, and falls back to "—" with no image for anything else', () => {
    expect(nameFrom({ ...one(<TeamMark code="jac"/>, byClass('gx-team-code')), attrs: {} })).toBe('JAX');
    expect(one(<TeamMark code="LA"/>, n => n.tag === 'img').attrs.src).toBe(teamMarks.LAR.src);
    expect(one(<TeamMark code="SEA" name="Seattle Seahawks"/>, byClass('gx-team')).attrs['aria-label']).toBe('Seattle Seahawks');
    const decorative = one(<TeamMark code="SEA" decorative/>, byClass('gx-team'));
    expect(decorative.attrs['aria-hidden']).toBe('true');
    expect(decorative.attrs.role).toBeUndefined();
    for (const bad of ['XYZ', 'constructor', '', null, 7, 'TOOLONG']) {
      const node = <TeamMark code={bad}/>;
      expect(els(node, n => n.tag === 'img')).toHaveLength(0);
      const box = one(node, byClass('gx-team'));
      expect(box.attrs['data-mark']).toBe('letters');
      expect(['—', 'XYZ', 'CONS'].some(code => html(node).includes(`>${code}<`))).toBe(true);
    }
    expect(one(<TeamMark code=""/>, byClass('gx-team')).attrs['aria-label']).toBe('Team unavailable');
    expect(classes(one(<TeamMark code="SEA" size={40}/>, byClass('gx-team')))).toContain('gx-team--32');
    clean(<TeamMark code="KC" name="Kansas City Chiefs" size={48}/>);
  });

  it('the Field monogram draws Brand.jsx\'s exact Yardline G, framed by the G\'s own bounds', () => {
    const brand = readFileSync(join(ROOT, 'web/src/Brand.jsx'), 'utf8');
    const paths = [...brand.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
    expect(paths).toEqual([ui.YARDLINE_G_PATHS.g, ui.YARDLINE_G_PATHS.yards]);
    expect(pathBounds(paths)).toBe(ui.YARDLINE_G_VIEWBOX);
    expect(brand).toContain(`viewBox="${ui.YARDLINE_G_VIEWBOX}"`);
    const node = <FieldMark size={40}/>;
    expect(classes(one(node, byClass('gx-mono')))).toEqual(['gx-mono', 'gx-mono--40']);
    expect(one(node, n => n.tag === 'svg').attrs.viewbox).toBe(ui.YARDLINE_G_VIEWBOX);
    expect(els(node, n => n.tag === 'path').map(p => p.attrs.d)).toEqual(paths);
    expect(one(node, byClass('gx-mono')).attrs['aria-hidden']).toBe('true');
    expect(one(<FieldMark label="Guess The Line"/>, byClass('gx-mono')).attrs).toMatchObject({ role: 'img', 'aria-label': 'Guess The Line' });
    clean(<FieldMark label="Guess The Line"/>);
  });

  it('D-44: the G stands alone in accent-ink, with no tile, edge or shadow, at every size and as a system avatar', () => {
    const css = readFileSync(join(ROOT, 'web/src/next/styles/components.css'), 'utf8');
    const rule = selector => css.match(new RegExp(`\\n${selector.replace(/[.-]/g, '\\$&')} \\{([^}]*)\\}`))[1].split(';').map(d => d.trim()).filter(Boolean);
    const tile = decls => decls.filter(d => /^(background|box-shadow|border|outline)/.test(d));
    const mono = rule('.gx-mono');
    expect(tile(mono)).toEqual([]);
    expect(mono).toEqual(expect.arrayContaining(['color: var(--gx-accent-ink)', 'width: 32px', 'height: 32px']));
    for (const size of ui.FIELD_MARK_SIZES.filter(size => size !== 32)) expect(rule(`.gx-mono--${size}`)).toEqual([`width: ${size}px`, `height: ${size}px`]);
    // .gx-av-sys (no component uses it yet) also wins inside an avatar stack, whose ring rules come first: the
    // compound .gx-av.gx-av-sys matches .gx-card .gx-av-stack .gx-av (0,3,0) and comes later.
    expect(rule('.gx-av-sys,\n.gx-av-stack .gx-av.gx-av-sys')).toEqual(['background: none', 'color: var(--gx-accent-ink)', 'box-shadow: none']);
    expect(css.indexOf('\n.gx-av-sys,')).toBeGreaterThan(css.indexOf('\n.gx-sheet .gx-av-stack .gx-av {'));
    expect(css.indexOf('\n.gx-sheet .gx-av-stack .gx-av {')).toBeGreaterThan(0);
    // Forced colors draws a border on controls and boxes; around the logo it would read as the old tile.
    const start = css.indexOf('@media (forced-colors: active) {');
    expect(start).toBeGreaterThan(0);
    let end = css.indexOf('{', start) + 1;
    for (let depth = 1; depth > 0; end += 1) depth += css[end] === '{' ? 1 : css[end] === '}' ? -1 : 0;
    expect(css.slice(start, end)).toMatch(/\.gx-team \{/);
    expect(css.slice(start, end)).not.toMatch(/\.gx-mono\b/);
  });
});

describe('the kit\'s source (web/src/next/ui)', () => {
  const files = readdirSync(UI_DIR).filter(f => /\.(jsx?|mjs)$/.test(f)).map(f => ({ f, src: readFileSync(join(UI_DIR, f), 'utf8') }));
  it('has the files the plan lists', () => {
    expect(files.map(x => x.f).sort()).toEqual(expect.arrayContaining(['index.js', 'Text.jsx', 'Button.jsx', 'IconButton.jsx', 'Card.jsx', 'List.jsx', 'Row.jsx', 'Pill.jsx',
      'Tag.jsx', 'Chip.jsx', 'ChipRail.jsx', 'Segmented.jsx', 'Switch.jsx', 'GateBanner.jsx', 'LockLine.jsx', 'Countdown.jsx', 'Rank.jsx', 'Meter.jsx', 'Badge.jsx', 'Strip.jsx',
      'Sheet.jsx', 'Dialog.jsx', 'Toast.jsx', 'Overlay.jsx', 'TeamMark.jsx', 'FieldMark.jsx', 'Icon.jsx']));
  });
  it('builds UI as markup only: no innerHTML, storage, network or document writes', () => {
    const banned = /dangerouslySetInnerHTML|\.innerHTML|localStorage|sessionStorage|indexedDB|\bfetch\(|XMLHttpRequest|document\.cookie|document\.write|\beval\(|new Function/;
    for (const { f, src } of files) expect(src, f).not.toMatch(banned);
  });
  it('has no emoji, no hard-coded colors, gx- classes in every literal className and a type on every button (rendered classes are checked above)', () => {
    for (const { f, src } of files) {
      expect(EMOJI.test(src), `${f} has an emoji`).toBe(false);
      expect(src, f).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
      for (const [, list] of src.matchAll(/className="([^"]*)"/g)) for (const cls of list.split(/\s+/).filter(Boolean)) expect(cls, `${f}: ${cls}`).toMatch(/^gx-/);
      for (const tag of src.match(/<button\b[^>]*>/g) ?? []) expect(tag, f).toMatch(/type=/);
      expect(src, `${f}: onClick on a div or span`).not.toMatch(/<(div|span)\b[^>]*\bonClick=/);
    }
  });
});
