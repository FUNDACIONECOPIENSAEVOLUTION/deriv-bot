import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read=file=>readFileSync(fileURLToPath(new URL('../'+file,import.meta.url)),'utf8');

test('Repair installer uses D-side temporary storage, verifies disk and restores environment',()=>{
 const ps=read('Reparar-Actualizador-PC.ps1');
 assert.match(ps,/\$tempRoot=Join-Path \$Ruta '_temporales-actualizacion'/);
 assert.match(ps,/\$env:TEMP=\$tempRoot;\$env:TMP=\$tempRoot/);
 assert.match(ps,/\$disk\.AvailableFreeSpace -lt 200MB/);
 assert.match(ps,/\$env:TEMP=\$oldTemp;\$env:TMP=\$oldTmp/);
 assert.match(ps,/\?cb=/);
 assert.match(ps,/SHA256_GITHUB_INCORRECTO/);
 assert.match(ps,/DATA_EN_PAQUETE_PROHIBIDA/);
});

test('Background updater also stages on D and prevents cached release manifests',()=>{
 const ps=read('Actualizar-Desde-GitHub.ps1');
 assert.match(ps,/\$temporaryRoot=Join-Path \$Ruta '_temporales-actualizacion'/);
 assert.match(ps,/\$env:TEMP=\$temporaryRoot;\$env:TMP=\$temporaryRoot/);
 assert.match(ps,/\$drive\.AvailableFreeSpace -lt 200MB/);
 assert.match(ps,/\$env:TEMP=\$previousTemp;\$env:TMP=\$previousTmp/);
 assert.match(ps,/\?cb=/);
 assert.match(ps,/Get-FileHash/);
 assert.match(ps,/ARCHIVO_PRIVADO_EN_PAQUETE_PROHIBIDO/);
});
