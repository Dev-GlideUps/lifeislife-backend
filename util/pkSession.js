//PK battle session lifecycle (shared by socket.js, admin controllers and the round timer)
//
//A PK *session* starts when an invitation is accepted and ends when a host ends it (or leaves).
//Inside a session the hosts sit in the *lobby* (pkStatus "lobby", no timer) and can play any
//number of *rounds* (pkStatus "round", pkEndTime set). isPkMode stays true for the whole session.
//
//Broadcast convention (unchanged from the original handlers): every live room receives its OWN
//LiveStreamer document, where pkConfig.host1* is that host and pkConfig.host2* is the opponent.
const mongoose = require("mongoose");
const LiveStreamer = require("../models/liveStreamer.model");
const LiveStreamerHistory = require("../models/liveStreamerHistory.model");
const TopGifter = require("../models/topGifter.model");
const PkOpponent = require("../models/pkOpponent.model");

const PK_STATUS = {
  NONE: "",
  LOBBY: "lobby",
  ROUND: "round",
  ENDING: "ending",
};

//Fields of pkConfig.host1Details / host2Details and their reset values
const HOST_DETAILS_RESET = {
  userId: null,
  name: "",
  userName: "",
  image: "",
  isProfilePicBanned: false,
  isVerified: false,
  gender: "",
  age: 0,
  countryFlagImage: "",
  country: "",
  uniqueId: "",
  coin: 0,
  wealthLevelImage: "",
  avtarFrameType: 0,
  avtarFrame: "",
};

//Projection shared by every PK broadcast (pkAnswer / pkGift / pkEnd / pkRankUpdate / round events)
const PK_PAYLOAD_PROJECTION = {
  _id: 1,
  userId: 1,
  name: 1,
  userName: 1,
  image: 1,
  token: 1,
  channel: 1,
  agoraUid: 1,
  coin: 1,
  duration: 1,
  isPkMode: 1,
  pkId: 1,
  pkStatus: 1,
  pkRound: 1,
  pkEndTime: 1,
  pkStartRequestedBy: 1,
  pkConfig: 1,
  liveHistoryId: 1,
  view: 1,
  tencentRoomId: 1,
  tencentUserId: 1,
  tencent: {
    roomId: { $ifNull: ["$tencentRoomId", ""] },
    odcUserId: { $toString: "$userId" },
  },
};

//Per-round score fields, zeroed at every round start.
//hostNDetails.coin is intentionally not here: it keeps the original meaning (user coin snapshot
//at accept plus every gift received during the session) and is reset only at session end.
const ROUND_SCORE_RESET = {
  "pkConfig.localRank": 0,
  "pkConfig.localGiftCount": 0,
  "pkConfig.remoteRank": 0,
  "pkConfig.remoteGiftCount": 0,
  "pkConfig.isWinner": 0,
};

const toIdString = (value) => (value === null || value === undefined ? "" : value.toString());

const liveHistoryIdsOf = (docs) => docs.map((doc) => doc?.liveHistoryId).filter(Boolean);

//Full $set object that returns a LiveStreamer document to the "not in PK" state
function resetPkFields() {
  const set = {
    isPkMode: false,
    pkStatus: PK_STATUS.NONE,
    pkRound: 0,
    pkId: null,
    pkEndTime: null,
    pkStartRequestedBy: null,

    "pkConfig.host1Id": null,
    "pkConfig.host1Name": "",
    "pkConfig.host1Image": "",
    "pkConfig.host1UniqueId": "",
    "pkConfig.host1ObjId": "",
    "pkConfig.host1LiveId": "",
    "pkConfig.host1Channel": "",
    "pkConfig.host1AgoraUID": 0,
    "pkConfig.host1TencentUserId": "",
    "pkConfig.host1TencentRoomId": "",

    "pkConfig.host2Id": null,
    "pkConfig.host2Name": "",
    "pkConfig.host2userName": "",
    "pkConfig.host2Image": "",
    "pkConfig.host2UniqueId": "",
    "pkConfig.host2ObjId": "",
    "pkConfig.host2LiveId": "",
    "pkConfig.host2Channel": "",
    "pkConfig.host2AgoraUID": 0,
    "pkConfig.host2TencentUserId": "",
    "pkConfig.host2TencentRoomId": "",

    "pkConfig.host1Wins": 0,
    "pkConfig.host2Wins": 0,
    ...ROUND_SCORE_RESET,
  };

  for (const [key, value] of Object.entries(HOST_DETAILS_RESET)) {
    set[`pkConfig.host1Details.${key}`] = value;
    set[`pkConfig.host2Details.${key}`] = value;
  }

  return set;
}

