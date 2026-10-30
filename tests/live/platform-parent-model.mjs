// Deterministic OpenAI-wire fixture for a real kagent Go ADK parent.
// Only the delegated SAP child uses a paid model. No real prompts or credentials are logged.
import { createServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest();
if (!process.env.PARENT_FIXTURE_TOKEN) throw new Error('PARENT_FIXTURE_TOKEN is required.');
const expected = hash(process.env.PARENT_FIXTURE_TOKEN);
const stats = { calls: 0, delegated: 0, completed: 0 };
const prompt = '仅使用 write 工具，file_path 必须为 sap-cn40-proof.txt，content 必须为 CN40_OK，不要换行。不要使用其它工具。写入若被拒绝，不要重试，只回答“已拒绝”；成功则只回答“已完成”。';
const LF = String.fromCharCode(10);
createServer(async (request,response) => {
  if (request.url === '/health') { response.end('ready'); return; }
  if (!timingSafeEqual(expected,hash((request.headers.authorization??'').replace(/^Bearer /,'')))) { response.writeHead(401).end(); return; }
  if (request.url === '/stats') { response.setHeader('content-type','application/json'); response.end(JSON.stringify(stats)); return; }
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') { response.writeHead(404).end(); return; }
  try {
    let body='';
    for await(const chunk of request){body+=chunk;if(body.length>1048576)throw new Error('size');}
    const input=JSON.parse(body);
    const turn=input.messages.slice(Math.max(0,input.messages.findLastIndex(message=>message.role==='user')));
    const result=turn.findLast(message=>message.role==='tool');
    let message;
    if(result){stats.completed++;message={role:'assistant',content:'Parent received SAP child result: '+result.content};}
    else {
      const tools=(input.tools??[]).filter(tool=>tool.function?.name.includes('sap')&&tool.function?.parameters?.properties?.request);
      if(tools.length!==1)throw new Error('remote tool');
      stats.delegated++;
      message={role:'assistant',content:null,tool_calls:[{id:'parent-'+randomUUID(),type:'function',function:{name:tools[0].function.name,arguments:JSON.stringify({request:prompt})}}]};
    }
    stats.calls++;
    const reply={id:'parent-fixture-'+randomUUID(),object:'chat.completion',created:Math.floor(Date.now()/1000),model:'sap-parent-fixture',choices:[{index:0,message,finish_reason:message.tool_calls?'tool_calls':'stop'}]};
    if(input.stream){
      response.writeHead(200,{'content-type':'text/event-stream'});
      const delta=message.tool_calls?{role:'assistant',tool_calls:message.tool_calls.map((call,index)=>({index,...call}))}:message;
      const events=[{...reply,object:'chat.completion.chunk',choices:[{index:0,delta,finish_reason:null}]},{...reply,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:reply.choices[0].finish_reason}]}];
      for(const event of events)response.write('data: '+JSON.stringify(event)+LF+LF);
      response.end('data: [DONE]'+LF+LF);
    }else{response.setHeader('content-type','application/json');response.end(JSON.stringify(reply));}
  }catch{response.writeHead(400,{'content-type':'application/json'});response.end(JSON.stringify({error:{message:'Invalid parent fixture request',type:'invalid_request_error'}}));}
}).listen(8080,'0.0.0.0',()=>console.log('Deterministic SAP parent fixture ready.'));
