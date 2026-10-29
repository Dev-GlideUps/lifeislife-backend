# PK Battle Module — How It Works

> A PK ("player kill") battle is a timed gifting contest between two hosts who
> are each running a normal video live. Viewers in either room send gifts;
> whichever host collects more coins before the timer runs out wins. This doc
> covers the server side only: state, socket events, money flow, termination,
> and known gaps. Read [project-overview.md](project-overview.md) first for the
> general live-streaming model.

---

## 1. Where the code lives

| Concern | File | Notes |
|---|---|---|
| Socket handlers `pkRequest`, `pkAnswer`, `pkGift`, `pkEnd` | `socket.js` (search `socket.on("pk`) | The whole battle lifecycle |
| PK rank refresh when a viewer joins | `socket.js` → `countLiveJoin` | Emits `pkRankUpdate` + `updateHostGifterStats` |
| Comment mirroring to both rooms | `socket.js` → `broadcastLiveComment` | Keyed on `isBattleActive` |
| Single-live payload incl. PK fields | `socket.js` → `fetchSingleLiveUser` | Projection of `pkConfig` |
| Live state fields | `models/liveStreamer.model.js` | `isPkMode`, `pkId`, `pkEndTime`, `pkConfig` |
| Session record | `models/liveStreamerHistory.model.js` | `isPkMode`, `pkId`, `pkEndTime` |
| Per-session leaderboard | `models/topGifter.model.js` | One doc per `liveHistoryId` |
| Wallet ledger rows | `models/history.model.js` | `liveType: 3` marks PK |
| Battle length | `models/setting.model.js` → `pkEndTime` (seconds) | Admin edits via `modifySetting` |
| Opponent discovery (REST) | `controllers/client/liveStreamer.controller.js` → `getAvailableLiveUsers`, `fetchLiveStreamers` (`liveType=pk`) | |
| Admin force-end | `controllers/admin/liveStreamer.controller.js` → `performAdminEndLiveSession` | Used by `terminateLiveStream` |
| Demo data | `models/fakeLiveStreamer.model.js` | `streamType: 3` + `pkThumbnails`/`pkStreamSources` |
| Dashboard count | `controllers/admin/dashboard.controller.js` | Counts `isPkMode: true` |

Everything is driven by the client over Socket.IO. There is **no REST endpoint
and no server-side timer** for PK; the server records what the apps tell it
and fans the result out to both rooms.

---

## 2. Data model

### `LiveStreamer` (one per live host)

```
isPkMode   : Boolean          // true while a battle is running
pkId       : String|null      // shared random id (same on both hosts' docs)
pkEndTime  : String|null      // absolute Date the battle ends (stored from pkAnswer)
pkConfig   : {
  host1Id, host1Name, host1Image, host1UniqueId, host1ObjId, host1LiveId,
  host1Channel, host1AgoraUID, host1TencentUserId, host1TencentRoomId,
  host2Id, host2Name, host2userName, host2Image, host2UniqueId, host2ObjId,
  host2LiveId, host2Channel, host2AgoraUID, host2TencentUserId, host2TencentRoomId,
  localRank, localGiftCount,      // coins / gift count received by THIS host
  remoteRank, remoteGiftCount,    // coins / gift count received by the OPPONENT
  isWinner,                       // 0 draw, 1 lost, 2 won (set only at pkEnd)
  host1Details { ...user snapshot, coin, wealthLevelImage, avtarFrame* },
  host2Details { ...same shape }
}
```

**Perspective rule (important):** `pkConfig` is written *mirrored* on the two
documents. On each host's own `LiveStreamer`, **`host1*` is always that host
and `host2*` is always the opponent**, and `localRank` is that host's score.
So the "same" battle is stored twice with the roles swapped. Any code that
reads `pkConfig` must remember which document it is looking at.

Key naming inside `pkConfig`:

| Field | Meaning |
|---|---|
| `hostNObjId` | The opponent's / own `LiveStreamer._id` as a string. Also the **socket room id** of that live. |
| `hostNLiveId` | The matching `LiveStreamerHistory._id`. Used to look up `TopGifter`. |
| `hostNChannel`, `hostNAgoraUID` | Agora relay credentials for the other room. |
| `hostNTencentUserId`, `hostNTencentRoomId` | Tencent cross-room equivalents (additive, see §8). |