//Reset every LiveStreamer document that belongs to the given pkId
async function resetPkState(pkId) {
  if (pkId === null || pkId === undefined) return { matchedCount: 0, modifiedCount: 0 };

  const result = await LiveStreamer.updateMany({ pkId: toIdString(pkId) }, { $set: resetPkFields() });
  console.log(`[pkSession] resetPkState pkId=${pkId} matched=${result.matchedCount} modified=${result.modifiedCount}`);
  return result;
}

//Both LiveStreamer documents of a session (tolerates a missing partner)
async function loadSessionDocs(pkId) {
  if (pkId === null || pkId === undefined) return [];
  return LiveStreamer.find({ pkId: toIdString(pkId), isPkMode: true }).lean();
}

//Session documents from one host's point of view. null when userId is not a host of pkId.
async function getSessionForHost(pkId, userId) {
  const docs = await loadSessionDocs(pkId);
  const ownDoc = docs.find((doc) => toIdString(doc.userId) === toIdString(userId));
  if (!ownDoc) return null;

  const opponentDoc = docs.find((doc) => toIdString(doc._id) !== toIdString(ownDoc._id)) || null;
  return { docs, ownDoc, opponentDoc };
}

//Seconds left in the current round (0 in the lobby or without a deadline)
function computeDuration(doc) {
  if (!doc || !doc.pkEndTime) return 0;
  if (doc.pkStatus && doc.pkStatus !== PK_STATUS.ROUND) return 0;

  const end = new Date(doc.pkEndTime).getTime();
  if (Number.isNaN(end)) return 0;

  return Math.max(0, Math.round((end - Date.now()) / 1000));
}

//Aggregated PK payload for one live document (the shape the apps already consume)
async function buildPkPayload(doc) {
  if (!doc || !doc._id) return null;

  const [payload] = await LiveStreamer.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(doc._id) } },
    { $addFields: { duration: computeDuration(doc) } },
    { $project: PK_PAYLOAD_PROJECTION },
  ]);

  return payload || null;
}

//Result of a round from each host's own localRank. 2 = won, 1 = lost, 0 = draw
function computeRoundResult(docA, docB) {
  const scoreA = Number(docA?.pkConfig?.localRank || 0);
  const scoreB = docB ? Number(docB?.pkConfig?.localRank || 0) : Number(docA?.pkConfig?.remoteRank || 0);

  let aResult = 0;
  let bResult = 0;

  if (scoreA > scoreB) {
    aResult = 2;
    bResult = 1;
  } else if (scoreA < scoreB) {
    aResult = 1;
    bResult = 2;
  }

  const isDraw = aResult === 0;
  let winnerUserId = null;
  if (!isDraw) winnerUserId = toIdString(aResult === 2 ? docA?.userId : docB?.userId || docA?.pkConfig?.host2Id);

  return { aResult, bResult, scoreA, scoreB, isDraw, winnerUserId };
}

//Emit one event to the live room of every session document.
//buildPayload(ownDoc, opponentDoc) returns the payload for ownDoc's room (undefined = skip).
async function emitToBothRooms(docs, event, buildPayload) {
  const ioRef = global.io;
  if (!ioRef) return;

  for (const ownDoc of docs) {
    const opponentDoc = docs.find((doc) => toIdString(doc._id) !== toIdString(ownDoc._id)) || null;
    const payload = await buildPayload(ownDoc, opponentDoc);
    if (payload === undefined) continue;

    ioRef.in(toIdString(ownDoc._id)).emit(event, payload);
  }
}

