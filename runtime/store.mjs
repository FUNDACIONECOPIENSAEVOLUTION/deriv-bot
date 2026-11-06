import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {initialState} from './core.mjs';

export class Store {
  constructor(filename,config,epoch=Math.floor(Date.now()/1000)) {
    this.filename=resolve(filename);mkdirSync(dirname(this.filename),{recursive:true});
    this.db=new DatabaseSync(this.filename);
    try {
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
      const version=this.db.prepare('PRAGMA user_version').get().user_version;
      if(version>1)throw Error('Versión de base de datos más reciente que este programa');
      this.db.exec('CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL); CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ticks (id INTEGER PRIMARY KEY,epoch INTEGER NOT NULL,symbol TEXT NOT NULL,quote REAL NOT NULL); CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY,epoch INTEGER NOT NULL,type TEXT NOT NULL,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS trades (id TEXT PRIMARY KEY,status TEXT NOT NULL,data TEXT NOT NULL); PRAGMA user_version=1;');
      const fingerprint=JSON.stringify(config),saved=this.db.prepare('SELECT config FROM settings WHERE id=1').get();
      if(saved&&saved.config!==fingerprint)throw Error('Configuración distinta: conserva esta base y utiliza otro DATA_DIR para un experimento nuevo');
      if(!saved) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
          this.db.prepare('INSERT INTO settings VALUES(1,?)').run(fingerprint);
          this.db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(initialState(config,epoch)));
          this.db.exec('COMMIT');
        } catch(e){this.db.exec('ROLLBACK');throw e;}
      }
    } catch(e) {this.db.close();throw e;}
  }
  load(){return JSON.parse(this.db.prepare('SELECT data FROM state WHERE id=1').get().data);}
  commit(state,events=[],tick=null) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if(tick)this.db.prepare('INSERT INTO ticks(epoch,symbol,quote) VALUES(?,?,?)').run(tick.epoch,tick.symbol,tick.quote);
      this.db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(state));
      for(const event of events) {
        this.db.prepare('INSERT INTO events(epoch,type,data) VALUES(?,?,?)').run(event.epoch,event.type,JSON.stringify(event));
        if(event.trade)this.db.prepare('INSERT INTO trades(id,status,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data').run(event.trade.id,event.trade.status,JSON.stringify(event.trade));
      }
      this.db.exec('COMMIT');
    } catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  recentTrades(limit=30){return this.db.prepare('SELECT data FROM trades ORDER BY rowid DESC LIMIT ?').all(limit).map(x=>JSON.parse(x.data));}
  recentEvents(limit=20){return this.db.prepare('SELECT data FROM events ORDER BY id DESC LIMIT ?').all(limit).map(x=>JSON.parse(x.data));}
  tickCount(){return this.db.prepare('SELECT count(*) AS n FROM ticks').get().n;}
  async backup(destination){
    if(existsSync(destination))throw Error('La copia de destino ya existe');
    mkdirSync(dirname(resolve(destination)),{recursive:true});
    await backup(this.db,resolve(destination));
    return resolve(destination);
  }
  close(){this.db.close();}
}
