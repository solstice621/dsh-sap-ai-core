// Local UI observation only: no model calls or credential reads, and no response-body logs.
import { createServer, request } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createParser } from 'eventsource-parser';

const upstream = new URL(process.argv[2]);
const output = resolve(process.argv[3]);
if (upstream.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname) || upstream.username || upstream.password) throw new Error('Specify an explicit loopback HTTP UI endpoint.');
const events = [];
let pending = Promise.resolve();
const metadata = value => value ? Object.fromEntries(['kagent_usage_metadata','dsh_kagent_total_usage','dsh_kagent_usage_id','dshAgent'].filter(key=>value[key]!==undefined).map(key=>[key,value[key]])) : undefined;
const persist = () => {
  const bytes = JSON.stringify({observedAt:new Date().toISOString(),events},null,2)+String.fromCharCode(10);
  pending = pending.then(()=>writeFile(output,bytes,{mode:0o600}));
  pending.catch(()=>{});
};
const server = createServer((incoming, outgoing) => {
  const forward = request({hostname:upstream.hostname,port:upstream.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'accept-encoding':'identity'}}, response => {
    outgoing.writeHead(response.statusCode ?? 502,response.headers);
    if ((incoming.url??'').startsWith('/a2a/kagent/sap-cn40-check') && response.headers['content-type']?.includes('text/event-stream')) {
      const decoder = new TextDecoder();
      const parser = createParser({onEvent:event=>{
        if(event.data==='[DONE]') return;
        try {
          const value=JSON.parse(event.data).result;
          if(!value)return;
          events.push({kind:value.kind,id:value.id,taskId:value.taskId,contextId:value.contextId,final:value.final,metadata:metadata(value.metadata),state:value.status?.state,messageMetadata:metadata(value.status?.message?.metadata),artifactMetadata:metadata(value.artifact?.metadata)});
          persist();
        } catch { events.push({unparseableEvent:true}); persist(); }
      }});
      response.on('data',bytes=>{try{parser.feed(decoder.decode(bytes,{stream:true}));}catch{}});
    }
    response.pipe(outgoing);
  });
  forward.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});
  incoming.on('aborted',()=>forward.destroy());
  outgoing.on('close',()=>{if(!outgoing.writableEnded)forward.destroy();});
  incoming.pipe(forward);
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,pid:process.pid,output})));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>{void pending.finally(()=>process.exit());});});
