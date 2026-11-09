import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const read=name=>readFileSync(fileURLToPath(new URL('../'+name,import.meta.url)),'utf8');
test('Cerrar PC no confunde PID ausente con servidor apagado',()=>{
 const src=read('Cerrar-Ecopiensa.ps1');
 assert.match(src,/Get-CimInstance -ClassName Win32_Process/);
 assert.match(src,/GetLongPathNameW/);
 assert.match(src,/EcopiensaCanonicalPath/);
 assert.match(src,/Stop-Process -Id/);
 assert.match(src,/ejecucion-habilitada\.flag/);
 assert.match(src,/No se encontro un proceso Node/);
});
test('Reparador crea mantenimiento y bloquea concurrente antes de cerrar Node',()=>{
 const src=read('Reparar-Actualizador-PC.ps1');
 assert.match(src,/actualizacion-en-curso\.flag/);
 assert.match(src,/EcopiensaActualizacionPC/);
 assert.match(src,/COMPRAS_ACTIVAS_AL_INTENTAR_CERRAR/);
 assert.match(src,/Join-Path \$source 'Cerrar-Ecopiensa\.ps1'/);
 assert.ok(src.indexOf('Set-Content -LiteralPath $maintenance')<
  src.indexOf("Join-Path $app 'Cerrar-Ecopiensa.ps1'"));
 assert.match(src,/SERVIDOR_SIGUE_ACTIVO/);
 assert.match(src,/\$copyStarted/);
 assert.match(src,/\$completed/);
 assert.match(src,/Enable-ScheduledTask/);
});
test('Supervisor no reinicia Node durante mantenimiento',()=>{
 const src=read('Vigilar-Ecopiensa.ps1');
 assert.match(src,/Test-Path -LiteralPath \$maintenance/);
 assert.ok(src.indexOf('if(Test-Path -LiteralPath $maintenance){exit 0}')<
  src.indexOf('Start-Process'));
});
