import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// El error de la v12.6 ocurrió aunque todas las pruebas unitarias pasaron:
// el instalador del PC omitió market-analysis.mjs en su lista fija de archivos.
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repo=resolve(app,'..');
const read=path=>readFileSync(resolve(repo,path),'utf8');

test('Server imports must point to modules included in the local source tree',()=>{
 const file=read('local-demo/server.mjs');
 const imports=[...file.matchAll(/from\s+['"]([^'"]+)['"]/g)]
  .map(match=>match[1]).filter(path=>path.startsWith('./'));
 assert.ok(imports.some(path=>path.includes('market-analysis.mjs')));
 for(const imported of imports){
  assert.ok(existsSync(resolve(app,imported)),`Server import missing: ${imported}`);
 }
});

test('Updater installs every safe file from the checked archive, not a fixed allowlist',()=>{
 const updater=read('local-demo/Actualizar-Desde-GitHub.ps1');
 assert.match(updater,/Get-ChildItem -LiteralPath \$source -Recurse -File/);
 assert.match(updater,/market-analysis\.mjs/);
 assert.match(updater,/Copy-Item -LiteralPath \$file\.FullName -Destination \$target -Force/);
 assert.match(updater,/ARCHIVO_PRIVADO_EN_PAQUETE_PROHIBIDO/);
 assert.doesNotMatch(updater,/\$names=@\('server\.mjs'/);
});

test('Recovery installer requires market-analysis.mjs and preserves private data',()=>{
 const installer=read('local-demo/Reparar-Actualizador-PC.ps1');
 assert.match(installer,/PAQUETE_INCOMPLETO/);
 assert.match(installer,/market-analysis\.mjs/);
 assert.match(installer,/FALTA_CARPETA_PRIVADA/);
 assert.match(installer,/DATA_EN_PAQUETE_PROHIBIDA/);
});

test('Publisher and CI list market-analysis.mjs as a mandatory runtime dependency',()=>{
 const builder=read('scripts/build_pc_local_release.py');
 const workflow=read('.github/workflows/pc-local-release.yml');
 assert.match(builder,/assert \(app \/ "market-analysis\.mjs"\) in paths/);
 assert.match(workflow,/local-demo\/market-analysis\.mjs/);
});
