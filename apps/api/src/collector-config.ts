import { readFileSync } from 'node:fs';

const keys=new Set(['COLLECTOR_ENABLED','COLLECTOR_TARGET','COLLECTOR_SERVER_NAME','COLLECTOR_CA_FILE','COLLECTOR_CERT_FILE','COLLECTOR_KEY_FILE','COLLECTOR_CONSUMER_ID','COLLECTOR_CHANNEL_ID','COLLECTOR_GAME_CHANNEL_ID']);
export function parseCollectorConfig(text:string):Record<string,string>{
  const result:Record<string,string>={};
  for(const line of text.split(/\r?\n/)){
    if(!line.trim()||line.startsWith('#'))continue;
    const index=line.indexOf('=');const key=line.slice(0,index),value=line.slice(index+1);
    if(index<1||!keys.has(key)||key in result||!value||/[\x00-\x1f]/.test(value))throw new Error('Invalid collector configuration file');
    result[key]=value;
  }
  return result;
}
export function loadCollectorConfig(){
  const path=process.env.COLLECTOR_CONFIG_FILE;if(!path)return;
  try{for(const [key,value]of Object.entries(parseCollectorConfig(readFileSync(path,'utf8')))){process.env[key]??=value;}}
  catch{process.env.COLLECTOR_ENABLED='true';console.error('Collector configuration unavailable; collection will remain unavailable.');}
}
