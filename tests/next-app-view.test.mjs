// D-60, step 1 of retiring the old app (redesign build plan stage 80): every signed-in member gets the new app. The old
// app opens only at `?app=classic` (Menu › "Older records and tools", the failure screens, main.jsx's fallback), for that
// address only; nothing is saved, a device's old saved choice (`gtl.app`) is forgotten, and storage that throws changes
// nothing. The new app is one lazy chunk that never pulls in the old app's screens, and the old app never pulls in the new one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_PARAM, APP_STORAGE_KEY, APP_SWITCH_COPY, APP_VIEWS, DEFAULT_APP, appFellBack, backToNewApp, browserStorage, classicUrl, clearAppView,
  forcesClassic, noteAppFallback, openOldApp, readAppView, startAppView, withoutAppParam,
} from '../web/src/appView.js';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

/** An in-memory Storage with the same string semantics as localStorage. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
  };
}
/** Storage that refuses: every call throws, as in a private window or with site data blocked. */
const throwingStorage = () => ({
  getItem() { throw new DOMException('blocked', 'SecurityError'); },
  setItem() { throw new DOMException('quota', 'QuotaExceededError'); },
  removeItem() { throw new DOMException('blocked', 'SecurityError'); },
});
/** A location that records navigations instead of making them. */
function fakeLocation(href) {
  const calls = [];
  return { href, calls, reload: () => calls.push(['reload']), assign: next => calls.push(['assign', next]), replace: next => calls.push(['replace', next]) };
}

test('the new app is the default for every plain visit; the key, views and words are fixed', () => {
  assert.equal(DEFAULT_APP, 'next');
  assert.equal(APP_STORAGE_KEY, 'gtl.app');
  assert.equal(APP_PARAM, 'app');
  assert.deepEqual([...APP_VIEWS], ['classic', 'next']);
  assert.equal(readAppView({ search: '' }), 'next');
  assert.equal(startAppView({ search: '', storage: memoryStorage() }), 'next');
  assert.equal(startAppView({ search: '', storage: null }), 'next');
  assert.equal(APP_SWITCH_COPY.olderRecords, 'Older records and tools');
  assert.equal(APP_SWITCH_COPY.useOld, 'Use the old app');
  assert.equal(APP_SWITCH_COPY.backToNew, 'Back to the new app');
  assert.equal(Object.hasOwn(APP_SWITCH_COPY, 'tryNew'), false, '"Try the new app" is gone: there is nothing to opt into');
});

test('an old saved choice never decides the app; startAppView forgets it and leaves other keys alone', () => {
  for (const value of ['classic', 'next', '', 'beta', 'NEXT']) {
    const storage = memoryStorage({ 'gtl.app': value, 'gtl.theme': 'light', 'gtl.next.draft.x': '{}' });
    assert.equal(startAppView({ search: '', storage }), 'next', JSON.stringify(value));
    assert.equal(storage.map.has('gtl.app'), false, `${JSON.stringify(value)} is forgotten`);
    assert.equal(storage.map.get('gtl.theme'), 'light');
    assert.equal(storage.map.get('gtl.next.draft.x'), '{}');
  }
});

test('storage that throws never breaks the page: the new app still opens, ?app=classic still works', () => {
  assert.equal(startAppView({ search: '', storage: throwingStorage() }), 'next');
  assert.equal(startAppView({ search: '?app=classic', storage: throwingStorage() }), 'classic');
  assert.equal(clearAppView(throwingStorage()), false);
  // Reading window.localStorage itself can throw (blocked site data); that is no storage, not an error.
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  try {
    assert.equal(browserStorage(), null);
    assert.equal(startAppView({ search: '' }), 'next');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage;
  }
});

test('?app=classic opens the old app for that address only and saves nothing; no other value does anything', () => {
  const storage = memoryStorage();
  assert.equal(forcesClassic('?app=classic'), true);
  assert.equal(forcesClassic('?league=x&app=classic'), true);
  assert.equal(startAppView({ search: '?app=classic', storage }), 'classic');
  assert.equal(storage.map.has('gtl.app'), false, 'nothing is saved');
  assert.equal(startAppView({ search: '', storage }), 'next', 'the next plain visit is the new app');
  for (const search of ['?app=next', '?app=CLASSIC', '?app=', '?apps=classic', '?app=classic2', '#app=classic']) {
    assert.equal(forcesClassic(search), false, search);
    assert.equal(startAppView({ search, storage: memoryStorage() }), 'next', search);
  }
});

