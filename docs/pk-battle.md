# PK Battle Module — How It Works

> A PK ("player kill") battle is a gifting contest between two hosts who are
> each running a normal video live. Since the lifecycle rework the battle is a
> **session**: the hosts accept an invitation, land in a shared **lobby**, and
> play any number of timed **rounds** without ever being disconnected. Viewers
> in either room send gifts; whichever host collects more coins before the
> round timer runs out wins that round. This doc covers the server side only.
> Read [project-overview.md](project-overview.md) first for the general
> live-streaming model.

---

## 1. Where the code lives

| Concern | File | Notes |
|---|---|---|
| Session / round lifecycle, reset, server timer, startup reconcile | `util/pkSession.js` | Single source of truth; used by sockets, admin and the timer |
| Host availability for invitations | `util/pkAvailability.js` | Shared by search, recent opponents and the `pkRequest` guard |
| Socket handlers (`pkRequest`, `pkCancelRequest`, `pkAnswer`, `pkStartRequest`, `pkStartAnswer`, `pkEndRound`, `pkEndSession`, `pkGift`, `pkEnd`) | `socket.js` (search `socket.on("pk`) | Thin wrappers around `pkSession` |
| PK state refresh when a viewer joins | `socket.js` → `countLiveJoin` | Emits `pkRankUpdate` + `updateHostGifterStats` |
| Comment mirroring to both rooms | `socket.js` → `broadcastLiveComment` | Keyed on the client flag `isBattleActive` |
| Single-live payload incl. PK fields | `socket.js` → `fetchSingleLiveUser` | Projection of `pkConfig` + `pkStatus`, `pkRound`, wins |
| Live state fields | `models/liveStreamer.model.js` | `isPkMode`, `pkStatus`, `pkRound`, `pkId`, `pkEndTime`, `pkStartRequestedBy`, `pkConfig` |
| Session record | `models/liveStreamerHistory.model.js` | `isPkMode`, `pkId`, `pkEndTime`, `pkRoundsPlayed`, `pkRoundsWon` |
| Recent opponents (rematch) | `models/pkOpponent.model.js` | One doc per direction of a pair, 30-day TTL |
| Per-session leaderboard | `models/topGifter.model.js` | One doc per `liveHistoryId`; deleted at **session** end only |
| Wallet ledger rows | `models/history.model.js` | `liveType: 3` marks gifts sent while in a PK session |
| Round length | `models/setting.model.js` → `pkEndTime` (seconds) | Admin edits via `modifySetting`; read at every round start |
| Host search / recent opponents / discovery (REST) | `controllers/client/liveStreamer.controller.js` → `searchPkHost`, `recentPkOpponents`, `getAvailableLiveUsers`, `fetchLiveStreamers` (`liveType=pk`) | |
| Admin force-end | `controllers/admin/liveStreamer.controller.js` → `performAdminEndLiveSession` | Calls `endPkSession` |
| Boot hook | `index.js` → `startServer` | `reconcileOnStartup()` + `startSweep()` after `require("./socket")` |
| Demo data | `models/fakeLiveStreamer.model.js` | `streamType: 3` + `pkThumbnails`/`pkStreamSources` |
| Dashboard count | `controllers/admin/dashboard.controller.js` | Counts sessions (`isPkMode: true`) |

---

## 2. Data model

### `LiveStreamer` (one per live host)

