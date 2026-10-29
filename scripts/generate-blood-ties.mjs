// Compile a verified pool once, rather than search thousands of boards in a Worker request.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { countBloodTiesSolutions } from '../js/blood-ties-legacy.js';
import { createRng, hashString, shuffle } from '../js/game-core.js';
import { BLOOD_TIES_FAIRNESS_VERSION, bloodTiesCategoriesTooSimilar, createBloodTiesFairnessChecker, passesBloodTiesFairness } from '../js/blood-ties-fairness.js';
import { BLOOD_TIES_DISCOVERY_VERSION, bloodTiesClueTiles, inspectBloodTiesDiscovery, passesBloodTiesDiscovery, resolveBloodTiesTrioDiscovery, validateBloodTiesDiscovery } from '../js/blood-ties-discovery.js';

const rootArg = process.argv.indexOf('--root');
const root = rootArg < 0 ? fileURLToPath(new URL('../', import.meta.url)) : path.resolve(process.argv[rootArg + 1]);
const { bloodTiesCatalogue: catalogue } = await import(pathToFileURL(path.join(root, 'js/blood-ties-catalogue.js')));
if (!Number.isInteger(catalogue.version) || catalogue.version < 3) throw new Error('Archive issued content and import a new version before generating boards.');
const inspect = createBloodTiesFairnessChecker(catalogue.connections);
const discovery = catalogue.generationPolicy === `discovery-v${BLOOD_TIES_DISCOVERY_VERSION}`;
if (catalogue.generationPolicy && !discovery) throw new Error('Unsupported Blood Ties generation policy.');
if (discovery) catalogue.connections.forEach(validateBloodTiesDiscovery);
const categories = catalogue.connections;
const names = categories.filter(g => g.discovery?.method === 'name');
const anchors = categories.filter(g => g.discovery?.method === 'name' || g.discovery?.reasoning);
const poolSize = discovery ? 16384 : 4096;
const clues = new Map(names.map(g => [g.id, bloodTiesClueTiles(g)]));
if (discovery && names.some(g => clues.get(g.id).length < 3)) throw new Error('Every name theme needs at least three eligible clue tiles. Review its clue words.');
const random = createRng(hashString(`blood-ties:v${catalogue.version}:fairness${BLOOD_TIES_FAIRNESS_VERSION}:${catalogue.sourceSha256}${discovery ? `:discovery${BLOOD_TIES_DISCOVERY_VERSION}` : ''}`));
const byDifficulty = [1, 2, 3].map(d => catalogue.connections.filter(g => g.difficulty === d));
if (!discovery && (byDifficulty[0].length < 1 || byDifficulty[1].length < 2 || byDifficulty[2].length < 1)) throw new Error('Blood Ties needs categories at every difficulty, including two at difficulty 2.');
const pool = [], ambiguity = [], opening = [], seen = new Set(), coverage = new Map(), tileCoverage = new Set(), membershipCoverage = new Set();
const pairKey = (a,b) => [a.id,b.id].sort().join(':');
const similarPairs = new Set(catalogue.connections.flatMap((g,i) => catalogue.connections.slice(i+1)
  .filter(h => bloodTiesCategoriesTooSimilar(g,h)).map(h => pairKey(g,h))));
