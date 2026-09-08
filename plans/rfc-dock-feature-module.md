# [RFC] Splitting the Dock: one page into a feature module, before it ports

**Status:** Draft · **Author:** Pete · **Created:** 2026-09-08
**Relation:** precedes the `the Dock` block in `docs/MIGRATION.md` (0/9 routes). Touches no server route.
**Tracking:** nightswatchhq/lodestar#129

## TL;DR

`src/app/dock/page.tsx` is 2,275 lines. It holds eleven components, one hook, three helpers, two ABIs, 31 `useState` calls and seven `useEffect`s, and it has no tests of its own — every Dock test we have is against `lib/studio` or a route. It is the largest file in the repo and the first block of the kittiwake migration that hasn't started (0/9 routes).

This RFC proposes splitting it into `src/features/dock/` **before** its routes move, not after. The argument is that the split *is* the API inventory: each data hook that falls out of it is one kittiwake endpoint with a known request/response shape, and the page stops being a place where the wire format is implied by whatever `apiFetch` happened to be passed. Two shared pieces also fall out — a `Modal` and a `useContractStep` hook — and the second one retires the same ceremony from `curate` and `SubgraphLifecyclePanel` too, thirteen call sites in all.

Nothing here changes what the Dock does. This is a move, not a rewrite.

## What's in the file

Reading top to bottom:

| Lines | What | Depends on |
|---|---|---|
| 24–76 | `GNS_ABI`, `extractSubgraphId` | — |
| 78–85 | `apiFetch` (credentialed JSON fetch, local to this file) | — |
| 87–124 | `CopyButton`, `CodeBlock` | — |
| 125–150 | `ConnectGate` | wagmi `useAccount` |
| 151–197 | `useStudioSession` | `/api/studio/auth` ×3, `useSignMessage`, raw `fetch` in `useEffect` |
| 198–242 | `SubgraphCard` | `StudioSubgraph` |
| 243–342 | `RegisterModal` | `POST /api/studio/subgraphs` |
| 343–624 | `PublishWizard` | `POST /api/studio/metadata` → `GNS.publishNewSubgraph`/`publishNewVersion` → receipt → `extractSubgraphId` |
| 625–697 | `DeployKeyPanel` | `GET`/`POST /api/studio/deploy-key` |
| 698–1027 | `PostBountyWizard` | `GRT.allowance` → `GRT.approve` → receipt → `BountyBoard.post` → receipt → `extractBountyId` → `POST /api/studio/bounties` |
| 1028–1364 | `ClaimModal` | `POST /api/indexer/present-poi`, `SubgraphService.getAllocation` (10s poll), `BountyBoard.getBounty`, `BountyBoard.claim` → receipt → `PATCH /api/studio/bounties/:id` |
| 1365–1728 | `SubgraphDetailModal` | `GET /api/studio/bounties?deployment=`, `PATCH`/`DELETE /api/studio/subgraphs/:id`, opens `PublishWizard`, `PostBountyWizard`, `SubgraphLifecyclePanel` |
| 1729–1850 | `MySubgraphsTab` | `useQuery(['studio-subgraphs'])`, opens `RegisterModal`, `SubgraphDetailModal` |
| 1851–2180 | `BountyBoardTab` | `useQuery(['studio-bounties-public'])`, `BountyBoard.cancel`, `BountyBoard.refundExpired`, opens `ClaimModal`; `alert()`/`confirm()` for errors and confirmation |
| 2181–2275 | `StudioPage` | `useStudioSession`, `useState` tab switch |

As a graph:

```mermaid
graph TD
  P[StudioPage] --> S[useStudioSession]
  P --> G[ConnectGate]
  P --> T1[MySubgraphsTab]
  P --> T2[BountyBoardTab]
  T1 --> R[RegisterModal]
  T1 --> C[SubgraphCard]
  T1 --> D[SubgraphDetailModal]
  D --> PW[PublishWizard]
  D --> BW[PostBountyWizard]
  D --> L[SubgraphLifecyclePanel]
  D --> K[DeployKeyPanel]
  T2 --> CM[ClaimModal]

  S -.-> A1[/api/studio/auth]
  R -.-> A2[/api/studio/subgraphs]
  D -.-> A2
  T1 -.-> A2
  PW -.-> A3[/api/studio/metadata]
  K -.-> A4[/api/studio/deploy-key]
  BW -.-> A5[/api/studio/bounties]
  D -.-> A5
  T2 -.-> A5
  CM -.-> A5
  CM -.-> A6[/api/indexer/present-poi]

  PW ==> GNS[GNS]
  BW ==> GRT[GRT] & BB[BountyBoard]
  CM ==> BB & SS[SubgraphService]
  T2 ==> BB
```