//Scores / wins keyed by host userId, plus the winner's details, for round/session events
function buildRoundSummary(docs, result) {
  const scores = {};
  const wins = {};

  for (const doc of docs) {
    const key = toIdString(doc.userId);
    scores[key] = Number(doc?.pkConfig?.localRank || 0);
    wins[key] = Number(doc?.pkConfig?.host1Wins || 0);
  }

  const winnerDoc = result.winnerUserId ? docs.find((doc) => toIdString(doc.userId) === result.winnerUserId) : null;

  return {
    isDraw: result.isDraw,
    winnerUserId: result.winnerUserId,
    winner: winnerDoc ? winnerDoc.pkConfig?.host1Details || null : null,
    scores,
    wins,
  };
}

//Legacy pkEnd payload (old app builds): own document, winner = host1Details when this host won,
//otherwise host2Details (on a draw the opponent's details, matching the original handler).
function buildLegacyPkEndPayload(ownPayload, legacyPkEnd = {}) {
  const winner = ownPayload?.pkConfig?.isWinner == 2 ? ownPayload?.pkConfig?.host1Details : ownPayload?.pkConfig?.host2Details;

  return {
    isManualMode: legacyPkEnd.isManualMode ?? false,
    pkEndUserId: legacyPkEnd.pkEndUserId ?? null,
    data: ownPayload || null,
    winner: winner || null,
  };
}

//Mirrored pkConfig $set for one host's document (self = host1*, opponent = host2*)
function buildMirroredConfig(self, opponent) {
  return {
    "pkConfig.host1Id": self.id,
    "pkConfig.host1Name": self.name,
    "pkConfig.host1Image": self.image,
    "pkConfig.host1UniqueId": self.uniqueId,
    "pkConfig.host1ObjId": self.liveObjId,
    "pkConfig.host1LiveId": self.liveHistoryId,
    "pkConfig.host1Channel": self.channel,
    "pkConfig.host1AgoraUID": self.agoraUid,
    "pkConfig.host1TencentUserId": self.tencentUserId || "",
    "pkConfig.host1TencentRoomId": self.tencentRoomId || "",

    "pkConfig.host2Id": opponent.id,
    "pkConfig.host2Name": opponent.name,
    "pkConfig.host2userName": opponent.userName,
    "pkConfig.host2Image": opponent.image,
    "pkConfig.host2UniqueId": opponent.uniqueId,
    "pkConfig.host2ObjId": opponent.liveObjId,
    "pkConfig.host2LiveId": opponent.liveHistoryId,
    "pkConfig.host2Channel": opponent.channel,
    "pkConfig.host2AgoraUID": opponent.agoraUid,
    "pkConfig.host2TencentUserId": opponent.tencentUserId || "",
    "pkConfig.host2TencentRoomId": opponent.tencentRoomId || "",

    "pkConfig.host1Details": self.details,
    "pkConfig.host2Details": opponent.details,
  };
}

