// Explicit capture closeout only; ordinary browser runs never rewrite evidence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const authority = process.argv[2];
assert.ok(authority, 'Pass the read-only owner-acceptance worktree path.');
const sourceCommit = '1ba236960dfb8050538ba762b35e40eb2799e071';
const authorityCommit = '3ac2eb50513ba73447ef890e4a47863cde7bdd76';
const head = cwd => execFileSync('git', ['rev-parse','HEAD'], {cwd,encoding:'utf8'}).trim();
assert.equal(head(authority), authorityCommit);
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const directory = 'design/prism-research-navigation-native-2026-11-07';
const reviewDirectory = 'design/style-directions-2026-11-04';
const selection = fs.readFileSync(path.join(authority, reviewDirectory, 'selected-system-review.json'),'utf8');
const files = root => fs.readdirSync(root,{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? files(path.join(root,entry.name)) : [path.join(root,entry.name).replaceAll('\\','/')]);
const sourceFiles = [
  ...files('web/src/next/shell'), 'web/src/next/sportSwitch.js',
  'web/src/next/epl/EplShell.jsx','web/src/next/epl/EplApp.jsx','web/src/next/epl/route.js',
  'web/src/next/me/MenuSheet.jsx','web/src/next/ui/Toast.jsx',
  'design/tokens.json','design/tokens-next.json','docs/BRAND_GUIDE.md',
];
for (const file of sourceFiles) {
  const frozen = execFileSync('git',['show',`${sourceCommit}:${file}`]);
  assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),frozen.toString('utf8').replaceAll('\r\n','\n'),`Frozen product source: ${file}`);
}
const referenceFiles = ['selected-system-review.json','NFL_ACTIONS_NAVIGATION_REVIEW.md','populated-nfl-actions.jsx','EPL_SHELL_REVIEW.md',
  ...['navigation-nfl','navigation-epl','navigation-nfl-only','navigation-layer-failed'].flatMap(name=>['dark','light'].map(theme=>`previews/nfl-actions-${name}-${theme}-phone.png`)),
  ...['native-nfl','native-epl'].flatMap(name=>['dark','light'].map(theme=>`previews/league-wording-${name}-${theme}-phone.png`)),
  ...['dark','light'].map(theme=>`previews/league-circles-research-${theme}-phone.png`),
];
const references = referenceFiles.map(file=>{
  const hash=sha256(path.join(authority,reviewDirectory,file));
  if(file.endsWith('.png'))assert.ok(selection.includes(hash),`Approved selection hash: ${file}`);
  return {file:`${reviewDirectory}/${file}`,sha256:hash};
});
const scenarios = ['navigation-nfl','navigation-epl','navigation-nfl-only','navigation-layer-failed'].map(name=>{
  const file=`${directory}/${name}.json`,data=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(data.captures.length,4);
  for(const capture of data.captures) {
    assert.equal(capture.sha256,sha256(`${directory}/${capture.file}`));
    assert.equal(capture.computedTheme.stored,capture.theme);
    assert.equal(capture.computedTheme.resolved,capture.theme);
  }
  return {file,sha256:sha256(file),...data};
});
fs.writeFileSync(`${directory}/evidence.json`,JSON.stringify({
  sourceCommit,authorityCommit,referenceScope:'Four exact Research navigation contexts only; no Play/Bets/global frame decision.',
  capturedAt:new Date().toISOString(),browser:'Playwright Chromium, reduced motion, 320/390 × 844, deviceScaleFactor 1, simulated safe-area inset 0',
  fixture:'Disposable PGlite 0.5.8 with ALL migrations, fictional authenticated Luke account; lobby EPL capability adapter. Real NFL handler and EPL manager RPC. FEPL has no stored fantasy snapshots.',
  checks:'Saved theme + resolved/computed canvas/ink, sports access/active state, Research active, actual FEPL/Community, NBA absent, source-frozen geometry, 52px circles, contain/decode, 44px frame/toast targets, 16px tabs/toast, bounded frame axe; league switcher + focus, cross-sport Research routes, denied EPL link, real chunk failure and reload.',
  sourceFiles:sourceFiles.map(file=>({file,sha256:sha256(file)})),
  testFiles:['playwright.research-navigation.config.js','tests/cloud-browser/next-prism-research-navigation.spec.js','tests/cloud-browser/research-navigation-evidence.mjs','tests/cloud-browser/theme-capture.mjs','tests/cloud-browser/community-world.mjs'].map(file=>({file,sha256:sha256(file)})),
  references,scenarios,
  limits:'No pixel equality, owner re-acceptance, hosted data, physical device, release, global frame approval or preview-body replacement. Toast intentionally floats above native dock, unlike illustrative inline notice; full native controller is retained.',
},null,2)+'\n');
console.log(`Verified 16 captures, ${references.length} authority files and ${sourceFiles.length} unchanged product/token files; wrote ${directory}/evidence.json`);