Dotted edges are HTTP, thick edges are contract calls. Six HTTP surfaces, four contracts. That's the whole coupling, and it is not complicated — it just all lives in one scroll.

## The problems, specifically

**The same transaction ceremony, thirteen times.** Every contract write in the codebase is:

```ts
const [txHash, setTxHash] = useState<`0x${string}`>();
const [step, setStep] = useState<Step>('idle');
const { writeContract, isPending } = useWriteContract({
  mutation: {
    onSuccess: (hash) => { setTxHash(hash); setStep('mining'); },
    onError: (e) => { setErrMsg(explainWriteError(e)); setStep('error'); },
  },
});
const { isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: txHash });
useEffect(() => {
  if (!isSuccess) return;
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setStep('done');
  /* side effect: parse logs, PATCH the DB, refetch allowance */
}, [isSuccess, receipt]);
```

Seven of the thirteen are in this file, four in `curate/page.tsx`, two in `SubgraphLifecyclePanel`. Each carries its own `eslint-disable` for the set-state-in-effect, its own `explainWriteError`, and its own slightly different notion of what the steps are called. `PostBountyWizard` runs two of them chained (approve → post) with the chaining done by a second effect.

**Data access is three different things.** Two `useQuery` calls with proper keys (`MySubgraphsTab`, `BountyBoardTab`). Then `apiFetch` invoked imperatively inside handlers with success threaded back up through `onCreated`/`onPublished` callbacks and manual `queryClient.invalidateQueries`. Then, in `useStudioSession`, a raw `fetch` in a `useEffect` with no cache — one of the twelve such files left in the repo. `SubgraphDetailModal` fetches bounties for a deployment with a bare `fetch` and its own `useEffect` even though the same data is in the `['studio-bounties-public']` cache one component over.

**Types cross the wrong boundary.** `StudioSubgraph` and `SyncBounty` are imported from `@/lib/studio/db`. It is a type-only import so the bundler doesn't care, but the *meaning* is "the wire type is whatever the Postgres row type is." When these nine routes move to kittiwake, `db.ts` goes with them and the client is left importing types from a file that no longer exists. The wire type needs a home on the client side that is not the server's schema.

**Five modal shells, hand-rolled.** `fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4` appears five times with five copies of the close button SVG, five `canClose` guards, and no focus trap or Escape handling in any of them.

**The tab is not a URL.** `tab` is `useState`. `/dock` can't deep-link to the bounty board, which is the page the indexer guide in the blog wants to send people to. Refresh loses it, back button doesn't restore it.

**`alert()` and `confirm()`.** `BountyBoardTab` uses the browser dialogs for cancel/refund confirmation and for contract-write errors. Inside the Capacitor iOS shell those render as native alerts titled with the origin, which looks like a phishing prompt.

**No component tests.** `lib/studio/auth`, `db`, `bounty-reconcile` are tested. The eleven components are not, and at 2,275 lines with wagmi hooks threaded through, they can't be without a mocking harness nobody wants to build for a single file.

## The proposal

### Target layout

