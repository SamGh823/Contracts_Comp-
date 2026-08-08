export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, X-App-Token');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const requiredToken=process.env.APP_ACCESS_TOKEN||'';
  if(requiredToken&&req.headers['x-app-token']!==requiredToken)return res.status(401).json({error:'Invalid app token'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'AI backend is not configured'});
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const text=String(body.text||'').slice(0,70000);
  if(text.trim().length<30)return res.status(400).json({error:'Contract text is too short'});
  const schema={type:'object',additionalProperties:false,properties:{type:{type:'string',enum:['electricity','internet','mobile','other']},provider:{type:'string'},tariff:{type:'string'},monthly:{type:'number'},workPrice:{type:'number'},basePrice:{type:'number'},annualUsage:{type:'number'},monthlyPayment:{type:'number'},start:{type:'string'},end:{type:'string'},cancel:{type:'string'},cancelNotice:{type:'string'},bonus:{type:'number'},priceGuarantee:{type:'string'},summary:{type:'string'},warnings:{type:'array',items:{type:'string'}},confidence:{type:'integer',minimum:0,maximum:100}},required:['type','provider','tariff','monthly','workPrice','basePrice','annualUsage','monthlyPayment','start','end','cancel','cancelNotice','bonus','priceGuarantee','summary','warnings','confidence']};
  const instructions=`You extract consumer contract data from German contracts. Return only facts supported by the document. If a value is absent, return empty string for text or 0 for numbers. Dates must be YYYY-MM-DD. For tariff-change letters, prefer the NEW/FUTURE contract terms over the old/current terms when the document clearly labels both. For electricity: workPrice is Arbeitspreis in ct/kWh, basePrice is Grundpreis in EUR/month, annualUsage is Jahresverbrauch in kWh, monthlyPayment is Abschlag in EUR/month. Do not treat Grundpreis as the total monthly price. monthly should be 0 for electricity unless an explicit total monthly price is stated. cancel is the relevant nächstmöglicher/letztmöglicher Kündigungstermin for the selected new/current contract. Never infer a date from general AGB if a contract-specific date is available. cancelNotice is the textual Kündigungsfrist such as '1 Monat'. priceGuarantee should preserve the document wording, e.g. '18 Monate' or 'Keine'. The summary should be concise German-language contract interpretation useful to the user. Warnings should mention ambiguities or missing important values.`;
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5-mini',instructions,input:`Analyze this German contract text:\n\n${text}`,text:{format:{type:'json_schema',name:'contract_data',strict:true,schema}}})});
    const data=await r.json();
    if(!r.ok)return res.status(r.status).json({error:data?.error?.message||'OpenAI request failed'});
    const out=data.output_text||data.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
    if(!out)return res.status(502).json({error:'AI returned no structured result'});
    const parsed=JSON.parse(out);
    return res.status(200).json(parsed);
  }catch(e){return res.status(500).json({error:e?.message||'AI analysis failed'});}
}
