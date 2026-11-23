const { verifyRound } = require('./verify.js');

const [, , id, api = 'https://api.perpose.xyz', rpc = 'https://solana-rpc.publicnode.com'] = process.argv;
if (!id) {
  console.error('usage: node cli.js ROUND [API_BASE] [SOLANA_RPC|-]');
  process.exit(2);
}

(async () => {
  const res = await fetch(`${api}/sapi/v1/waitlist/lottery/verify?id=${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  const out = await verifyRound(data, { rpc: rpc === '-' ? null : rpc });
  for (const c of out.checks) console.log(`${c.ok === null ? '–' : c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`);
  console.log(out.ok ? '\nFAIR: the draw recomputes exactly' : '\nMISMATCH');
  process.exit(out.ok ? 0 : 1);
})().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
