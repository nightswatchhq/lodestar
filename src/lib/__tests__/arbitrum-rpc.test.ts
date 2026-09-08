import { describe, it, expect, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { arbitrumRpcUrl, PUBLIC_ARBITRUM_RPC } from '../arbitrum-rpc';

const DEAD_GATEWAY = 'gateway.lodestar-dashboard.com';

describe('arbitrumRpcUrl', () => {
  const ORIG = process.env.ARBITRUM_RPC_URL;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.ARBITRUM_RPC_URL;
    else process.env.ARBITRUM_RPC_URL = ORIG;
  });

  it('prefers the configured endpoint', () => {
    process.env.ARBITRUM_RPC_URL = 'https://my-node.example/rpc';
    expect(arbitrumRpcUrl()).toBe('https://my-node.example/rpc');
  });

  it('falls back to the public endpoint, which is slow rather than dead', () => {
    delete process.env.ARBITRUM_RPC_URL;
    expect(arbitrumRpcUrl()).toBe(PUBLIC_ARBITRUM_RPC);
    expect(PUBLIC_ARBITRUM_RPC).not.toContain(DEAD_GATEWAY);
  });

  // Read at call time, not at module load, so setting the variable late still takes.
  it('re-reads the environment on every call', () => {
    delete process.env.ARBITRUM_RPC_URL;
    expect(arbitrumRpcUrl()).toBe(PUBLIC_ARBITRUM_RPC);
    process.env.ARBITRUM_RPC_URL = 'https://later.example/rpc';
    expect(arbitrumRpcUrl()).toBe('https://later.example/rpc');
  });
});

/**
 * The retired Dispatch gateway must not be anyone's default.
 *
 * It has answered nothing since 2026-07-20. #109 removed it from `reo-contract.ts` and `tap.ts` by
 * copying the same constant and the same twelve-line comment into both, and missed `dips-chain.ts`
 * entirely - so the dead default survived being fixed twice (#99). Nothing would have found the
 * third one, because nothing was looking.
 *
 * Comments are stripped before the search: `arbitrum-rpc.ts` names the host on purpose to explain
 * why it is gone, and the blog posts under `src/content` record what was true when they were
 * written. Neither is a default.
 */
describe('the retired Dispatch gateway is nobody a default', () => {
  function sources(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // `content` is the blog, which records what was true when it was written. `__tests__` is
        // this file and its neighbours, which have to name the host in order to assert about it.
        if (entry !== 'node_modules' && entry !== 'content' && entry !== '__tests__') {
          sources(full, found);
        }
      } else if (/\.(ts|tsx|mjs)$/.test(entry)) {
        found.push(full);
      }
    }
    return found;
  }

  const files = sources(join(process.cwd(), 'src'));

  it('scans a plausible number of files, so an empty sweep cannot pass for a clean one', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('appears in no executable line anywhere under src', () => {
    const offenders = files.filter((f) => {
      const code = readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => {
          const t = l.trim();
          return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
        })
        .join('\n');
      return code.includes(DEAD_GATEWAY);
    });

    expect(
      offenders.map((f) => f.replace(process.cwd() + '/', '')),
      'a dead fallback is a trap: the first fresh environment fails against a host that does not ' +
        'exist, with an error naming a domain that looks like ours. Use arbitrumRpcUrl().',
    ).toEqual([]);
  });
});