const overlapCounts = [0,0,0];
for (let attempt = 0; attempt < 4000000 && pool.length < poolSize; attempt++) {
  const pick = list => list[Math.floor(random() * list.length)];
  // Draw two different medium categories without shuffling the whole workbook.
  const first = Math.floor(random() * byDifficulty[1].length);
  const second = Math.floor(random() * (byDifficulty[1].length - 1));
  const selected = discovery ? [pick(anchors), ...shuffle(categories, random).slice(0, 3)]
    : [pick(byDifficulty[0]), byDifficulty[1][first], byDifficulty[1][second + (second >= first ? 1 : 0)], pick(byDifficulty[2])];
  if (new Set(selected.map(g => g.id)).size !== 4) continue;
  if (discovery && selected.filter(g => g.discovery.method === 'specialist').length > 1) continue;
  const families = selected.map(g => g.family);
  if (!discovery && families.some(f => families.filter(other => other === f).length > 2)) continue;
  if (selected.some((g,i) => selected.slice(i+1).some(h => similarPairs.has(pairKey(g,h))))) continue;
  const used = new Set();
  const groups = shuffle(selected, random).map(g => {
    const eligible = discovery && g.id === selected[0].id && g.discovery.method === 'name' ? clues.get(g.id) : g.tiles;
    const answers = shuffle(eligible.filter(t => !used.has(t)), random).slice(0, 3);
    answers.forEach(t => used.add(t));
    const group = { ...g, answers };
    return discovery ? resolveBloodTiesTrioDiscovery(group) : group;
  });
  if (groups.some(g => g.answers.length !== 3)) continue;
  const tiles = groups.flatMap(g => g.answers);
  const traps = groups.flatMap(owner => owner.answers.filter(t => groups.some(g => g.id !== owner.id && g.tiles.includes(t))));
  // Discovery boards allow more zero-overlap draws. Difficulty need not come
  // from a misleading membership. Historical pools keep their exact quotas.
  if (traps.length > 2 || traps.length === 0 && overlapCounts[0] >= (discovery ? poolSize / 4 : 256) || traps.length === 2 && overlapCounts[2] >= (discovery ? poolSize / 4 : 512)
    || countBloodTiesSolutions(groups, tiles) !== 1) continue;
  // Protect the opening group and avoid large combination traps before the
  // broader catalogue search. Alternative labels on the SAME trio are fine.
  const visible = groups.map(g => tiles.filter(t => g.tiles.includes(t)).length);
  if (Math.max(...visible) > 4 || !discovery && groups.some((g,i) => g.difficulty === 1 && visible[i] !== 3)) continue;
  const fairness = inspect(groups);
  if (!passesBloodTiesFairness(discovery ? { ...fairness, easyClear: true } : fairness)) continue;
  const review = discovery ? inspectBloodTiesDiscovery(groups) : null;
  if (discovery && !passesBloodTiesDiscovery(review)) continue;
  const signature = groups.map(g => `${g.id}:${[...g.answers].sort().join('\u001f')}`).sort().join('|');
  if (seen.has(signature)) continue;
  seen.add(signature);
  // Compact indices refer only to this exact workbook digest.
  pool.push(groups.map(g => [g.id, ...g.answers.map(t => g.tiles.indexOf(t))]));
  ambiguity.push(fairness.rejectedTrios);
  if (discovery) opening.push(review.isolatedGroups);
  overlapCounts[traps.length]++;
  groups.forEach(g => coverage.set(g.id, (coverage.get(g.id) || 0) + 1));
  groups.forEach(g => g.answers.forEach(tile => membershipCoverage.add(JSON.stringify([g.id,tile]))));
  tiles.forEach(tile => tileCoverage.add(tile));
}
if (pool.length !== poolSize || coverage.size !== categories.length) {
  const missing = categories.filter(g => !coverage.has(g.id)).map(g => `${g.id} ${g.name}`).join('; ');
  throw new Error(`Insufficient fair-board coverage: ${pool.length}/${poolSize} boards, ${coverage.size}/${categories.length} categories. Uncovered categories: ${missing || 'none'}. Review their memberships and classifications; the safeguards have not been relaxed.`);
}
const missingTiles = discovery ? [...new Set(categories.flatMap(g => g.tiles))].filter(tile => !tileCoverage.has(tile)) : [];
if (missingTiles.length) throw new Error(`The compiled pool would lose eligible tiles: ${missingTiles.join('; ')}. Review their pairings; no tiles have been silently removed.`);
const missingMemberships = discovery ? categories.flatMap(g => g.tiles.filter(tile => !membershipCoverage.has(JSON.stringify([g.id,tile]))).map(tile => `${g.id}: ${tile}`)) : [];
if (missingMemberships.length) throw new Error(`The compiled pool would lose category/answer combinations: ${missingMemberships.join('; ')}. Review their pairings; no memberships have been silently removed.`);
const data = { version: catalogue.version, effectiveDate: catalogue.effectiveDate, fairnessVersion: BLOOD_TIES_FAIRNESS_VERSION, sourceSha256: catalogue.sourceSha256, boards: pool, ambiguity };
if (discovery) Object.assign(data, { discoveryVersion: BLOOD_TIES_DISCOVERY_VERSION, opening });
const content = '// Generated by scripts/generate-blood-ties.mjs. Do not edit.\nexport const bloodTiesBoards = ' + JSON.stringify(data) + ';\n';
const versions = [];
for (const filename of (await readdir(path.join(root, 'js'))).sort()) {
  const match = /^blood-ties-catalogue-v(\d+)\.js$/.exec(filename);
  if (!match || Number(match[1]) < 3) continue;
  const { bloodTiesCatalogue: old } = await import(pathToFileURL(path.join(root, 'js', filename)));
  const { bloodTiesBoards: oldBoards } = await import(pathToFileURL(path.join(root, 'js', `blood-ties-boards-v${old.version}.js`)));
  if (old.version >= catalogue.version || old.version !== Number(match[1]) || oldBoards.version !== old.version || old.sourceSha256 !== oldBoards.sourceSha256 || old.effectiveDate !== oldBoards.effectiveDate) throw new Error(`Invalid archived content version ${match[1]}.`);
  versions.push({ version: old.version, effectiveDate: old.effectiveDate });
}
versions.push({ version: catalogue.version, effectiveDate: catalogue.effectiveDate });
versions.sort((a,b) => a.version-b.version);
if (versions.some((v,i) => i > 0 && v.effectiveDate <= versions[i-1].effectiveDate)) throw new Error('Content versions must have increasing effective dates.');
const registry = '// Generated by scripts/generate-blood-ties.mjs. Historical snapshots stay immutable.\n'
  + versions.map(v => `import { bloodTiesCatalogue as catalogue${v.version} } from './blood-ties-catalogue${v.version === catalogue.version ? '' : `-v${v.version}`}.js';\nimport { bloodTiesBoards as boards${v.version} } from './blood-ties-boards${v.version === catalogue.version ? '' : `-v${v.version}`}.js';`).join('\n')
  + '\nexport const bloodTiesContents = [\n' + versions.map(v => `  { catalogue: catalogue${v.version}, boards: boards${v.version} },`).join('\n') + '\n];\n';
if (!process.argv.includes('--check') && catalogue.effectiveDate <= new Date().toISOString().slice(0,10)) {
  const existing = await readFile(path.join(root, 'js/blood-ties-boards.js'), 'utf8').catch(() => null);
  if (existing !== content) throw new Error('Refusing to change already issued Blood Ties puzzles. Import a new content version with a future effective date first.');
}
for (const [filename,value] of [['blood-ties-boards.js',content],['blood-ties-content.js',registry]]) {
  const output = path.join(root, 'js', filename);
  if (process.argv.includes('--check')) {
    if (await readFile(output, 'utf8') !== value) throw new Error(`${filename} is stale. Run node scripts/generate-blood-ties.mjs.`);
  } else await writeFile(output, value);
}
console.log(`Blood Ties v${catalogue.version}: ${pool.length} catalogue-unique fair boards, all ${coverage.size} categories covered; effective ${catalogue.effectiveDate}. Overlap tiles 0/1/2: ${overlapCounts.join('/')}.`);