test('Older records and tools opens a new page at ?app=classic; Back to the new app drops the parameter and keeps the rest', () => {
  const into = fakeLocation('https://gtl.example/?invite=abc#feed');
  openOldApp({ location: into });
  assert.deepEqual(into.calls, [['assign', 'https://gtl.example/?invite=abc&app=classic#feed']]);
  assert.equal(readAppView({ search: new URL(into.calls[0][1]).search }), 'classic');

  const back = fakeLocation('https://gtl.example/?invite=abc&app=classic#feed');
  backToNewApp({ location: back });
  assert.deepEqual(back.calls, [['assign', 'https://gtl.example/?invite=abc#feed']]);
  assert.equal(readAppView({ search: new URL(back.calls[0][1]).search }), 'next');

  // A fallback page has no parameter: going back reloads, and the next load tries the new app again.
  const fallback = fakeLocation('https://gtl.example/#picks');
  backToNewApp({ location: fallback });
  assert.deepEqual(fallback.calls, [['reload']]);

  assert.equal(withoutAppParam('https://gtl.example/?app=classic'), 'https://gtl.example/');
  assert.equal(classicUrl('https://gtl.example/?a=1#x'), 'https://gtl.example/?a=1&app=classic#x');
});

test('the fallback note starts clear and is set once the new app fails on this page', () => {
  assert.equal(appFellBack(), false);
  noteAppFallback();
  assert.equal(appFellBack(), true);
});

// ---------- the wiring: one lazy chunk each way, the fallback boundary, the footer button ----------
const importsOf = text => [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g)].map(m => m[1]);
/** Named shared adapters permit imports and reexports, never defaults, namespaces or dynamic loads. */
function assertNamedAccess(text, spec, allowedNames, file) {
  const dynamic = [...text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)].some(m => m[1] === spec);
  const bare = [...text.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)].some(m => m[1] === spec);
  assert.ok(!dynamic && !bare, `${file} accesses ${spec}; only named ${allowedNames.join(', ')}`);
  const statements = [...text.matchAll(/\b(import|export)\s+([^;]*?)\s+from\s*['"]([^'"]+)['"]/g)].filter(m => m[3] === spec);
  assert.ok(statements.length, `${file} accesses ${spec}; only named ${allowedNames.join(', ')}`);
  for (const [, , clause] of statements) {
    const names = clause.match(/^\{([^}]*)\}$/)?.[1].split(',').map(name => name.trim()).filter(Boolean);
    assert.ok(names?.length && names.every(name => allowedNames.includes(name)), `${file} imports or reexports ${clause} from ${spec}; only ${allowedNames.join(', ')}`);
  }
}

test('named shared-hook inventory checks reexports and rejects default, namespace, extra and dynamic access', () => {
  const spec = '../../trendsWeekHook.js', names = ['useTrendWeek'];
  for (const source of [
    "import { useTrendWeek } from '../../trendsWeekHook.js';",
    "export { useTrendWeek } from '../../trendsWeekHook.js';",
  ]) assert.doesNotThrow(() => assertNamedAccess(source, spec, names, 'fixture'));
  for (const source of [
    "import useTrendWeek from '../../trendsWeekHook.js';",
    "import * as hooks from '../../trendsWeekHook.js';",
    "import { useTrendWeek, OtherHook } from '../../trendsWeekHook.js';",
    "export { OtherHook } from '../../trendsWeekHook.js';",
    "export { default as useTrendWeek } from '../../trendsWeekHook.js';",
    "export * from '../../trendsWeekHook.js';",
    "const hook = import('../../trendsWeekHook.js');",
    "import { useTrendWeek } from '../../trendsWeekHook.js'; const hook = import('../../trendsWeekHook.js');",
    "import { useTrendWeek } from '../../trendsWeekHook.js'; import '../../trendsWeekHook.js';",
  ]) assert.throws(() => assertNamedAccess(source, spec, names, 'fixture'), /only/);
});