```
isPkMode            : Boolean   // true for the WHOLE session (lobby and rounds)
pkStatus            : ""|"lobby"|"round"|"ending"
pkRound             : Number    // rounds started in this session
pkId                : String    // shared id (same on both hosts' docs)
pkEndTime           : Date|null // deadline of the current round, null in the lobby
pkStartRequestedBy  : ObjectId|null // host whose "start round" request is pending
pkConfig : {
  host1Id, host1Name, host1Image, host1UniqueId, host1ObjId, host1LiveId,
  host1Channel, host1AgoraUID, host1TencentUserId, host1TencentRoomId,
  host2Id, host2Name, host2userName, host2Image, host2UniqueId, host2ObjId,
  host2LiveId, host2Channel, host2AgoraUID, host2TencentUserId, host2TencentRoomId,
  localRank, localGiftCount,      // coins / gifts received by THIS host in the current round
  remoteRank, remoteGiftCount,    // same for the opponent
  isWinner,                       // 0 draw, 1 lost, 2 won — result of the last finished round
  host1Wins, host2Wins,           // rounds won in this session (this host / opponent)
  host1Details { ...user snapshot, coin, wealthLevelImage, avtarFrame* },
  host2Details { ...same shape }
}
```

**Perspective rule:** `pkConfig` is written *mirrored*. On each host's own
document **`host1*` is always that host and `host2*` is always the opponent**;
`localRank` and `host1Wins` are that host's own numbers.

**Broadcast rule:** every PK event sent to a live room carries that room's
**own** document (`data` / `response`). The app reads `host1*` as "me" and
`host2*` as "them". (The original handlers already worked this way; the
variable names in old code suggested otherwise.)

`localRank`, `remoteRank`, gift counts and `isWinner` are **per round** and are
zeroed when a round starts. `host1Wins`/`host2Wins` survive until the session
ends. `hostNDetails.coin` keeps its original meaning (user coin snapshot at
accept plus every gift received during the session).

### `LiveStreamerHistory`

Gets `isPkMode: true`, `pkId` at session start, `pkEndTime` at each round
start, `pkRoundsPlayed`/`pkRoundsWon` incremented at each round end. Never
reset, so history rows keep the PK flag.

### `PkOpponent`

`{ userId, opponentId, lastBattledAt, battleCount }`, unique per direction,
upserted in both directions when a session is created, TTL 30 days.

### `TopGifter`, `History`, `Setting.pkEndTime`

Unchanged. `TopGifter` docs are deleted at **session** end, never at round end.
`History` rows written by `pkGift` carry `liveType: 3` whether or not the gift
counted toward a round. `Setting.pkEndTime` (seconds, default 60, example
file 300) is read at every round start.

---

## 3. Lifecycle

```
 Host A (video live)                 SERVER (util/pkSession.js)                Host B (video live)
 ──────────────────                  ──────────────────────────                ──────────────────
 GET searchPkHost?uniqueId=B  ─────► availability row (green/gray + reason)
 emit pkRequest {host1Id:A, host2Id:B} ─► guard both hosts available ──────► pkRequestReceived (+FCM PK_REQUEST)
 emit pkCancelRequest (optional) ──► ───────────────────────────────────────► pkRequestCancelled
                                                                              emit pkAnswer {HOST_1_*, HOST_2_*, isAccept}
 ◄── pkAnswer {data, response:own doc}  createPkSession: both docs isPkMode,   pkAnswer ──►
     pkStatus "lobby", duration 0        pkStatus "lobby", pkEndTime null,      (room B)
     (room A)                            PkOpponent upsert, FCM PK_ACCEPTED
 ══ LOBBY: hosts talk, gifts pay out but do not score, no timer ═══════════════════════════════════
 emit pkStartRequest {pkId} ───────► setStartRequest ──────────────────────► pkStartRequested (personal room)
                                                                              emit pkStartAnswer {pkId, isAccept}
 ◄── pkStartRejected (if declined)                                             
 ◄── pkRoundStarted {pkRound, duration} startPkRound: pkStatus "round",       pkRoundStarted ──►
                                        pkEndTime = now + Setting.pkEndTime,
                                        scores zeroed, timer scheduled
 ══ ROUND: pkGift scores ($inc guarded by pkStatus "round" + pkEndTime > now) ═════════════════════
 viewer emits pkGift ─────────────► money + ranks + pkGift {counted:true} + topGiftersUpdate to both
 timer fires / emit pkEndRound ────► endPkRound: round→lobby flip, winner from
                                     each doc's localRank, wins++, history stats
 ◄── pkRoundEnded {winner, scores, wins}                                      pkRoundEnded ──►
 ══ back in LOBBY — repeat rounds as often as wanted ══════════════════════════════════════════════
 emit pkEndSession {pkId} (any time) ► endPkSession: finalise a running round,
                                       pkSessionEnded + legacy pkEnd, reset
 ◄── pkSessionEnded, pkEnd              both docs, delete TopGifter            pkSessionEnded, pkEnd ──►
 both hosts keep streaming solo; nobody is disconnected
```

