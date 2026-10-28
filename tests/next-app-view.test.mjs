// The new app is the only app (D-60 step 2, RETIRE-02, completed October 28, 2026): every signed-in member gets it, a
// device's old saved choice (`gtl.app`) is forgotten, an old `?app=classic` bookmark is dropped from the address and opens
// the new app, and storage that throws changes nothing. The failure screens offer "Reload the app"; nothing mounts the old UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { APP_PARAM, APP_RELOAD_COPY, APP_STORAGE_KEY, browserStorage, clearAppView, reloadApp, startAppView, withoutAppParam } from '../web/src/appView.js';

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
/** A location and history that record calls instead of navigating. */
function fakePage(href) {
  const calls = [];
  return {
    calls,
    location: { href, reload: () => calls.push(['reload']), assign: next => calls.push(['assign', next]) },
    history: { state: { kept: true }, replaceState: (state, title, next) => calls.push(['replaceState', state, next]) },
  };
}

test('the key, parameter and words are fixed', () => {
  assert.equal(APP_STORAGE_KEY, 'gtl.app');
  assert.equal(APP_PARAM, 'app');
  assert.equal(APP_RELOAD_COPY.reload, 'Reload the app');
});

test('an old saved choice is forgotten on every load; other keys stay', () => {
  for (const value of ['classic', 'next', '', 'beta']) {
    const storage = memoryStorage({ 'gtl.app': value, 'gtl.theme': 'light', 'gtl.next.draft.x': '{}' });
    const page = fakePage('https://gtl.example/');
    startAppView({ ...page, storage });
    assert.equal(storage.map.has('gtl.app'), false, `${JSON.stringify(value)} is forgotten`);
    assert.equal(storage.map.get('gtl.theme'), 'light');
    assert.equal(storage.map.get('gtl.next.draft.x'), '{}');
    assert.deepEqual(page.calls, [], 'a plain address is left alone');
  }
});

test('storage that throws never breaks the page', () => {
  assert.doesNotThrow(() => startAppView({ ...fakePage('https://gtl.example/?app=classic'), storage: throwingStorage() }));
  assert.equal(clearAppView(throwingStorage()), false);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  try {
    assert.equal(browserStorage(), null);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage;
  }
});

test('an old ?app=classic bookmark is dropped in place, keeping every other parameter and the hash', () => {
  const page = fakePage('https://gtl.example/?invite=abc&app=classic#feed');
  startAppView({ ...page, storage: memoryStorage() });
  assert.deepEqual(page.calls, [['replaceState', { kept: true }, 'https://gtl.example/?invite=abc#feed']]);
  for (const href of ['https://gtl.example/?app=next', 'https://gtl.example/?app=']) {
    const other = fakePage(href);
    startAppView({ ...other, storage: memoryStorage() });
    assert.equal(other.calls.length, 1, href);
  }
  const hashOnly = fakePage('https://gtl.example/#app=classic');
  startAppView({ ...hashOnly, storage: memoryStorage() });
  assert.deepEqual(hashOnly.calls, [], 'a hash is not a parameter');
  assert.equal(withoutAppParam('https://gtl.example/?app=classic'), 'https://gtl.example/');
});

test('reloadApp reloads the same page', () => {
  const page = fakePage('https://gtl.example/#picks');
  reloadApp({ location: page.location });
  assert.deepEqual(page.calls, [['reload']]);
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

test('main.jsx loads only the new app, lazily, behind a fallback that reloads and never mounts the old app', () => {
  const main = read('web/src/main.jsx');
  assert.match(main, /const NextApp = lazy\(\(\) => import\('\.\/next\/NextApp\.jsx'\)\)/);
  assert.doesNotMatch(main, /GameHub|Classic|app=classic/, 'no old-app shell, view or address');
  assert.equal(fs.existsSync(path.join(root, 'web/src/GameHub.jsx')), false, 'the old app shell is gone');
  assert.equal(fs.existsSync(path.join(root, 'web/src/TryNewApp.jsx')), false, 'the switch back is gone');
  assert.doesNotMatch(main, /^import\s+\w+\s+from\s+'\.\/next\/NextApp(\.jsx)?'/m, 'the new app is not a static import of the entry');
  assert.match(main, /startAppView\(\)/);
  assert.match(main, /reloadApp\(\)/);
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

test('no screen offers the old app: failure screens reload, the Menu has no old-app row', () => {
  assert.doesNotMatch(read('web/src/CommunityHome.jsx'), /TryNewApp|backToNewApp/);
  const menu = read('web/src/next/me/MenuSheet.jsx');
  assert.doesNotMatch(menu, /Older records and tools|toOldApp|APP_SWITCH_COPY/);
  for (const file of [...filesUnder('web/src/next'), ...fs.readdirSync(path.join(root, 'web/src')).filter(name => /\.(m?js|jsx)$/.test(name)).map(name => `web/src/${name}`)]) {
    const text = read(file);
    assert.doesNotMatch(text, /toOldApp|openOldApp|onOldApp|APP_SWITCH_COPY|backToNewApp|forcesClassic|Use the old app/, `${file} still offers the old app`);
  }
  // Every "Reload the app" outside the shell's own wiring is on a failure screen.
  for (const file of filesUnder('web/src/next').filter(file => /shell\.reload\b/.test(read(file)) && !file.includes('/shell/'))) {
    assert.match(read(file), /role="alert"/, `${file} offers a reload outside a failure screen`);
  }
});
