# Perpose PP Lottery — verifier

Open-source check that a Perpose PP Lottery draw was fair. It recomputes the winners from public data only:

- the entries text fixed when the round closed, and its sha256 (the **commit**, posted to the Telegram chat at close);
- the blockhash of a Solana block that did not exist yet at close (fetched from any Solana RPC you choose);
- the algorithm below.

**Web:** https://memeperp2.github.io/lottery-verifier/?round=N — runs in your browser, no build, no dependencies.

**CLI** (Node 18+):

```
node cli.js ROUND [API_BASE] [SOLANA_RPC|-]
node cli.js 12
```

## Algorithm

1. At close: `entries` = 4 header lines (`perpose-lottery v2`, `round N`, `ends <ms>`, `slot S`) then one line per player `account:wallet:tickets` (v1: `account:tickets`), by account id. `commit = sha256(entries)` is published with the target slot `S` (≈ finalized slot + 150, about a minute ahead).
2. `blockhash` = hash of the first finalized Solana block at or after slot `S` (`getBlock`).
3. `seed = sha256(commit + ":" + blockhash)` (hex). `rand(n, m) = int(sha256(seed + ":" + n), 16) mod m`.
4. `k = min(places, players)`. For `n = 0..k-1`: `x = rand(n, tickets left)`, walk the players not drawn yet in order, subtracting tickets, until `x < tickets`: that player wins.
5. Places: for `i = k-1 .. 1`, `j = rand(n, i+1)` with `n` continuing from `k`; swap `i` and `j`. Position `i` is place `i+1`.
6. A winner removed for abuse: the place is re-drawn with the next `n` among players never drawn (published as `redraws`).

The data comes from `GET /sapi/v1/waitlist/lottery/verify?id=N`; you can also paste that JSON into the page.

## Why it can't be rigged

- The operator fixes the entries before the blockhash exists, and the commit is public, so the list can't be changed afterwards.
- Solana validators don't know the entries, so they can't pick a block that favours anyone.
- Players can't buy after close.

MIT licensed.