//Create a session in the lobby for two hosts. Each host: { id, name, userName, image, uniqueId,
//liveObjId, liveHistoryId, channel, agoraUid, tencentUserId, tencentRoomId, details }.
//Returns [liveUserA, liveUserB] or null when either host is not available (state is rolled back).
async function createPkSession({ pkId, hosts }) {
  const [hostA, hostB] = hosts;
  const pkIdStr = toIdString(pkId);

  const baseSet = {
    isPkMode: true,
    pkStatus: PK_STATUS.LOBBY,
    pkRound: 0,
    pkEndTime: null,
    pkStartRequestedBy: null,
    pkId: pkIdStr,
    "pkConfig.host1Wins": 0,
    "pkConfig.host2Wins": 0,
    ...ROUND_SCORE_RESET,
  };

  const filterFor = (host) => ({ userId: host.id, liveType: { $nin: [2, 3, 4] }, isAudio: false, isPkMode: false });

  const [liveUserA, liveUserB] = await Promise.all([
    LiveStreamer.findOneAndUpdate(filterFor(hostA), { $set: { ...baseSet, ...buildMirroredConfig(hostA, hostB) } }, { new: true, lean: true }),
    LiveStreamer.findOneAndUpdate(filterFor(hostB), { $set: { ...baseSet, ...buildMirroredConfig(hostB, hostA) } }, { new: true, lean: true }),
  ]);

  if (!liveUserA || !liveUserB) {
    console.log(`[pkSession] createPkSession pkId=${pkIdStr} failed (hostA=${!!liveUserA}, hostB=${!!liveUserB}); rolling back`);
    await resetPkState(pkIdStr);
    return null;
  }

  await LiveStreamerHistory.updateMany(
    { _id: { $in: liveHistoryIdsOf([liveUserA, liveUserB]) } },
    { $set: { isPkMode: true, pkId: Number(pkIdStr) || 0, pkEndTime: null, pkRoundsPlayed: 0, pkRoundsWon: 0 } },
  );

  //Remember the pair in both directions for the recent-opponents (rematch) list; never blocks the session
  try {
    const now = new Date();
    await Promise.all([
      PkOpponent.updateOne({ userId: hostA.id, opponentId: hostB.id }, { $set: { lastBattledAt: now }, $inc: { battleCount: 1 } }, { upsert: true }),
      PkOpponent.updateOne({ userId: hostB.id, opponentId: hostA.id }, { $set: { lastBattledAt: now }, $inc: { battleCount: 1 } }, { upsert: true }),
    ]);
  } catch (error) {
    console.error(`[pkSession] recent opponent upsert failed pkId=${pkIdStr}:`, error);
  }

  console.log(`[pkSession] createPkSession pkId=${pkIdStr} lobby for ${hostA.id} and ${hostB.id}`);
  return [liveUserA, liveUserB];
}

//Record / clear a pending "start round" request (lobby only)
async function setStartRequest(pkId, requestedBy) {
  return LiveStreamer.updateMany({ pkId: toIdString(pkId), isPkMode: true, pkStatus: PK_STATUS.LOBBY }, { $set: { pkStartRequestedBy: requestedBy || null } });
}

//Start a round: lobby -> round, timer from Setting.pkEndTime, scores zeroed.
//Returns { docs, pkRound, endTime, duration } or null when the session is not in the lobby.
async function startPkRound(pkId, { startedBy = null } = {}) {
  const pkIdStr = toIdString(pkId);
  const pkTime = Number(global.settingJSON?.pkEndTime) || 300;
  const endTime = new Date(Date.now() + pkTime * 1000);

  const result = await LiveStreamer.updateMany(
    { pkId: pkIdStr, isPkMode: true, pkStatus: PK_STATUS.LOBBY },
    {
      $set: { pkStatus: PK_STATUS.ROUND, pkEndTime: endTime, pkStartRequestedBy: null, ...ROUND_SCORE_RESET },
      $inc: { pkRound: 1 },
    },
  );

  if (result.modifiedCount === 0) {
    console.log(`[pkSession] startPkRound pkId=${pkIdStr} - session not in lobby`);
    return null;
  }

  if (result.modifiedCount !== 2) {
    console.log(`[pkSession] startPkRound pkId=${pkIdStr} - partner missing, ending session`);
    await endPkSession(pkIdStr, { reason: "partner_missing", endedBy: startedBy });
    return null;
  }

  const docs = await loadSessionDocs(pkIdStr);
  const pkRound = docs[0]?.pkRound || 0;
  const duration = computeDuration(docs[0]);

  await LiveStreamerHistory.updateMany({ _id: { $in: liveHistoryIdsOf(docs) } }, { $set: { pkEndTime: endTime } });

  console.log(`[pkSession] startPkRound pkId=${pkIdStr} round=${pkRound} duration=${duration}s startedBy=${startedBy}`);

  scheduleRoundTimer(pkIdStr, endTime);

  await emitToBothRooms(docs, "pkRoundStarted", async (ownDoc) => ({
    pkId: pkIdStr,
    pkRound,
    duration,
    pkEndTime: endTime,
    startedBy: toIdString(startedBy),
    data: await buildPkPayload(ownDoc),
  }));

  return { docs, pkRound, endTime, duration };
}