function filesUnder(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const rel = `${dir}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(rel) : /\.(m?js|jsx)$/.test(entry.name) ? [rel] : [];
  });
}

test('main.jsx loads NextApp and GameHub lazily, never both, behind the fallback boundary', () => {
  const main = read('web/src/main.jsx');
  assert.match(main, /const NextApp = lazy\(\(\) => import\('\.\/next\/NextApp\.jsx'\)\)/);
  assert.match(main, /const GameHub = lazy\(\(\) => import\('\.\/GameHub\.jsx'\)\)/);
  assert.doesNotMatch(main, /^import\s+\w+\s+from\s+'\.\/(next\/NextApp|GameHub)(\.jsx)?'/m, 'neither app is a static import of the entry');
  assert.match(main, /startAppView\(\)/);
  assert.match(main, /componentDidCatch\(\) \{ clearAppView\(\); noteAppFallback\(\); \}/);
  assert.match(main, /if \(view !== 'next'\) return <Classic/);
});

test('the apps keep separate shells and allow only documented workflow and pick-control adapters', () => {
  // Shared modules with no React, CSS or screen code: the per-device choice and the D-22 team mark registry (stage 8 TeamMark).
  // Stage 11 (the data layer): the routes both apps call (api.js, build plan section 3.3), the one Supabase client
  // (auth.js, for "Sign in again"), the invite link saved in this tab (invitations.js), Google sign-in (oauth.js) and the
  // new app's typed-text drafts, which AuthGate clears (nextDrafts.js).
  // Stage 13 (Lines): the trends loaders and the wind timer, both free of React, which the old trends panel's hooks also
  // use, so both apps share one cache and one request per week.
  // Weekly/player Trends reuses trendsAvailability.js as a pure formatter and only useTrendWeek from the shared React hook.
  // Stage 25 retains the classic recovery copies using the same pure account/week draft helpers.
  // The account-keyed read sharing (sharedReads.js) is forgotten by AuthGate on every account change, like nextDrafts.js.
  const allowed = new Set(['appView.js', 'teamLogoRegistry.js', 'api.js', 'auth.js', 'invitations.js', 'oauth.js', 'nextDrafts.js', 'trendsLoaders.js', 'trendsAvailability.js', 'windTimer.js', 'communityFormat.js', 'communityBoard.js', 'communityDraft.js', 'soloDraft.js', 'sharedReads.js']);
  for (const shared of allowed) {
    assert.doesNotMatch(read(`web/src/${shared}`), /from\s*['"](react|react-dom[^'"]*|lucide-react)['"]|\.css['"]/, `${shared} stays free of React and CSS`);
  }
  // Stage 10: the theme and the reduced-motion choice belong to the device, so both apps use the same state on the same
  // keys: the ThemeProvider main.jsx wraps both apps in (gtl.theme) and the motion preference (gtl.dashboard.preferences.v1).
  // Only these named hooks, never a component or a default import.
  // The retained Fantasy adapter also reuses the week-key formatter for reloadable Research addresses.
  // The NBA section (docs/superpowers/plans/2026-10-21-nba-section.md) shares only the sport-switch draft guard, the
  // accepted-route signal and the old app's selector slot, so unsaved work in either app is confirmed before the sport changes.
  const namedOnly = { 'trendsWeekHook.js': ['useTrendWeek'], 'Theme.jsx': ['useThemePreference'], 'dashboardPreferences.js': ['useDashboardPreferences'], 'CommunityHome.jsx': ['WeekPicks'], 'CommunityHistory.jsx': ['HistoryLine'], 'fantasyData.js': ['FANTASY_INITIAL', 'useFantasySnapshot', 'fantasyWeekKey'], 'sportNavigation.js': ['noteSportRoute', 'SportSlotContext', 'useSportGuard'] };
  // Sean's all-tabs request uses today's hosted editors until the later redesign migrations can ship. These exact
  // adapters are documented in ALL_TABS_LIVE_WORKFLOWS.md; GameHub/App/CommunityHome's default shell stays forbidden.
  const adapters = {
    'web/src/next/fantasy/FantasyScreen.jsx': ['FantasyFootball.jsx'],
    'web/src/next/NextApp.jsx': ['liveWorkflows.css'],
    'web/src/next/bets/Bets.jsx': ['SocialBetTracker.jsx', 'VirtualUnits.jsx', 'DeferredScreen.jsx', 'liveBets.css'],
    // The existing D-21 chip control is reused, never a classic screen or shell.
    'web/src/next/play/PerGamePlay.jsx': ['ChipPicker.jsx'],
  };
  for (const file of filesUnder('web/src/next')) {
    const text = read(file);
    for (const spec of importsOf(text)) {
      if (!spec.startsWith('.')) continue;
      const target = path.relative(path.join(root, 'web/src'), path.resolve(path.join(root, path.dirname(file)), spec));
      if (adapters[file]?.includes(target)) continue;
      if (namedOnly[target]) {
        if (target === 'CommunityHome.jsx') assert.equal(file, 'web/src/next/play/Play.jsx');
        if (target === 'CommunityHistory.jsx') assert.equal(file, 'web/src/next/league/LeagueHistory.jsx');
        assertNamedAccess(text, spec, namedOnly[target], file);
        continue;
      }
      // The repo's shared modules (shared/, pure ESM and JSON the server and both apps read) are not the old app.
      if (target.startsWith(`..${path.sep}..${path.sep}shared${path.sep}`)) {
        assert.doesNotMatch(read(path.join('shared', target.split(path.sep).slice(3).join(path.sep))), /from\s*['"](react|react-dom[^'"]*|lucide-react)['"]|\.css['"]/, `${target} stays free of React and CSS`);
        continue;
      }
      assert.ok(target.startsWith('next') || allowed.has(target), `${file} imports ${spec} from the old app`);
    }
  }
  for (const file of fs.readdirSync(path.join(root, 'web/src')).filter(name => /\.(m?js|jsx)$/.test(name) && name !== 'main.jsx')) {
    const text = read(`web/src/${file}`);
    for (const spec of importsOf(text)) {
      if (['CommunityHome.jsx', 'PersonalWorkspace.jsx'].includes(file) && spec === './next/play/PerGameLegacy.jsx') {
        assert.match(text, /const PerGameLegacy = lazy\(\(\) => import\('\.\/next\/play\/PerGameLegacy\.jsx'\)\)/);
        assert.match(text, /rules\?\.sentFinal === true && [^\n]*rules\?\.lateWindow === 'kickoff' && [^\n]*rules\?\.perGameScoring === true/);
        continue;
      }
      if (file === 'FantasyFootball.jsx' && spec === './next/ui/index.js') {
        assert.match(text, /import \{ Button, Card, LockLine, Segmented, Switch \} from '\.\/next\/ui\/index\.js'/);
        continue;
      }
      if (file === 'FantasyAccuracy.jsx' && spec === './next/ui/index.js') {
        assert.match(text, /import \{ Card, Pill \} from '\.\/next\/ui\/index\.js'/);
        continue;
      }
      assert.ok(!spec.startsWith('./next/'), `web/src/${file} imports ${spec}`);
    }
  }
  assert.doesNotMatch(read('web/src/next/play/PerGameLegacy.jsx'), /from ['"][^'"]*(NextApp|shell\/context|AppData)/, 'the compatibility wrapper never mounts or depends on the new shell');
});

test('the old app\'s footer offers "Back to the new app" to every signed-in member, not behind a role (D-60)', () => {
  const home = read('web/src/CommunityHome.jsx');
  const footer = home.slice(home.indexOf('<div className="hub-bottom">'));
  assert.match(footer, /<TryNewApp disabled=\{busy\}\/>/);
  assert.ok(footer.indexOf('<TryNewApp') < footer.indexOf('onClick={onSignOut}'), 'before Sign out');
  const button = read('web/src/TryNewApp.jsx');
  assert.match(button, /backToNewApp\(\)/);
  assert.match(button, /APP_SWITCH_COPY\.backToNew/);
  assert.doesNotMatch(button, /admin|commissioner|tester|\.role\b|VITE_GTL_OFFER_NEW_APP/i, 'no gate and no build switch');
});

test('the new app has one everyday way into the old app: the Menu row "Older records and tools" (D-60)', () => {
  const menu = read('web/src/next/me/MenuSheet.jsx');
  assert.match(menu, /onClick=\{shell\.toOldApp\}>\{APP_SWITCH_COPY\.olderRecords\}/);
  assert.doesNotMatch(read('web/src/next/league/SwitcherSheet.jsx'), /toOldApp|APP_SWITCH_COPY/, 'the league switcher no longer offers the old app');
  // The shell (web/src/next/shell/) owns the wiring and its own failure screens; every other caller is a screen.
  const everyday = filesUnder('web/src/next').filter(file => /toOldApp/.test(read(file)) && !file.includes('/shell/'));
  // Failure screens (Home, Lines, a failed tab or layer, the load-failed screen) keep "Use the old app" as a way out.
  for (const file of everyday) {
    const text = read(file);
    if (file.endsWith('me/MenuSheet.jsx')) continue;
    assert.match(text, /role="alert"/, `${file} offers the old app outside a failure screen`);
  }
});