### `LiveStreamerHistory`

Gets `isPkMode: true`, `pkId`, `pkEndTime` on accept. It is never reset, so
history rows keep the PK flag after the battle; the dashboard and the admin
live-history screens rely on it.

### `TopGifter`

One document per `liveHistoryId` with a `gifters[]` array of
`{ userId, totalCoins }`. Both `pkGift` and normal `giftToLiveStream` upsert
into it. During a battle the server reads **both** hosts' documents to emit the
two top-5 lists (`updateHostGifterStats`), and deletes both at `pkEnd`.

### `History` (wallet ledger)

Rows written during a PK carry `liveType: 3`:

| `type` | When | Fields of interest |
|---|---|---|
| 6 `LIVE_GIFT` | every `pkGift` | `senderCoin`, `receiverCoin`, `adminCoin`, `coinType: 2` (silver), `hostAgencyId` |
| 9 `AGENCY_EARN_COMMISSION` | receiver is an agency host | `baseType: 6`, `baseCoins`, `commissionRate` |
| 15 `LUCKY_GIFT_WIN_BY_SENDER` | lucky-category gift pays out | `luckyGiftMultiplier`, `luckyGiftEventId` |

### `Setting.pkEndTime`

Battle length in seconds. Model default 60, `setting.example.js` uses 300,
`pkAnswer` falls back to 300 when unset.

---

## 3. Lifecycle

```
 Host A (live, type 1)                SERVER                         Host B (live, type 1)
 ─────────────────────                ──────                         ─────────────────────
 GET /liveStreamer/getAvailableLiveUsers ─► list of hosts with isPkMode:false
 emit pkRequest {host1Id:A, host2Id:B} ─►  forward ───────────────► on pkRequestReceived
                                           + FCM "PK Challenge"
                                                                      emit pkAnswer {HOST_1_*, HOST_2_*, isAccept}
 on pkAnswer {data, response: B's live} ◄── write pkConfig on BOTH   ◄─ on pkAnswer {data, response: A's live}
   (room A)                                 docs, pkId, pkEndTime       (room B)
                                            + FCM "PK Accepted"
 ── battle running (client countdown from `duration`) ────────────────────────────────────
 viewer emits pkGift ─────────────────►  debit sender, credit host,
                                         $inc local/remote rank,
                                         emit pkGift to BOTH rooms,
                                         topGiftersUpdate, liveRoomCoinUpdate
 viewer joins (countLiveJoin) ────────►  emit pkRankUpdate + updateHostGifterStats
 comment with isBattleActive ─────────►  broadcastLiveComment to BOTH rooms
 ── end ───────────────────────────────────────────────────────────────────────────────────
 timer hits 0 / instant cut / host quits
 emit pkEnd {userId, liveHistoryId, isManualMode} ─► compute isWinner,
                                           emit pkEnd {data, winner} to BOTH rooms,
                                           reset pkConfig on every doc with that pkId,
                                           delete both TopGifter docs
```

### 3.1 Preconditions

Both hosts must be in a **normal video live** (`liveType: 1`, `isAudio:
false`) and not already in a battle. `pkAnswer` enforces this with
`liveType: { $nin: [2, 3, 4] }` on both `findOneAndUpdate` calls; if either
match fails it emits `singleLiveUserResponse` with an error string to the
answering socket and aborts.

### 3.2 Discovery

- `GET /api/client/liveStreamer/getAvailableLiveUsers` returns live hosts
  with `liveType: 1, isAudio: false, isPkMode: false`, excluding the caller,
  with their `channel`, `token`, `liveHistoryId` and profile fields. The app
  uses this to build the "invite to PK" list.
- `GET /api/client/liveStreamer/fetchLiveStreamers?liveType=pk` lists rooms
  **already in battle** (`isPkMode: true`) for viewers. Each row includes the
  opponent's `host2*` fields and both ranks so the explore grid can draw the
  split-screen card. Fake streamers with `streamType: 3` are merged in with
  `pkThumbnails`/`pkStreamSources`.

