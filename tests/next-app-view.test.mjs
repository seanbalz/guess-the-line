// Redesign build plan, stage 9 (section 3.2; D-38, D-39): which app a signed-in member sees on this device.
// The choice is `gtl.app` in localStorage; DEFAULT_APP is 'classic' until stage 80; anything unreadable or unknown
// is the default; `?app=classic` always forces the old app; every switch reloads; the new app is one lazy chunk
// that never pulls in the old app's screens, and the old app never pulls in the new one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_PARAM, APP_STORAGE_KEY, APP_SWITCH_COPY, APP_VIEWS, DEFAULT_APP, appFellBack, browserStorage, classicUrl, clearAppView,
  forcesClassic, noteAppFallback, readAppView, saveAppView, startAppView, switchApp, withoutAppParam,
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
/** Storage that accepts writes and drops them (reads back null). */
const forgetfulStorage = () => ({ getItem: () => null, setItem() {}, removeItem() {} });
/** A location that records reloads and replacements instead of navigating. */
function fakeLocation(href) {
  const calls = [];
  return { href, calls, reload: () => calls.push(['reload']), replace: next => calls.push(['replace', next]) };
}

test('the default is the old app until the flip (stage 80), and the key and views are fixed', () => {
  assert.equal(DEFAULT_APP, 'classic');
  assert.equal(APP_STORAGE_KEY, 'gtl.app');
  assert.equal(APP_PARAM, 'app');
  assert.deepEqual([...APP_VIEWS], ['classic', 'next']);
  assert.equal(readAppView({ search: '', storage: memoryStorage() }), 'classic');
  assert.equal(readAppView({ search: '', storage: null }), 'classic');
  assert.equal(APP_SWITCH_COPY.tryNew, 'Try the new app');
  assert.equal(APP_SWITCH_COPY.useOld, 'Use the old app');
});

test('round trip: a saved choice reads back, and each switch can be undone', () => {
  const storage = memoryStorage();
  assert.equal(saveAppView('next', storage), true);
  assert.equal(storage.map.get('gtl.app'), 'next');
  assert.equal(readAppView({ search: '', storage }), 'next');
  assert.equal(saveAppView('classic', storage), true);
  assert.equal(readAppView({ search: '', storage }), 'classic');
  assert.equal(saveAppView('next', storage), true);
  assert.equal(clearAppView(storage), true);
  assert.equal(storage.map.has('gtl.app'), false, 'clearing forgets the choice rather than writing one');
  assert.equal(readAppView({ search: '', storage }), DEFAULT_APP);
});