### 3.1 Preconditions and availability

A host is **available** for PK when they are in a normal video live
(`liveType: 1`, `isAudio: false`) and `isPkMode` is false (not in a lobby or
a round). `util/pkAvailability.js` returns, per user, the
`getAvailableLiveUsers` row plus `uniqueId`, `isOnline`, `isLive`, `pkStatus`,
`isAvailable` and `unavailableReason` ∈ `null | self | blocked | offline |
not_live | in_pk | not_found`. The same helper backs `searchPkHost`,
`recentPkOpponents` and the `pkRequest` guard (which also requires the
*sender* to be available).

`createPkSession` additionally filters both `findOneAndUpdate` calls on
`isPkMode: false`; if only one host could be claimed the partial state is
rolled back and `singleLiveUserResponse` carries an error string.

### 3.2 Discovery (REST, all `validateUserToken` + `key`)

- `GET /api/client/liveStreamer/searchPkHost?uniqueId=` → `{ status, message, data: row }`;
  `status:false, "User not found."` for an unknown id.
- `GET /api/client/liveStreamer/recentPkOpponents?start&limit` → rows for the
  caller's `PkOpponent` entries (most recent first) with `lastBattledAt`,
  `battleCount` and live availability. Used for one-tap rematch.
- `GET /api/client/liveStreamer/getAvailableLiveUsers` → list of available
  hosts (now includes `uniqueId`).
- `GET /api/client/liveStreamer/fetchLiveStreamers?liveType=pk` → rooms in a
  session (`isPkMode: true`) for viewers; rows carry `pkStatus`, `pkRound`,
  `host1Wins`, `host2Wins` plus the `host2*` fields and ranks.

### 3.3 Invitation: `pkRequest`, `pkCancelRequest`, `pkAnswer`

- `pkRequest` (`host1Id`/`host2Id` or `HOST_1_ID`/`HOST_2_ID`): the server
  checks availability of both hosts; on failure the caller's socket gets
  `pkError { event:"pkRequest", message, unavailableReason }`. Otherwise the
  raw payload is forwarded to `globalRoom:<host2Id>` as `pkRequestReceived`
  and an FCM `PK_REQUEST` is sent. `InstantCutRequestByHost` is still
  forwarded unchanged (FCM `PK_INSTANT_CUT_REQUEST`) but is obsolete: rounds
  and sessions now end without consent.
- `pkCancelRequest { host1Id, host2Id }` (challenger only): emits
  `pkRequestCancelled { host1Id, host2Id }` to the invitee's personal room and
  a data-only FCM `PK_REQUEST_CANCELLED`.
- `pkAnswer` (same `HOST_*` keys as before, `isAccept`): on accept
  `createPkSession` writes the mirrored config on both docs with
  `pkStatus:"lobby"`, `pkEndTime:null`, wins 0, stamps both histories, upserts
  `PkOpponent` both ways, emits `pkAnswer { data, response }` to both live
  rooms (`response` = own document, `duration: 0`), sends FCM `PK_ACCEPTED`.
  On decline it emits `pkAnswer` with `response: {}` and FCM `PK_REJECTED`.

### 3.4 Lobby and rounds

- `pkStartRequest { pkId }`: caller must be a host of `pkId` in the lobby.
  Sets `pkStartRequestedBy` on both docs and emits `pkStartRequested { pkId,
  requestedBy, name, image }` to the opponent's personal room. If the opponent
  had already requested, both pressed Start: the round starts immediately.
