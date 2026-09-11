// What public key does this issuer key produce?
//
//   node scripts/issuer-pubkey.mjs        # asks for the key, input hidden
//   echo "<key>" | node scripts/issuer-pubkey.mjs
//
// A receipt names the public half of the key that signed it. Install the wrong issuer key and
// every receipt already in circulation stops being verifiable - not invalid-looking, unverifiable,
// which is worse, and indistinguishable from success at the moment you install it.
//
// This answers the question locally, before anything is written anywhere: it signs a throwaway
// receipt with the key using this repo's own tattler wasm, prints the public half, and compares it
// against what the live deployment is signing with. The key never leaves this machine.

import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';

const require = createRequire(import.meta.url);
const wasm = require(`${process.cwd()}/public/tattler/tattler_wasm_node.cjs`);

const LIVE = 'https://www.lodestar-dashboard.com/api/sql/receipt';

/** A body tattler will sign: the hash has to be of the rows actually given, and the rows are none. */
const PROBE_BODY = {
  nid: 'n',
  dataset: 'd',
  query: 'SELECT 1',
  as_of_block: 1,
  sealed_through: 1,
  registry_hash: 'r',
  result_hash: '0x18a1561c31cf04338181fe1510e5cd9dbe13a0a7dc897ff658a6172d1d462d32',
  row_count: 0,
  issued_at: '2026-01-01T00:00:00.000Z',
  query_name: 't',
  query_args: {},
};

function pubkeyOf(hex) {
  const out = JSON.parse(wasm.issue_receipt(JSON.stringify(PROBE_BODY), JSON.stringify([]), hex));
  if (out.ok === false) throw new Error(out.detail ?? 'the key was refused');
  return out.pubkey;
}

async function livePubkey() {
  const res = await fetch(LIVE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'delegations_to_indexer',
      args: { indexer: '0x0000000000000000000000000000000000000000', before_block: 0 },
    }),
    signal: AbortSignal.timeout(40_000),
  });
  const body = await res.json();
  return (body.data ?? body).pubkey ?? null;
}

async function readKey() {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return chunks.join('').trim();
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  // Echo off, so a key pasted into a shared screen does not stay on it.
  rl.output.write('issuer key (input hidden): ');
  rl._writeToOutput = () => {};
  const answer = await new Promise((r) => rl.question('', r));
  rl.close();
  process.stderr.write('\n');
  return answer.trim();
}

const raw = await readKey();
const key = raw.startsWith('0x') ? raw.slice(2) : raw;

if (!/^[0-9a-fA-F]{64}$/.test(key)) {
  // Says what is wrong with it without putting it on the screen.
  console.error(`that is ${key.length} characters and not 64 hex; it is not an issuer key.`);
  process.exit(1);
}

const mine = pubkeyOf(key);
const live = await livePubkey().catch(() => null);

console.log(`this key signs as: ${mine}`);
if (!live) {
  console.log('could not reach the live deployment, so there was nothing to compare against.');
  process.exit(2);
}
console.log(`the live one signs as: ${live}`);
console.log(
  mine === live
    ? '\nthey match. This is the incumbent key; installing it keeps every receipt verifiable.'
    : '\nTHEY DO NOT MATCH. This is not the key the live deployment signs with.',
);
process.exit(mine === live ? 0 : 1);