```
src/features/dock/
  types.ts          StudioSubgraph, SyncBounty, step unions — the wire types, owned here
  api.ts            studioFetch + query keys + every hook that talks HTTP
  session.ts        useStudioSession, on react-query
  abi.ts            GNS_ABI (BountyBoard, GRT, SubgraphService stay in lib/bountyBoard)
  chain.ts          useGnsPublish, useBountyPost, useBountyClaim, useBountyCancel, useBountyRefund
  components/
    ConnectGate.tsx
    SignInPrompt.tsx
    DockHeader.tsx
    SubgraphCard.tsx
    RegisterModal.tsx
    SubgraphDetailModal.tsx
    PublishWizard.tsx
    DeployKeyPanel.tsx
    PostBountyWizard.tsx
    ClaimModal.tsx
    BountyRow.tsx
    BountyBoard.tsx
    HowToClaim.tsx
  __tests__/

src/hooks/useContractStep.ts      shared — used by dock, curate, SubgraphLifecyclePanel
src/components/ui/Modal.tsx        shared
src/components/ui/CopyButton.tsx   shared (already re-implemented in three places)
src/components/ui/CodeBlock.tsx    shared

src/app/dock/
  layout.tsx        DockHeader + ConnectGate + SignInPrompt + tab nav as <Link>s
  page.tsx          redirect('/dock/subgraphs')
  subgraphs/page.tsx
  bounties/page.tsx
```

`features/` is a new top-level directory. Nothing else in the repo uses it yet, and that is deliberate: the Dock is the pilot. If it works, `qos`, `subgraphs/[hash]`, and `indexers/[address]` follow the same shape. If it doesn't, it's one directory to fold back.

### `api.ts` — the endpoint inventory

Every HTTP call becomes one hook, one query key, one type. This is the part that matters for kittiwake:

| Hook | Method + path | Type |
|---|---|---|
| `useSession` | `GET /api/studio/auth` | `{ address: string \| null }` |
| `useSignIn` | `POST /api/studio/auth` | `{ address, message, signature } → { address }` |
| `useSignOut` | `DELETE /api/studio/auth` | — |
| `useMySubgraphs` | `GET /api/studio/subgraphs` | `{ subgraphs: StudioSubgraph[] }` |
| `useCreateSubgraph` | `POST /api/studio/subgraphs` | `{ slug, displayName } → { subgraph }` |
| `useUpdateSubgraph` | `PATCH /api/studio/subgraphs/:id` | partial `StudioSubgraph` |
| `useDeleteSubgraph` | `DELETE /api/studio/subgraphs/:id` | — |
| `useDeployKey` / `useRotateDeployKey` | `GET` / `POST /api/studio/deploy-key` | `{ key }` |
| `useUploadMetadata` | `POST /api/studio/metadata` | `{ displayName, description, versionLabel? } → { subgraphMetaBytes32, versionMetaBytes32 }` |
| `useBounties` | `GET /api/studio/bounties[?deployment=]` | `{ bounties: SyncBounty[] }` |
| `useRecordBounty` | `POST /api/studio/bounties` | post-tx bookkeeping |
| `useMarkBountyClaimed` | `PATCH /api/studio/bounties/:id` | `{ action: 'claim' }` |
| `usePresentPoi` | `POST /api/indexer/present-poi` | `{ deploymentId, allocationId, agentUrl, agentToken? }` |

Thirteen hooks, nine routes — the nine in the migration doc's "the Dock" block, plus `present-poi` which is in the long tail. Mutations invalidate by key; the `onCreated`/`onPublished` callback threading goes away. `SubgraphDetailModal` reads bounties for a deployment from `useBounties({ deployment })` and shares the cache with the board.

`types.ts` is hand-written for now, copied from `lib/studio/db.ts`. When kittiwake publishes an OpenAPI or a `utoipa` schema for these routes, it becomes generated and the hand-written copy is deleted. That's the point of giving it its own file: it has one job, and the job changes owner once.

### `useContractStep` — one ceremony, written once

```ts
export function useContractStep<TStep extends string>(opts: {
  onMined?: (receipt: TransactionReceipt) => void | Promise<void>;
}) {
  // wraps useWriteContract + useWaitForTransactionReceipt
  // returns { write, txHash, status: 'idle' | 'wallet' | 'mining' | 'done' | 'error', error, reset }
}
```

Log parsing (`extractSubgraphId`, `extractBountyId`) and the post-tx HTTP bookkeeping go in `onMined`. The `eslint-disable` for set-state-in-effect lives in exactly one file. `chain.ts` builds the five Dock-specific hooks on top:

- `useGnsPublish(sg)` — picks `publishNewSubgraph` vs `publishNewVersion`, parses the subgraph id from the receipt
- `useBountyPost()` — the approve→post chain, with allowance read; exposes `status: 'approve' | 'post' | ...` so the wizard just renders it
- `useBountyClaim(bounty)` — includes the allocation poll and the `poiReady` derivation that currently sits in `ClaimModal`
- `useBountyCancel`, `useBountyRefund`