test('storage that throws never breaks the page: reads give the default, writes report failure', () => {
  const storage = throwingStorage();
  assert.equal(readAppView({ search: '', storage }), DEFAULT_APP);
  assert.equal(saveAppView('next', storage), false);
  assert.equal(clearAppView(storage), false);
  assert.equal(startAppView({ search: '?app=classic', storage }), 'classic');
  assert.equal(saveAppView('next', forgetfulStorage()), false, 'a write that does not read back is not saved');
  // Reading window.localStorage itself can throw (blocked site data); that is no storage, not an error.
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  try {
    assert.equal(browserStorage(), null);
    assert.equal(readAppView({ search: '' }), DEFAULT_APP);
    assert.equal(saveAppView('next'), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage;
  }
});

test('an unknown saved value is the default, and nothing but a known view is ever saved', () => {
  for (const value of ['', 'NEXT', 'Classic', 'beta', 'next ', 'true', '1', 'undefined', 'null', '{"app":"next"}']) {
    assert.equal(readAppView({ search: '', storage: memoryStorage({ 'gtl.app': value }) }), DEFAULT_APP, JSON.stringify(value));
  }
  const storage = memoryStorage();
  for (const value of ['beta', '', null, undefined, 'NEXT', 1]) assert.equal(saveAppView(value, storage), false, String(value));
  assert.equal(storage.map.size, 0);
  const location = fakeLocation('https://example.test/');
  assert.equal(switchApp('beta', { storage, location }), false);
  assert.deepEqual(location.calls, []);
});

test('?app=classic always forces the old app and saves that choice; no other value does anything', () => {
  const storage = memoryStorage({ 'gtl.app': 'next' });
  assert.equal(forcesClassic('?app=classic'), true);
  assert.equal(forcesClassic('?league=x&app=classic'), true);
  assert.equal(readAppView({ search: '?app=classic', storage }), 'classic');
  assert.equal(storage.map.get('gtl.app'), 'next', 'reading alone writes nothing');
  assert.equal(startAppView({ search: '?app=classic', storage }), 'classic');
  assert.equal(storage.map.get('gtl.app'), 'classic', 'the escape hatch holds on the next plain visit');
  assert.equal(startAppView({ search: '', storage }), 'classic');
  for (const search of ['?app=next', '?app=CLASSIC', '?app=', '?apps=classic', '?app=classic2', '#app=classic']) {
    assert.equal(forcesClassic(search), false, search);
    const kept = memoryStorage({ 'gtl.app': 'next' });
    assert.equal(startAppView({ search, storage: kept }), 'next', search);
    assert.equal(kept.map.get('gtl.app'), 'next', search);
  }
});

test('every switch reloads; leaving a ?app=classic address drops the parameter and keeps the rest', () => {
  const storage = memoryStorage();
  const plain = fakeLocation('https://gtl.example/#picks');
  assert.equal(switchApp('next', { storage, location: plain }), true);
  assert.deepEqual(plain.calls, [['reload']]);
  assert.equal(storage.map.get('gtl.app'), 'next');

  const forced = fakeLocation('https://gtl.example/?invite=abc&app=classic#feed');
  assert.equal(switchApp('next', { storage, location: forced }), true);
  assert.deepEqual(forced.calls, [['replace', 'https://gtl.example/?invite=abc#feed']]);
  assert.equal(readAppView({ search: new URL(forced.calls[0][1]).search, storage }), 'next', 'the new address opens the new app');

  const back = fakeLocation('https://gtl.example/');
  assert.equal(switchApp('classic', { storage, location: back }), true);
  assert.deepEqual(back.calls, [['reload']]);
  assert.equal(storage.map.get('gtl.app'), 'classic');

  assert.equal(withoutAppParam('https://gtl.example/?app=classic'), 'https://gtl.example/');
  assert.equal(classicUrl('https://gtl.example/?a=1#x'), 'https://gtl.example/?a=1&app=classic#x');
});

test('when storage refuses: trying the new app stays put and says so; going back still works through ?app=classic', () => {
  const location = fakeLocation('https://gtl.example/#feed');
  assert.equal(switchApp('next', { storage: throwingStorage(), location }), false);
  assert.deepEqual(location.calls, [], 'no reload into an app the next load would not open');
  const back = fakeLocation('https://gtl.example/#feed');
  assert.equal(switchApp('classic', { storage: throwingStorage(), location: back }), true);
  assert.deepEqual(back.calls, [['replace', 'https://gtl.example/?app=classic#feed']]);
  assert.equal(readAppView({ search: '?app=classic', storage: throwingStorage() }), 'classic');
});

test('the fallback note starts clear and is set once the new app fails on this page', () => {
  assert.equal(appFellBack(), false);
  noteAppFallback();
  assert.equal(appFellBack(), true);
});

// ---------- the wiring: one lazy chunk each way, the fallback boundary, the footer button ----------
const importsOf = text => [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g)].map(m => m[1]);
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
  // Stage 25 retains the classic recovery copies using the same pure account/week draft helpers.
  const allowed = new Set(['appView.js', 'teamLogoRegistry.js', 'api.js', 'auth.js', 'invitations.js', 'oauth.js', 'nextDrafts.js', 'trendsLoaders.js', 'windTimer.js', 'communityFormat.js', 'communityBoard.js', 'communityDraft.js', 'soloDraft.js']);
  for (const shared of allowed) {
    assert.doesNotMatch(read(`web/src/${shared}`), /from\s*['"](react|react-dom[^'"]*|lucide-react)['"]|\.css['"]/, `${shared} stays free of React and CSS`);
  }
  // Stage 10: the theme and the reduced-motion choice belong to the device, so both apps use the same state on the same
  // keys: the ThemeProvider main.jsx wraps both apps in (gtl.theme) and the motion preference (gtl.dashboard.preferences.v1).
  // Only these named hooks, never a component or a default import.
  // The retained Fantasy adapter also reuses the week-key formatter for reloadable Research addresses.
  const namedOnly = { 'Theme.jsx': ['useThemePreference'], 'dashboardPreferences.js': ['useDashboardPreferences'], 'CommunityHome.jsx': ['WeekPicks'], 'CommunityHistory.jsx': ['HistoryLine'], 'fantasyData.js': ['FANTASY_INITIAL', 'useFantasySnapshot', 'fantasyWeekKey'] };
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
        const statements = [...text.matchAll(/import\s+([^;]*?)\s+from\s*['"]([^'"]+)['"]/g)].filter(m => m[2] === spec);
        for (const [, clause] of statements) {
          const names = clause.match(/^\{([^}]*)\}$/)?.[1].split(',').map(name => name.trim()).filter(Boolean);
          assert.ok(names && names.every(name => namedOnly[target].includes(name)), `${file} imports ${clause} from ${spec}; only ${namedOnly[target].join(', ')}`);
        }
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
        assert.match(text, /import \{ Button, Card, Segmented, Switch \} from '\.\/next\/ui\/index\.js'/);
        continue;
      }
      assert.ok(!spec.startsWith('./next/'), `web/src/${file} imports ${spec}`);
    }
  }
  assert.doesNotMatch(read('web/src/next/play/PerGameLegacy.jsx'), /from ['"][^'"]*(NextApp|shell\/context|AppData)/, 'the compatibility wrapper never mounts or depends on the new shell');
});

test('"Try the new app" is in the Community footer for every signed-in member, not behind a role or a list (D-39)', () => {
  const home = read('web/src/CommunityHome.jsx');
  const footer = home.slice(home.indexOf('<div className="hub-bottom">'));
  assert.match(footer, /<TryNewApp disabled=\{busy\}\/>/);
  assert.ok(footer.indexOf('<TryNewApp') < footer.indexOf('onClick={onSignOut}'), 'before Sign out');
  const button = read('web/src/TryNewApp.jsx');
  assert.match(button, /switchApp\('next'\)/);
  assert.doesNotMatch(button, /admin|commissioner|tester|\.role\b/i, 'no gate: D-39 opens it to the whole league');
});

test('since the first look, "Try the new app" is in every build unless VITE_GTL_OFFER_NEW_APP=0 withdraws it; every browser test build shows it', () => {
  const button = read('web/src/TryNewApp.jsx');
  assert.match(button, /export const NEW_APP_OFFERED = import\.meta\.env\?\.VITE_GTL_OFFER_NEW_APP !== '0';/);
  assert.match(button, /if \(!NEW_APP_OFFERED\) return null;/);
  for (const config of ['playwright.cloud.config.js', 'playwright.performance.config.js', 'playwright.accessibility.config.js']) {
    assert.match(read(config), /VITE_GTL_OFFER_NEW_APP: '1'/, `${config} builds with the button`);
  }
  for (const file of fs.readdirSync(root).filter(name => /^\.env/.test(name))) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /VITE_GTL_OFFER_NEW_APP\s*=\s*0/, `${file} must not withdraw the button`);
  }
});
