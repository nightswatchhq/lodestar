#!/usr/bin/env bash
# Drop the cached IPFS metadata documents from Redis.
#
#   bash purge-ipfs-cache.sh
#
# Every one of them holds the double-encoded shape, so the live dashboard keeps serving nameless
# subgraphs for up to 24 hours after the Postgres repair unless these go. They are a cache and
# nothing else: deleting them costs one re-read from Postgres per document, and Postgres now holds
# the right thing.
set -euo pipefail
HOST=${HOST:-root@167.235.29.213}
KEY=${KEY:-$HOME/.ssh/hetzner_drpc}

ssh -i "$KEY" "$HOST" 'bash -s' <<'BOX'
set -euo pipefail
PW=$(grep -oP '^requirepass \K.*' /etc/redis/redis.conf | tr -d '"')
r() { redis-cli --no-auth-warning -a "$PW" "$@"; }
before=$(r --scan --pattern 'ipfs:json:*' 2>/dev/null | wc -l)
echo "cached metadata documents: $before"
[ "$before" -gt 0 ] || { echo "nothing to do"; exit 0; }
# In batches, and by key rather than by FLUSHDB: this database also holds the activity feed, the
# chain-lag table and the enriched directory, and none of those are wrong.
r --scan --pattern 'ipfs:json:*' 2>/dev/null | xargs -r -n 200 redis-cli --no-auth-warning -a "$PW" DEL > /dev/null 2>&1
echo "remaining: $(r --scan --pattern 'ipfs:json:*' 2>/dev/null | wc -l)"
BOX