- `pkStartAnswer { pkId, isAccept }`: requires a pending request from the
  opponent. Reject clears it and emits `pkStartRejected { pkId, rejectedBy }`
  to the requester. Accept calls `startPkRound`.
- `startPkRound`: `updateMany({ pkId, pkStatus:"lobby" })` → `pkStatus:
  "round"`, `pkEndTime = now + Setting.pkEndTime`, `$inc pkRound`, per-round
  scores zeroed; if fewer than two docs flipped the session is ended
  (`partner_missing`). Emits `pkRoundStarted { pkId, pkRound, duration,
  pkEndTime, startedBy, data }` to both rooms and schedules the server timer.
- `pkEndRound { pkId }` (either host, immediate) or the timer → `endPkRound`:
  `updateMany({ pkId, pkStatus:"round" })` → `lobby` (the first caller wins,
  everyone else is a no-op), winner from `A.localRank` vs `B.localRank`,
  `isWinner` written, `host1Wins` on the winner's doc and `host2Wins` on the
  loser's doc incremented (nothing on a draw), history stats, then
  `pkRoundEnded { pkId, pkRound, reason:"manual"|"timer", endedBy, isDraw,
  winnerUserId, winner:<details>, scores:{[userId]:coins}, wins:{[userId]:n},
  data }` to both rooms. Both hosts stay in the same session.