### 3.3 `pkRequest` (challenge, or request to cut short)

Input (JSON string). Field names are client-defined and passed through
untouched; the server reads `host1Id`/`host2Id` (or `HOST_1_ID`/`HOST_2_ID`),
`host1Name`, `host1Image` and the flag `InstantCutRequestByHost`.

What the server does:

1. Forwards the raw payload to the challenged host's personal room
   `globalRoom:<host2Id>` as **`pkRequestReceived`**.
2. If neither user has blocked the other and the receiver allows push, sends
   an FCM message: type `PK_REQUEST` ("PK Challenge from X") or, when
   `InstantCutRequestByHost` is set, type `PK_INSTANT_CUT_REQUEST` ("X wants
   to end the PK battle now").

Nothing is persisted. The same event doubles as the "please end early"
request; the recipient app answers that by emitting `pkEnd`.

### 3.4 `pkAnswer` (accept / decline)

Input keys (all required for accept): `HOST_1_ID`, `HOST_2_ID`, and for each
host `_NAME`, `_USERNAME`, `_IMAGE`, `_UNIQUEID`, `_LIVEUSER_OBJ_ID`
(`LiveStreamer._id`), `_LIVEID` (`LiveStreamerHistory._id`), `_CHANNEL`,
`_AGORA_ID`, `_WEALTHLEVEL_IMAGE`, `_AVTAR_FRAME_TYPE`, `_AVTAR_FRAME`; plus
`isAccept: boolean`.

On **accept**:

1. Loads both `User`s and both `LiveStreamer`s (for Tencent ids).
2. Generates `pkId` (random 8–9 digit number) and
   `endTime = now + settingJSON.pkEndTime` seconds; `duration` is the seconds
   until then.
3. Writes the mirrored `pkConfig` to both `LiveStreamer` docs in parallel
   (`isPkMode: true`, `pkId`, `pkEndTime`, self as `host1*`, opponent as
   `host2*`, user snapshots into `host1Details`/`host2Details`).
4. Aggregates each live doc with `duration` added and emits **`pkAnswer`** to
   each live **room** (`io.in(<LIVEUSER_OBJ_ID>)`), so every viewer already in
   either room receives it. Each room gets `{ data, response }` where
   `response` is the **opponent's** live document (userId, token, channel,
   pkConfig, liveHistoryId, view, tencentRoomId/tencentUserId and a `tencent`
   sub-object).
5. Stamps `isPkMode`, `pkId`, `pkEndTime` on both `LiveStreamerHistory` docs.
6. Sends FCM `PK_ACCEPTED` to host 1 (the challenger).