`curate/page.tsx` and `SubgraphLifecyclePanel` migrate to `useContractStep` in the same PR series. That is not scope creep; it is the only way to know the hook is general rather than Dock-shaped.

### `Modal`

One component. Backdrop, panel, title, close button, `canClose` prop, Escape to close when allowed, focus trap, `role="dialog"` and `aria-modal`. The five wizards become children. `TransactionStatus` already exists in `ui/` and should be the step indicator inside every wizard — `PublishWizard` and `ClaimModal` currently draw their own.

### Routing

`/dock/subgraphs` and `/dock/bounties` as real routes under a shared `layout.tsx`. `/dock` redirects. The blog's indexer guide links to `/dock/bounties`. Tab state is the URL.

### Order of work

Each step is a PR that leaves `pnpm build && pnpm test` green and the Dock behaving identically.

1. **Extract shared pieces** — `Modal`, `CopyButton`, `CodeBlock`, `useContractStep`. Adopt `useContractStep` in `curate` and `SubgraphLifecyclePanel` first, where the tests are easier, then in the Dock's seven sites.
2. **`types.ts` + `api.ts` + `session.ts`** — move every HTTP call behind a hook. Delete the local `apiFetch`. Delete the raw `fetch` in `useStudioSession`. Delete the callback threading.
3. **`chain.ts`** — the five contract hooks. `ClaimModal` and `PostBountyWizard` shrink to rendering.
4. **Cut the components into files.** Mechanical at this point; each file should be under 300 lines and import from `api`, `chain`, and `ui` only.
5. **Routes.** `layout.tsx`, two pages, redirect. Replace `alert`/`confirm` with `Modal`.
6. **Tests.** `api.ts` hooks against `msw`. `chain.ts` against a mocked wagmi config (wagmi ships `mock` connector for this). Component tests for the wizards' step rendering with the hooks stubbed — which is now possible because the hooks are the seam.

Steps 1–3 are the ones that make the kittiwake port cheaper. Steps 4–6 are the ones that make the next feature cheaper. If time is short, stop after 3 and the file is still 2,000 lines but every wire call is named.

## What this buys the migration

When the Dock block moves to kittiwake, the FE change is: `studioFetch` in `api.ts` gets a base URL, and `types.ts` gets replaced with a generated file. Every component is untouched because none of them know what `/api/studio/subgraphs` is — they know `useMySubgraphs()`. Contract calls don't move at all.

The `tap-provision` and `reconcile-bounties` custody question (kittiwake#11, #16) stays exactly as open as it is now. Nothing in this RFC touches a server route. It only makes the client stop caring which server it's talking to.

## Open questions (push back here)

- **`features/` vs keeping everything in `components/`.** I lean `features/` because the Dock's components have no reuse outside the Dock and putting them in `components/studio/` next to `SubgraphLifecyclePanel` just makes a second flat pile. But it's a new convention and the repo has been fine without one.
- **Should `types.ts` wait for kittiwake's schema?** Hand-writing it now means writing it twice. Waiting means the split blocks on the backend. I'd rather write it twice; the second write is a codegen invocation.
- **`useContractStep` generality.** Thirteen sites is enough evidence for the shape, but `PostBountyWizard`'s two-tx chain and `ClaimModal`'s poll-gated enable are the two that might not fit cleanly. If either needs an escape hatch, the escape hatch should be "compose two `useContractStep`s", not "add options".
- **Does `/dock/bounties` need the session?** Reading the board is public (`GET /api/studio/bounties` has no auth). Only claim/cancel/refund need a signature. The layout currently gates the whole page behind sign-in; the split is a chance to gate the actions instead and let indexers browse without a wallet. That's a product decision, not a refactor decision, so flagging it rather than doing it.

## Ask

Read the target layout and the `api.ts` table, and say whether the nine-route inventory matches what kittiwake's Dock block is planning to expose. If the hook table and the Rust handlers agree on shape before either side is written, the port is a base-URL change. If they don't, better to find out now than at 2,275 lines.