//Write the result of the round that just finished: isWinner on both docs, win counters, history stats
async function finalizeRound(docs) {
  const [docA, docB = null] = docs;
  const result = computeRoundResult(docA, docB);

  const updateFor = (ownResult, otherResult) => {
    const update = { $set: { "pkConfig.isWinner": ownResult } };
    if (ownResult === 2) update.$inc = { "pkConfig.host1Wins": 1 };
    else if (otherResult === 2) update.$inc = { "pkConfig.host2Wins": 1 };
    return update;
  };

  const winnerDoc = result.winnerUserId ? docs.find((doc) => toIdString(doc.userId) === result.winnerUserId) : null;

  await Promise.all([
    LiveStreamer.updateOne({ _id: docA._id }, updateFor(result.aResult, result.bResult)),
    docB ? LiveStreamer.updateOne({ _id: docB._id }, updateFor(result.bResult, result.aResult)) : Promise.resolve(),
    LiveStreamerHistory.updateMany({ _id: { $in: liveHistoryIdsOf(docs) } }, { $inc: { pkRoundsPlayed: 1 } }),
    winnerDoc?.liveHistoryId ? LiveStreamerHistory.updateOne({ _id: winnerDoc.liveHistoryId }, { $inc: { pkRoundsWon: 1 } }) : Promise.resolve(),
  ]);

  return result;
}

//End the current round: round -> lobby, result written and broadcast as pkRoundEnded.
//Returns the round summary, or null when no round was running (already ended by someone else).
async function endPkRound(pkId, { reason = "manual", endedBy = null } = {}) {
  const pkIdStr = toIdString(pkId);

  const flip = await LiveStreamer.updateMany(
    { pkId: pkIdStr, isPkMode: true, pkStatus: PK_STATUS.ROUND },
    { $set: { pkStatus: PK_STATUS.LOBBY, pkEndTime: null, pkStartRequestedBy: null } },
  );

  if (flip.matchedCount === 0) {
    console.log(`[pkSession] endPkRound pkId=${pkIdStr} - no running round`);
    return null;
  }

  clearRoundTimer(pkIdStr);

  const docs = await loadSessionDocs(pkIdStr);
  if (!docs.length) return null;

  const result = await finalizeRound(docs);
  const fresh = await loadSessionDocs(pkIdStr);
  const pkRound = fresh[0]?.pkRound || docs[0]?.pkRound || 0;
  const summary = buildRoundSummary(fresh, result);

  console.log(`[pkSession] endPkRound pkId=${pkIdStr} round=${pkRound} reason=${reason} winner=${summary.winnerUserId} scores=${JSON.stringify(summary.scores)}`);

  await emitToBothRooms(fresh, "pkRoundEnded", async (ownDoc) => ({
    pkId: pkIdStr,
    pkRound,
    reason,
    endedBy: toIdString(endedBy) || null,
    ...summary,
    data: await buildPkPayload(ownDoc),
  }));

  return { pkRound, ...summary };
}

