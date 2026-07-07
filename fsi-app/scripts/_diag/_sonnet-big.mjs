const ROOT=new URL("../../",import.meta.url).pathname.replace(/^\//,""); try{process.loadEnvFile(ROOT+".env.local");}catch{}
const t=Date.now();
const body={model:"claude-sonnet-4-6",max_tokens:2000,messages:[{role:"user",content:"Extract 3 factual claims as JSON from: "+("The regulation requires annual reporting by January 31. ".repeat(120))}]};
try{ const r=await Promise.race([fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify(body)}),new Promise((_,j)=>setTimeout(()=>j(new Error("TIMEOUT")),60000))]); console.log(`${((Date.now()-t)/1000).toFixed(1)}s HTTP ${r.status}`);}catch(e){console.log(`${((Date.now()-t)/1000).toFixed(1)}s ERR ${e.message}`);}
process.exit(0);
