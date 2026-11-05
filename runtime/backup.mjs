import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
const directory=resolve(process.env.DATA_DIR||'data'),source=join(directory,'paper.sqlite');
if(!existsSync(source))throw Error('No existe una base de datos para respaldar');
const dest=join(directory,'backups','paper-'+new Date().toISOString().replaceAll(':','-')+'.sqlite');
mkdirSync(join(directory,'backups'),{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,dest);console.log('Copia SQLite consistente: '+dest);}finally{db.close();}