//End the whole PK session (from lobby or mid-round): finalise a running round, notify both rooms
//(pkSessionEnded + legacy pkEnd), reset state, clear leaderboards. Lives are never torn down here.
//Returns false when no active session exists for pkId or another caller is already ending it.
async function endPkSession(pkId, { reason = "manual", endedBy = null, legacyPkEnd = {} } = {}) {
  const pkIdStr = toIdString(pkId);
  const before = await loadSessionDocs(pkIdStr);

  if (!before.length) {
    console.log(`[pkSession] endPkSession pkId=${pkIdStr} - no active session`);
    return false;
  }

  //Flip running-round docs first so "was a round running" is decided atomically with the flip
  //(documents without a pkStatus come from before the lobby existed and count as a running round).
  const roundFlip = await LiveStreamer.updateMany(
    { pkId: pkIdStr, isPkMode: true, pkStatus: { $in: [PK_STATUS.ROUND, PK_STATUS.NONE, null] } },
    { $set: { pkStatus: PK_STATUS.ENDING } },
  );
  const lobbyFlip = await LiveStreamer.updateMany({ pkId: pkIdStr, isPkMode: true, pkStatus: PK_STATUS.LOBBY }, { $set: { pkStatus: PK_STATUS.ENDING } });

  if (roundFlip.matchedCount === 0 && lobbyFlip.matchedCount === 0) {
    console.log(`[pkSession] endPkSession pkId=${pkIdStr} - already being ended`);
    return false;
  }

  clearRoundTimer(pkIdStr);

  console.log(`[pkSession] endPkSession pkId=${pkIdStr} reason=${reason} endedBy=${endedBy} docs=${before.length}`);

  const wasRound = roundFlip.matchedCount > 0;
  let lastRound = null;

  if (wasRound) {
    const result = await finalizeRound(before);
    lastRound = { pkRound: before[0]?.pkRound || 0, ...buildRoundSummary(await loadSessionDocs(pkIdStr), result) };
  }

  const docs = await loadSessionDocs(pkIdStr);
  const payloads = new Map();
  for (const doc of docs) {
    payloads.set(toIdString(doc._id), await buildPkPayload(doc));
  }

  const wins = {};
  for (const doc of docs) wins[toIdString(doc.userId)] = Number(doc?.pkConfig?.host1Wins || 0);

  await emitToBothRooms(docs, "pkSessionEnded", (ownDoc) => ({
    pkId: pkIdStr,
    reason,
    endedBy: toIdString(endedBy) || null,
    wins,
    lastRound,
    data: payloads.get(toIdString(ownDoc._id)),
  }));

  await emitToBothRooms(docs, "pkEnd", (ownDoc) => buildLegacyPkEndPayload(payloads.get(toIdString(ownDoc._id)), legacyPkEnd));

  const liveHistoryIds = new Set();
  for (const doc of docs) {
    if (doc?.pkConfig?.host1LiveId) liveHistoryIds.add(doc.pkConfig.host1LiveId);
    if (doc?.pkConfig?.host2LiveId) liveHistoryIds.add(doc.pkConfig.host2LiveId);
  }

  await Promise.all([
    resetPkState(pkIdStr),
    liveHistoryIds.size ? TopGifter.deleteMany({ liveHistoryId: { $in: [...liveHistoryIds] } }) : Promise.resolve(),
  ]);

  return true;
}

// ==================== SERVER-SIDE ROUND TIMER ====================
//The persisted pkEndTime is the source of truth; the in-process timeout is only the trigger.
//reconcileOnStartup() repairs state after a restart and a periodic sweep catches lost timeouts.
const roundTimers = new Map(); //pkId -> Timeout
let sweepHandle = null;
let sweeping = false;

function clearRoundTimer(pkId) {
  const key = toIdString(pkId);
  const timer = roundTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    roundTimers.delete(key);
  }
}

function scheduleRoundTimer(pkId, endTime) {
  const key = toIdString(pkId);
  clearRoundTimer(key);

  const delay = Math.max(0, new Date(endTime).getTime() - Date.now());
  const timer = setTimeout(() => {
    roundTimers.delete(key);
    endPkRound(key, { reason: "timer" }).catch((error) => console.error(`[pkSession] round timer failed pkId=${key}:`, error));
  }, delay);

  roundTimers.set(key, timer);
  console.log(`[pkSession] round timer scheduled pkId=${key} in ${Math.round(delay / 1000)}s`);
}

