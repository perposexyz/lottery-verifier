const enc = new TextEncoder();

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseEntries(text) {
  return text
    .split('\n')
    .slice(4)
    .filter((line) => line !== '')
    .map((line) => {
      const f = line.split(':');
      return { account: Number(f[0]), tickets: BigInt(f[f.length - 1]) };
    });
}

async function rand(seed, n, below) {
  return BigInt('0x' + (await sha256hex(`${seed}:${n}`))) % below;
}

async function pick(seed, n, entries, taken) {
  const left = entries.filter((e) => !taken.has(e.account) && e.tickets > 0n);
  const total = left.reduce((s, e) => s + e.tickets, 0n);
  if (total === 0n) return null;
  let x = await rand(seed, n, total);
  for (const e of left) {
    if (x < e.tickets) return e.account;
    x -= e.tickets;
  }
  throw new Error('unreachable');
}

async function draw(seed, entries, places) {
  const won = [];
  let n = 0;
  const k = Math.min(places, entries.filter((e) => e.tickets > 0n).length);
  for (let i = 0; i < k; i++) {
    won.push(await pick(seed, n, entries, new Set(won)));
    n++;
  }
  for (let i = won.length - 1; i > 0; i--) {
    const j = Number(await rand(seed, n, BigInt(i + 1)));
    n++;
    [won[i], won[j]] = [won[j], won[i]];
  }
  return { won, n };
}

async function blockhashAt(rpc, slot) {
  for (let s = slot; s < slot + 200; s++) {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBlock',
        params: [s, { commitment: 'finalized', transactionDetails: 'none', rewards: false, maxSupportedTransactionVersion: 0 }],
      }),
    });
    const body = await res.json();
    if (body.result) return { slot: s, blockhash: body.result.blockhash };
    if (body.error && ![-32007, -32009].includes(body.error.code)) throw new Error(`RPC: ${body.error.message}`);
  }
  throw new Error(`no finalized block found from slot ${slot}`);
}

async function verifyRound(data, { rpc } = {}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  const commit = await sha256hex(data.entries);
  add('Entries hash to the published commit', commit === data.commit, commit);

  const slotLine = data.entries.split('\n')[3];
  add('Entries name the target slot', slotLine === `slot ${data.targetSlot}`, slotLine);

  let blockhash = data.blockhash;
  if (rpc) {
    const chain = await blockhashAt(rpc, data.targetSlot);
    add(
      'Blockhash matches the Solana chain',
      chain.blockhash === data.blockhash && chain.slot === data.slot,
      `slot ${chain.slot}: ${chain.blockhash}`,
    );
    blockhash = chain.blockhash;
  } else {
    add('Blockhash matches the Solana chain', null, 'skipped: no RPC given');
  }

  const seed = await sha256hex(`${data.commit}:${blockhash}`);
  add('Seed = sha256(commit:blockhash)', seed === data.seed, seed);

  const entries = parseEntries(data.entries);
  const { won, n: start } = await draw(seed, entries, data.places);
  const places = new Map(won.map((a, i) => [i + 1, a]));
  const ever = new Set(won);
  let n = start;
  for (const step of data.redraws ?? []) {
    const a = await pick(seed, n, entries, ever);
    n++;
    if (a === null) places.delete(step.place);
    else {
      places.set(step.place, a);
      ever.add(a);
    }
  }

  const published = new Map((data.winners ?? []).filter((w) => !w.removed).map((w) => [w.place, w.account]));
  const same =
    places.size === published.size && [...places].every(([place, account]) => published.get(place) === account);
  add(
    'Winners recomputed = winners published',
    same,
    [...places].sort((a, b) => a[0] - b[0]).map(([p, a]) => `#${p}: account ${a}`).join(', ') || 'no winners',
  );

  return { ok: checks.every((c) => c.ok !== false), checks, winners: places };
}

if (typeof module !== 'undefined') module.exports = { verifyRound, sha256hex };