- `pkEndSession { pkId }` (either host, lobby or mid-round) and the legacy
  `pkEnd` → `endPkSession`: flips to `ending` (round docs first, so "was a
  round running" is atomic), finalises that round as `lastRound`, emits
  `pkSessionEnded { pkId, reason, endedBy, wins, lastRound|null, data }` and
  then the legacy `pkEnd { isManualMode, pkEndUserId, data, winner }`, resets
  every doc with that `pkId`, deletes both `TopGifter` docs. **Lives are never
  torn down here.** `endLiveStream` and the admin terminate path call the same
  function first so the partner is released.
- Every new handler answers validation failures with `pkError { event,
  message }` on the caller's socket and identifies the caller by the socket's
  own `globalRoom` user id, not by the payload.

### 3.5 `pkGift` (scoring + money)

Input: `senderUserId`, `receiverUserId` (a host in a session), `giftId`,
`giftCategoryId`, `giftCount`. Money always flows (sender debit, receiver
silver credit, `LiveStreamer.earnedCoins`, `History` type 6 with `liveType: 3`,
agency commission, lucky gift, `liveRoomCoinUpdate`, `topGiftersUpdate`). The
rank `$inc` on both docs is filtered on `{ pkId, pkStatus:"round",
pkEndTime:{ $gt: now } }`; the broadcast `pkGift { giftData, response:<own
doc>, counted }` tells the apps whether the bars moved. Gifts in the lobby or
after the deadline therefore pay out but do not score, which also closes the
race with a round ending at the same instant.

### 3.6 Keeping late joiners in sync

`countLiveJoin` emits `pkRankUpdate` (full document + `duration`, 0 in the
lobby) and `updateHostGifterStats`; `fetchSingleLiveUser` and the REST
listings project `pkStatus`, `pkRound`, `host1Wins`, `host2Wins` alongside the
existing `host2*`/rank fields. `broadcastLiveComment` with `isBattleActive`
mirrors comments to both rooms.

### 3.7 Server-side timer

`startPkRound` schedules an in-process `setTimeout` keyed by `pkId`; the
persisted `pkEndTime` is the source of truth. On boot `reconcileOnStartup()`
resets sessions from before the lobby existed or interrupted in `ending`, ends
sessions whose partner document is missing, ends overdue rounds and
re-schedules future ones. `startSweep()` then runs `sweepOverdueRounds()`
every 10 s (`{ pkStatus:"round", pkEndTime:{ $lte: now } }`, indexed) as a
safety net. Single Socket.IO node, no Redis adapter.

### 3.8 Admin termination

`PATCH /api/admin/liveStreamer/terminateLiveStream` →
`performAdminEndLiveSession` → `endPkSession(reason:"admin")` (legacy `pkEnd`
with `isManualMode: true`), then the normal video teardown.

---

## 4. Socket event reference

Inbound (client → server), payloads are **JSON strings**:

| Event | Sender | Key fields |
|---|---|---|
| `pkRequest` | Host | `host1Id`, `host2Id`, `host1Name`, `host1Image`, `InstantCutRequestByHost?` |
| `pkCancelRequest` | Challenger | `host1Id`, `host2Id` |
| `pkAnswer` | Challenged host | `HOST_1_*`, `HOST_2_*`, `isAccept` |
| `pkStartRequest` | Either host (lobby) | `pkId` |
| `pkStartAnswer` | The other host | `pkId`, `isAccept` |
| `pkEndRound` | Either host (round) | `pkId` |
| `pkEndSession` | Either host | `pkId` |
| `pkEnd` (legacy) | Either host | `userId`, `liveHistoryId`, `isManualMode?`, `pkEndUserId?` — alias of `pkEndSession` |
| `pkGift` | Viewer | `senderUserId`, `receiverUserId`, `giftId`, `giftCategoryId`, `giftCount` |
| `countLiveJoin` | Viewer | triggers `pkRankUpdate` |
| `broadcastLiveComment` | Anyone | `isBattleActive` |

Outbound (server → client):

| Event | Target | Payload |
|---|---|---|
| `pkRequestReceived` | `globalRoom:<host2Id>` | raw `pkRequest` payload |
| `pkRequestCancelled` | `globalRoom:<host2Id>` | `{ host1Id, host2Id }` |
| `pkAnswer` | both live rooms | `{ data, response }` (`response` = own doc with `pkStatus`, `pkRound`, wins, `duration: 0`; `{}` on decline) |
| `pkStartRequested` | opponent's personal room | `{ pkId, requestedBy, name, image }` |
| `pkStartRejected` | requester's personal room | `{ pkId, rejectedBy }` |
| `pkRoundStarted` | both live rooms | `{ pkId, pkRound, duration, pkEndTime, startedBy, data }` |
| `pkRoundEnded` | both live rooms | `{ pkId, pkRound, reason, endedBy, isDraw, winnerUserId, winner, scores, wins, data }` |
| `pkSessionEnded` | both live rooms | `{ pkId, reason, endedBy, wins, lastRound, data }` |
| `pkEnd` (legacy) | both live rooms, session end only | `{ isManualMode, pkEndUserId, data, winner }` |
| `pkGift` | both live rooms (error string to sender's personal room) | `{ giftData, response, counted }` |
| `pkRankUpdate` | the joined room | full document + `duration` |
| `updateHostGifterStats` / `topGiftersUpdate` | rooms | leaderboards (unchanged) |
| `pkError` | caller socket | `{ event, message, unavailableReason? }` |
| `singleLiveUserResponse` | answering socket | error string when accept fails |

`reason` values: `manual`, `timer`, `host_left`, `admin`, `partner_missing`,
`orphan`. FCM data types: `PK_REQUEST`, `PK_REQUEST_CANCELLED` (data-only),
`PK_INSTANT_CUT_REQUEST`, `PK_ACCEPTED`, `PK_REJECTED`.

---

## 5. Money and scoring at a glance

| Quantity | Formula | Where it lands |
|---|---|---|
| Gift cost | `gift.coin × giftCount` | sender `coin -=`, `spentCoins +=` |
| Admin cut | `round(total × adminRate / 100)` | `History.adminCoin` only |
| Host credit | `total − adminCut` | receiver `silverCoin`, `receivedCoins`, (`earnedHostCoins` if agency host); `LiveStreamer.earnedCoins`; `LiveStreamerHistory.earnedCoins` |
| Round score | `+= total` (gross), only while `pkStatus:"round"` | `localRank` on receiver, `remoteRank` on opponent |
| Round result | `A.localRank` vs `B.localRank` at the flip | `isWinner`, `host1Wins`/`host2Wins`, history `pkRoundsPlayed/Won` |
| Agency commission / lucky gift | unchanged | `History` type 9 / 15 |

Nothing is paid out for winning; wins are bragging rights the apps render.

---

## 6. Media: Agora relay vs Tencent cross-room

Unchanged: the server hands each side `host2Channel` + `host2AgoraUID` (and
the opponent's `token`) for Agora, and `host2TencentUserId` /
`host2TencentRoomId` plus the `tencent` block for Tencent. Never remove the
Agora fields.

---

## 7. Known gaps and gotchas

1. **Host socket drop mid-session is not handled** (deferred on purpose). The
   `disconnect` handler skips the reconnect grace period for `isPkMode` hosts
   and leaves both documents in the session. `reconcileOnStartup()` only
   repairs this after a restart (overdue round → ended; missing partner →
   session ended).
2. **Mixed app builds are unsupported.** An old build cannot render the lobby;
   the legacy `pkEnd` emit at session end only keeps old-build *viewers* from
   being stuck in split view.
3. **`pkGift` still has no `isHost` guard** for the silver credit and never
   calls `updateHostLevel`, unlike `giftToLiveStream`.
4. **`topGiftersUpdate` uses only the receiver's leaderboard** while
   `updateHostGifterStats` sends both; the client merges the two shapes.
5. **No validation that the gift sender is in either room.**
6. **Field name drift.** `pkRequest` accepts both `host1Id` and `HOST_1_ID`;
   `pkAnswer` only the upper-case form; the `tencent` sub-object uses
   `odcUserId`.
7. **Socket listeners are registered after awaits** in the connection
   handler, so an event emitted immediately after `connect` can be dropped.
   The apps wait for `singleLiveUserResponse` before acting; test clients
   must sleep ~1 s after connecting.

---

## 8. Testing a session by hand

1. Start the server with `isDummyData: true` (`POST /api/client/test/enableTestMode`).
2. Create two users via `POST /api/client/test/login` and note their ids and
   `TEST_TOKEN_…` tokens; `GET /api/client/test/config` returns the `key`.
3. Start a video live for each with
   `POST /api/client/liveStreamer/startLiveStream?liveType=1&channel=<x>&agoraUID=<n>`
   (headers `Authorization: Bearer TEST_TOKEN_<id>_x`, `key: <secretKey>`).
   Keep the returned `_id` (LIVEUSER_OBJ_ID) and `liveHistoryId` (LIVEID).
4. Open two Socket.IO clients with `?globalRoom=globalRoom:<userId>`, wait a
   second, and join each host to its own live room via `countLiveJoin`.
5. `GET searchPkHost?uniqueId=<B>` as A → `isAvailable: true`.
6. From A emit `pkRequest`; from B emit `pkAnswer` with `isAccept: true` and
   all `HOST_*` fields. Both rooms receive `pkAnswer` with `pkStatus: "lobby"`.
7. From A emit `pkStartRequest { pkId }`; B receives `pkStartRequested` and
   emits `pkStartAnswer { pkId, isAccept: true }`. Both rooms receive
   `pkRoundStarted` with `duration ≈ Setting.pkEndTime`.
8. From a third client emit `pkGift`; watch `pkGift { counted: true }`,
   `topGiftersUpdate`, `liveRoomCoinUpdate`, and the `History` row.
9. Emit `pkEndRound` (or wait for the timer): both rooms receive
   `pkRoundEnded` with `winner`, `scores`, `wins`; both docs are back in the
   lobby with the same `pkId`. Repeat from step 7 for another round.
10. Emit `pkEndSession`: both rooms receive `pkSessionEnded` then `pkEnd`;
    both docs are reset and both lives are still running.
11. `GET recentPkOpponents` as A lists B with `battleCount: 1`.

`GET /api/client/test/livestreamers` is a quick way to inspect live documents
without an admin token.