//End every round whose deadline has passed (safety net for a lost timeout). Returns the count.
async function sweepOverdueRounds() {
  if (sweeping) return 0;
  sweeping = true;

  try {
    const overdue = await LiveStreamer.find({ isPkMode: true, pkStatus: PK_STATUS.ROUND, pkEndTime: { $lte: new Date() } })
      .select("pkId")
      .lean();

    const pkIds = [...new Set(overdue.map((doc) => toIdString(doc.pkId)).filter(Boolean))];

    for (const pkId of pkIds) {
      console.log(`[pkSession] sweep: ending overdue round pkId=${pkId}`);
      await endPkRound(pkId, { reason: "timer" });
    }

    return pkIds.length;
  } catch (error) {
    console.error("[pkSession] sweepOverdueRounds failed:", error);
    return 0;
  } finally {
    sweeping = false;
  }
}

function startSweep(intervalMs = 10000) {
  if (sweepHandle) return sweepHandle;

  sweepHandle = setInterval(() => {
    sweepOverdueRounds();
  }, intervalMs);

  if (typeof sweepHandle.unref === "function") sweepHandle.unref();
  console.log(`[pkSession] overdue-round sweep started (every ${intervalMs / 1000}s)`);
  return sweepHandle;
}

function stopSweep() {
  if (sweepHandle) clearInterval(sweepHandle);
  sweepHandle = null;
}

//Repair PK state after a process restart:
// - sessions from before the lobby existed, or interrupted mid-end, are reset
// - sessions missing their partner document are ended
// - overdue rounds are ended, future rounds get their timer back
async function reconcileOnStartup() {
  const docs = await LiveStreamer.find({ isPkMode: true }).select("_id userId pkId pkStatus pkEndTime").lean();

  if (!docs.length) {
    console.log("[pkSession] reconcile: no active PK sessions");
    return;
  }

  const byPkId = new Map();
  for (const doc of docs) {
    const key = toIdString(doc.pkId);
    if (!byPkId.has(key)) byPkId.set(key, []);
    byPkId.get(key).push(doc);
  }

  for (const [pkId, group] of byPkId) {
    try {
      if (!pkId) {
        console.log(`[pkSession] reconcile: resetting ${group.length} doc(s) in PK without pkId`);
        await LiveStreamer.updateMany({ _id: { $in: group.map((doc) => doc._id) } }, { $set: resetPkFields() });
        continue;
      }

      const statuses = group.map((doc) => doc.pkStatus || PK_STATUS.NONE);

      if (statuses.some((status) => status === PK_STATUS.NONE || status === PK_STATUS.ENDING)) {
        console.log(`[pkSession] reconcile: resetting legacy/interrupted session pkId=${pkId}`);
        await resetPkState(pkId);
        continue;
      }

      if (group.length !== 2) {
        console.log(`[pkSession] reconcile: partner missing for pkId=${pkId}, ending session`);
        await endPkSession(pkId, { reason: "orphan" });
        continue;
      }

      const roundDoc = group.find((doc) => doc.pkStatus === PK_STATUS.ROUND);
      if (!roundDoc) continue; //lobby: nothing to do

      const endTime = roundDoc.pkEndTime ? new Date(roundDoc.pkEndTime).getTime() : 0;
      if (!endTime || endTime <= Date.now()) {
        console.log(`[pkSession] reconcile: ending overdue round pkId=${pkId}`);
        await endPkRound(pkId, { reason: "timer" });
      } else {
        scheduleRoundTimer(pkId, roundDoc.pkEndTime);
      }
    } catch (error) {
      console.error(`[pkSession] reconcile failed for pkId=${pkId}:`, error);
    }
  }
}

module.exports = {
  PK_STATUS,
  PK_PAYLOAD_PROJECTION,
  resetPkFields,
  resetPkState,
  loadSessionDocs,
  getSessionForHost,
  computeDuration,
  buildPkPayload,
  computeRoundResult,
  emitToBothRooms,
  createPkSession,
  setStartRequest,
  startPkRound,
  endPkRound,
  endPkSession,
  scheduleRoundTimer,
  clearRoundTimer,
  sweepOverdueRounds,
  startSweep,
  stopSweep,
  reconcileOnStartup,
};
