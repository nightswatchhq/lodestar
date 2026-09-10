/**
 * Reading a subgraph id back out of a publish receipt.
 *
 * `publishNewSubgraph` does not return the id. The GNS mints an ERC-721 and the id is the token
 * id, which appears only in the Transfer log, so parsing the receipt is the only way to learn what
 * was just published. A mint is specifically a Transfer *from* the zero address, which is what the
 * second topic check is for: an ordinary transfer of an existing subgraph would otherwise match.
 */
// ERC721 Transfer(from=0x0, to, tokenId) — emitted by GNS when minting a new subgraph NFT
const ERC721_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_TOPIC = '0x0000000000000000000000000000000000000000000000000000000000000000';

export function extractSubgraphId(
  logs: readonly { address: string; topics: readonly string[] }[],
  gnsAddress: string,
): string | null {
  for (const log of logs) {
    if (
      log.address.toLowerCase() === gnsAddress.toLowerCase() &&
      log.topics[0] === ERC721_TRANSFER &&
      log.topics[1] === ZERO_TOPIC
    ) {
      return BigInt(log.topics[3]).toString();
    }
  }
  return null;
}