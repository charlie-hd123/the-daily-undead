import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readdir, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bloodTiesCatalogue } from '../js/blood-ties-catalogue.js';
import { buildDailyBloodTiesPuzzle } from '../js/blood-ties-core.js';

test('future workbook additions archive issued content, compile automatically and preserve old assignments', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'blood-ties-import-'));
  t.after(() => rm(root, {recursive:true,force:true}));
  await mkdir(path.join(root,'js'));
  await writeFile(path.join(root,'package.json'),'{"type":"module"}');
  for (const name of await readdir(new URL('../js/',import.meta.url))) if (name.startsWith('blood-ties-') || name === 'game-core.js') await copyFile(new URL(`../js/${name}`,import.meta.url),path.join(root,'js',name));
  const oldSource = await readFile(path.join(root,'js/blood-ties-catalogue.js'),'utf8');
  const oldBoards = await readFile(path.join(root,'js/blood-ties-boards.js'),'utf8');
  const fixture = path.join(root,'rows.json'), workbook = path.join(root,'new-content.xlsm');
  // The owner's old sheet has no classifications yet: preserve reviewed IDs.
  const rows = [...bloodTiesCatalogue.connections.map(({discovery,...g}) => g), {id:'future-example',name:'Future example maps',definition:'Three new maps in the next content release.',family:'Maps',difficulty:1,tiles:['Future Map A','Future Map B','Future Map C'],discovery:{method:'name',theme:'Future maps',words:['future map']}}];
  await writeFile(fixture,JSON.stringify(rows));
  // A tiny standards-based first-worksheet fixture, with no Excel dependencies.
  const makeWorkbook = () => execFileSync('python3',['-c',`
import json, sys, zipfile
from xml.sax.saxutils import escape
rows=json.load(open(sys.argv[1]))
values=[['Connection ID','Name','Definition','Family','Difficulty','Eligible tile 01']+['']*15+['Research link','Discovery','Name theme','Clue words']]
values += [[g['id'],g['name'],g['definition'],g['family'],str(g['difficulty']),*(g['tiles']+['']*(16-len(g['tiles']))),g.get('researchLink',''),g.get('discovery',{}).get('method',''),g.get('discovery',{}).get('theme',''),' | '.join(g.get('discovery',{}).get('words',[]))] for g in rows]
xml='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
for i,row in enumerate(values,1):
 xml += '<row r="'+str(i)+'">'+''.join('<c r="'+chr(65+j)+str(i)+'" t="inlineStr"><is><t>'+escape(v)+'</t></is></c>' for j,v in enumerate(row))+'</row>'
xml += '</sheetData></worksheet>'
with zipfile.ZipFile(sys.argv[2],'w') as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Blood Ties" sheetId="1" r:id="rId1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
 z.writestr('xl/worksheets/sheet1.xml',xml)
`,fixture,workbook]);
  makeWorkbook();
  const importer = fileURLToPath(new URL('../scripts/import-blood-ties.py',import.meta.url));
  const effectiveDate = new Date(Math.max(Date.now()+3*86400000,Date.parse(`${bloodTiesCatalogue.effectiveDate}T00:00:00Z`)+3*86400000)).toISOString().slice(0,10);
  const runImport = date => spawnSync('python3',[importer,workbook,'--effective-date',date,'--root',root],{encoding:'utf8'});
  assert.notEqual(runImport('2026-10-25').status,0);
  assert.equal(await readFile(path.join(root,'js/blood-ties-catalogue.js'),'utf8'),oldSource);
  const archive = path.join(root,`js/blood-ties-catalogue-v${bloodTiesCatalogue.version}.js`);
  await writeFile(archive,'do not overwrite');
  assert.notEqual(runImport(effectiveDate).status,0);
  assert.equal(await readFile(archive,'utf8'),'do not overwrite');
  assert.equal(await readFile(path.join(root,'js/blood-ties-catalogue.js'),'utf8'),oldSource);
  await rm(archive);
  // Unclassified additions cannot silently become supposedly approachable.
  await writeFile(fixture,JSON.stringify(rows.map(g => g.id === 'future-example' ? {...g,discovery:undefined} : g)));
  makeWorkbook();
  assert.match(runImport(effectiveDate).stderr,/needs a Discovery classification/);
  assert.equal(await readFile(path.join(root,'js/blood-ties-catalogue.js'),'utf8'),oldSource);
  // Incomplete new categories fail before any history or current content writes.
  await writeFile(fixture,JSON.stringify([...rows,{id:'incomplete',name:'Incomplete',definition:'Missing tiles',family:'Maps',difficulty:1,tiles:['Only one']} ]));
  makeWorkbook();
  assert.notEqual(runImport(effectiveDate).status,0);
  assert.equal(await readFile(path.join(root,'js/blood-ties-catalogue.js'),'utf8'),oldSource);
  await writeFile(fixture,JSON.stringify(rows));makeWorkbook();
  const imported = runImport(effectiveDate);
  assert.equal(imported.status,0,imported.stderr);
  assert.equal(await readFile(archive,'utf8'),oldSource);
  assert.equal(await readFile(path.join(root,`js/blood-ties-boards-v${bloodTiesCatalogue.version}.js`),'utf8'),oldBoards);
  const importedCatalogue = JSON.parse((await readFile(path.join(root,'js/blood-ties-catalogue.js'),'utf8')).split(' = ')[1].trim().replace(/;$/,''));
  assert.deepEqual(importedCatalogue.connections[0].discovery,bloodTiesCatalogue.connections[0].discovery);
  execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/generate-blood-ties.mjs',import.meta.url)),'--root',root]);
  const before = new Date(Date.parse(`${effectiveDate}T00:00:00Z`)-86400000).toISOString().slice(0,10);
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import {pathToFileURL} from 'node:url';
    const [root,before,effective,expected,version,count]=process.argv.slice(1);
    const {buildDailyBloodTiesPuzzle:build}=await import(pathToFileURL(root+'/js/blood-ties-core.js'));
    assert.deepEqual(build(before),JSON.parse(expected));
    assert.equal(build(effective).contentVersion,Number(version));
    const {bloodTiesBoards:pool}=await import(pathToFileURL(root+'/js/blood-ties-boards.js'));
    assert.equal(new Set(pool.boards.flatMap(board=>board.map(g=>g[0]))).size,Number(count));
  `,root,before,effectiveDate,JSON.stringify(buildDailyBloodTiesPuzzle(before)),String(bloodTiesCatalogue.version+1),String(bloodTiesCatalogue.connections.length+1)]);
  // Once that date has arrived, changing the seed/content must never silently
  // rewrite the existing daily assignments, even via the compiler directly.
  const compiled = await readFile(path.join(root,'js/blood-ties-boards.js'),'utf8');
  const current = path.join(root,'js/blood-ties-catalogue.js');
  await writeFile(current,(await readFile(current,'utf8')).replace(/"sourceSha256": "[a-f0-9]+"/,'"sourceSha256": "'+'f'.repeat(64)+'"'));
  const guarded = spawnSync(process.execPath,['--input-type=module','-e',`
    import {pathToFileURL} from 'node:url';
    const [script,root,effective]=process.argv.slice(1);
    const RealDate=Date;
    globalThis.Date=class extends RealDate { constructor(...args) { super(...(args.length?args:[effective+'T12:00:00Z'])); } };
    process.argv=[process.execPath,script,'--root',root];
    await import(pathToFileURL(script));
  `,fileURLToPath(new URL('../scripts/generate-blood-ties.mjs',import.meta.url)),root,effectiveDate],{encoding:'utf8'});
  assert.notEqual(guarded.status,0);
  assert.match(guarded.stderr,/Refusing to change already issued/);
  assert.equal(await readFile(path.join(root,'js/blood-ties-boards.js'),'utf8'),compiled);
});