On **decline**: emits `pkAnswer` with `response: {}` to both rooms and sends
FCM `PK_REJECTED` to whichever host did not answer (the answerer is
identified from the socket's own `globalRoom` user id).

The client starts its countdown from `duration`; the server never fires a
timer.

### 3.5 `pkGift` (scoring + money)

Input: `senderUserId`, `receiverUserId` (must be one of the two hosts),
`giftId`, `giftCategoryId`, `giftCount`.

Steps, in order:

1. Validate category, gift, sender, receiver; check `senderUser.coin >=
   gift.coin * giftCount`; find the receiver's `LiveStreamer` with
   `isPkMode: true` (otherwise reply `"Something Went Wrong!"` to the sender's
   personal room on event `pkGift`).
2. If `totalCoin > settingJSON.coinBroadcastThreshold`, emit
   `proHighValueGift` to **all** sockets.
3. Split: `adminCoin = round(totalCoin * adminRate / 100)`,
   `receiverCoin = totalCoin - adminCoin`.
4. Update ranks with `$inc`: on the receiver's doc `localRank += totalCoin`,
   `localGiftCount += giftCount`, `host1Details.coin += totalCoin`; on the
   opponent's doc the same amounts go to `remoteRank` / `remoteGiftCount` /
   `host2Details.coin`. Ranks are therefore **gross coins before the admin
   cut**.
5. Re-aggregate both docs with the remaining `duration` and emit **`pkGift`**
   `{ giftData, response }` to both rooms (each room again receives the
   opponent's document). Then emit **`topGiftersUpdate`**
   `{ liveHistoryId, topGifters[≤5] }` to both rooms, computed from the
   **receiver's** `TopGifter` only.
6. Lucky gifts (category name `lucky`): admin tax and receiver share come from
   `luckyGiftAdminTaxPercent` / `luckyGiftReceiverSharePercent`; the remainder
   is added to the global `luckyGiftTargetCoin` pool; if the roll
   (`getLuckyGiftValue`) fits inside the pool the sender wins it back
   (`luckyGiftWin` event, `History` type 15, pool reset to 0).
7. Atomically debit the sender (`coin`, `spentCoins`, guarded by
   `coin >= totalCoin`), credit the receiver's **silver** balance
   (`silverCoin`, `receivedCoins`, `receivedGifts`, plus `earnedHostCoins` if
   they are an agency host), bump `LiveStreamer.earnedCoins` and
   `LiveStreamerHistory.receivedGifts/earnedCoins`, write `History` type 6
   with `liveType: 3`, and emit `liveRoomCoinUpdate` to the receiver's room.
8. If the receiver is a host under an active agency, write `History` type 9
   and `$inc` the agency's `hostCoins`, `totalEarnings`,
   `netAvailableEarnings` (`util/agencyEarnings.js`).

Note what is **not** done here that `giftToLiveStream` does: no
`updateHostLevel`, no host-target progress, and no `isHost` guard on the
silver credit (any receiver gets silver).

### 3.6 Keeping late joiners in sync

- **`countLiveJoin`** (viewer enters a room): if the room is in PK, the server
  aggregates the live doc with the remaining `duration` and emits
  **`pkRankUpdate`** (full `LiveStreamer` document) to the room, followed by
  **`updateHostGifterStats`** `{ topGiftersHost1, topGiftersHost2 }` built from
  the two `TopGifter` docs (`liveHistoryId` and `pkConfig.host2LiveId`).
- **`fetchSingleLiveUser`** and the REST list/detail endpoints project the
  same `host2*`, `localRank`, `remoteRank` fields so a cold-start client can
  render the battle without waiting for the next gift.
- **`broadcastLiveComment`** with `isBattleActive: true` looks up the live by
  `liveHistoryId` and emits the comment to **both** `host1ObjId` and
  `host2ObjId` rooms, so chat is shared across the two audiences.

### 3.7 `pkEnd`

Input: `userId` (a host), `liveHistoryId` (that host's), optional
`isManualMode`, `pkEndUserId`. The client sends it when its countdown reaches
zero, when a host accepts an instant-cut request, or when a host quits the
battle/live.

Steps:

1. Load the `User`, the host's `LiveStreamer` with `isPkMode: true, isAudio:
   false`, and the `LiveStreamerHistory`. Silently return if any is missing.
2. **Decide the winner** from the *caller's* document:
   `localRank > remoteRank` → caller wins (`isWinner = 2`), opponent gets 1;
   `<` → reversed; equal → both stay 0 (draw). Written to both docs.
3. Aggregate both docs and emit **`pkEnd`** to each room:
   `{ isManualMode, pkEndUserId, data: <opponent's doc>, winner: <host
   details of the winner> }`. On a draw `winner` falls back to
   `host2Details`.
4. If `isManualMode` is true, the caller's **whole live is ended** as part of
   the same handler: `LiveStreamerHistory.endTime/duration` are set, the
   `User` live flags are cleared, the `LiveStreamer` and its
   `LiveStreamerView`s are deleted, and sockets are made to leave the
   `liveHistoryId` room.
5. Reset PK state on **every `LiveStreamer` with the same `pkId`**
   (`isPkMode: false`, `pkId/pkEndTime: null`, blank `pkConfig` fields and
   details) and delete the `TopGifter` docs for both `hostNLiveId`s.

### 3.8 Admin termination

`PATCH /api/admin/liveStreamer/terminateLiveStream` →
`performAdminEndLiveSession`. If the target live has `isPkMode`, it runs the
same winner calculation, emits `pkEnd` with `isManualMode: true` to both
rooms, then emits `endLiveStream` to the terminated room, resets PK state
across the `pkId`, and finally ends the live like any other video session.

---

## 4. Socket event reference

Inbound (client → server), all payloads are **JSON strings**:

| Event | Sender | Key fields |
|---|---|---|
| `pkRequest` | Host | `host1Id`, `host2Id`, `host1Name`, `host1Image`, `InstantCutRequestByHost?` |
| `pkAnswer` | Challenged host | `HOST_1_*`, `HOST_2_*` (see §3.4), `isAccept` |
| `pkGift` | Viewer | `senderUserId`, `receiverUserId`, `giftId`, `giftCategoryId`, `giftCount` |
| `pkEnd` | Either host | `userId`, `liveHistoryId`, `isManualMode?`, `pkEndUserId?` |
| `countLiveJoin` | Viewer | `userId`, `liveUserObjId`, `liveHistoryId`, … (triggers rank refresh) |
| `broadcastLiveComment` | Anyone | `liveUserObjId`, `liveHistoryId`, `isBattleActive` |

Outbound (server → client):

| Event | Target | Payload |
|---|---|---|
| `pkRequestReceived` | `globalRoom:<host2Id>` | raw `pkRequest` payload |
| `pkAnswer` | both live rooms | `{ data, response }` (`response` = opponent's live doc, `{}` on decline) or an error string |
| `pkGift` | both live rooms, or sender's personal room on error | `{ giftData, response }` or error string |
| `pkRankUpdate` | the joined room | full `LiveStreamer` doc + `duration` |
| `updateHostGifterStats` | the joined room | `{ topGiftersHost1, topGiftersHost2 }` |
| `topGiftersUpdate` | both live rooms | `{ liveHistoryId, topGifters }` |
| `liveRoomCoinUpdate` | receiver's room | `earnedCoins` number |
| `proHighValueGift` | everyone | raw gift payload |
| `luckyGiftWin` | sender's personal room | coins won |
| `pkEnd` | both live rooms | `{ isManualMode, pkEndUserId, data, winner }` |
| `singleLiveUserResponse` | answering socket | error string when accept fails |
| `broadcastLiveComment` | both live rooms (when `isBattleActive`) | raw comment payload |

FCM data types: `PK_REQUEST`, `PK_INSTANT_CUT_REQUEST`, `PK_ACCEPTED`,
`PK_REJECTED`.

---

## 5. Money and scoring at a glance

| Quantity | Formula | Where it lands |
|---|---|---|
| Gift cost | `gift.coin × giftCount` | sender `coin -=`, `spentCoins +=` |
| Admin cut | `round(total × adminRate / 100)` | `History.adminCoin` only (no admin wallet) |
| Host credit | `total − adminCut` | receiver `silverCoin`, `receivedCoins`, (`earnedHostCoins` if agency host); `LiveStreamer.earnedCoins`; `LiveStreamerHistory.earnedCoins` |
| Rank | `+= total` (gross) | `pkConfig.localRank` on receiver, `remoteRank` on opponent |
| Agency commission | `round(total × agency.commissionRate / 100)` | `Agency.totalEarnings/netAvailableEarnings`, `History` type 9 |
| Lucky gift | admin tax %, receiver share %, rest → pool; payout if roll ≤ pool | `Setting.luckyGiftTargetCoin`, `History` type 15 |

The winner is purely `localRank` vs `remoteRank` at the moment `pkEnd` is
handled. Nothing is paid out for winning; the battle only affects bragging
rights and the `isWinner` flag that the apps render.

---

## 6. Media: Agora relay vs Tencent cross-room

The server does not touch media. It only hands each side what it needs:

- **Agora (current default):** `pkConfig.host2Channel` + `host2AgoraUID`
  plus the opponent's `token` in the `pkAnswer`/`pkGift` `response` let the
  app relay the other host's stream into its own channel.
- **Tencent (additive, behind `liveSdkProvider`):** `host1/2TencentUserId`
  and `host1/2TencentRoomId` are copied from each `LiveStreamer` on accept.
  The `pkAnswer` response also carries `tencentRoomId`, `tencentUserId` and a
  `tencent: { roomId, odcUserId }` object. The migration spec in
  `tencent-backend-requirements.md` §7 asks for a `host2Tencent` block; the
  current code exposes the same data through the `pkConfig.host2Tencent*`
  fields instead.

Never remove the Agora fields; older app builds read them.

---

## 7. Known gaps and gotchas

These were observed while reading the code; treat them as a backlog, not as
documented behaviour.

1. **No server-side timer.** If neither client emits `pkEnd`, both
   `LiveStreamer` docs stay in `isPkMode: true` forever and the hosts can
   never be challenged again (`getAvailableLiveUsers` filters them out).
2. **Host disconnect during PK is not cleaned up.** In the `disconnect`
   handler the video grace-period branch is skipped for `isPkMode` hosts and
   the audio branch does not apply, so the `LiveStreamer` document survives
   while the `User` is reset to `isLive: false`. The partner also keeps its
   PK state.
3. **`endLiveStream` ignores PK.** A host that ends their live through the
   normal event (rather than `pkEnd` with `isManualMode`) leaves the
   opponent's doc with `isPkMode: true`. Admin termination handles this; the
   socket path does not.
4. **Reset is incomplete.** The `pkEnd` reset does not clear
   `host1ObjId`, `host2ObjId` or the Tencent fields, and it sets
   `host1Details.isProfilePicBanned/isVerified` twice instead of the
   `host2Details` ones (copy-paste). Stale values are overwritten on the next
   accept, so this is cosmetic today.
5. **Winner is computed from the caller's perspective only.** The two docs are
   updated independently by `$inc`; if the opponent's doc missed an update
   (for example it was not in PK mode when a gift arrived) the ranks can
   disagree and the "loser" could see different numbers.
6. **`pkGift` has no `isHost` guard** for the silver credit and never calls
   `updateHostLevel`, unlike `giftToLiveStream`.
7. **`topGiftersUpdate` uses only the receiver's leaderboard** but is sent to
   both rooms, while `updateHostGifterStats` (on join) sends both lists. The
   client has to merge these two shapes.
8. **No validation that the sender is actually in either room** or that
   `receiverUserId` is one of the two hosts; any user id with `isPkMode: true`
   is accepted.
9. **Field name drift.** `pkRequest` accepts both `host1Id` and `HOST_1_ID`;
   `pkAnswer` only accepts the upper-case form; the `tencent` sub-object in
   `pkAnswer` uses `odcUserId` (typo for `userId`).

---

## 8. Testing a battle by hand

1. Start the server with `isDummyData: true` (default from
   `setting.example.js` when no `Setting` doc exists).
2. Create two users via `POST /api/client/test/login` and note their ids and
   `TEST_TOKEN_…` tokens.
3. Start a video live for each with
   `POST /api/client/liveStreamer/startLiveStream?liveType=1&channel=<x>&agoraUID=<n>`
   (headers `Authorization: Bearer TEST_TOKEN_<id>_x`, `key: <secretKey>`).
   Keep the returned `_id` (LIVEUSER_OBJ_ID) and `liveHistoryId` (LIVEID).
4. Open two Socket.IO clients with `?globalRoom=globalRoom:<userId>` and
   join each host to its own live room via `countLiveJoin`.
5. From host A emit `pkRequest`; from host B emit `pkAnswer` with
   `isAccept: true` and all `HOST_*` fields. Both sockets should receive
   `pkAnswer` with the opponent's document and a `duration`.
6. From a third client emit `pkGift` to either host; watch `pkGift`,
   `topGiftersUpdate`, `liveRoomCoinUpdate`, and verify the `History` row
   (`type: 6, liveType: 3`) and the `localRank`/`remoteRank` values.
7. Emit `pkEnd` from either host; both rooms receive `pkEnd` with `winner`,
   and both `LiveStreamer` docs return to `isPkMode: false`.

`GET /api/client/test/livestreamers` is a quick way to inspect live documents
without an admin token.
