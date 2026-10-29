//Availability of hosts for a PK invitation. Shared by the PK host search, the recent-opponents
//list and the pkRequest socket guard so every surface agrees on what "available" means:
//in a normal video live (liveType 1, not audio) and not in any PK session (lobby or round).
const mongoose = require("mongoose");
const User = require("../models/user.model");
const LiveStreamer = require("../models/liveStreamer.model");
const AvtarFrame = require("../models/avtarFrame.model");
const Block = require("../models/block.model");

const UNAVAILABLE_REASON = {
  SELF: "self",
  BLOCKED: "blocked",
  OFFLINE: "offline",
  NOT_LIVE: "not_live",
  IN_PK: "in_pk",
  NOT_FOUND: "not_found",
};

const UNAVAILABLE_MESSAGE = {
  self: "You cannot challenge yourself.",
  blocked: "You cannot challenge this host.",
  offline: "This host is offline.",
  not_live: "This host is not in a video live right now.",
  in_pk: "This host is already in a PK session.",
  not_found: "Host not found.",
};

//Returns Map<userId, row>. Row shape matches getAvailableLiveUsers plus
//uniqueId, isOnline, isLive, pkStatus, isAvailable and unavailableReason.
async function getPkAvailability(targetUserIds, { requesterId = null } = {}) {
  const result = new Map();
  const ids = [...new Set((targetUserIds || []).map((id) => String(id)).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  if (!ids.length) return result;

  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  const requester = requesterId ? String(requesterId) : null;

  const [users, lives, blocks] = await Promise.all([
    User.find({ _id: { $in: objectIds } })
      .select("_id name userName image uniqueId isProfilePicBanned countryFlagImage country isVerified activeAvtarFrame isOnline isLive isBlock")
      .lean(),
    LiveStreamer.find({ userId: { $in: objectIds } }).select("_id userId channel token liveHistoryId liveType isAudio isPkMode pkStatus").lean(),
    requester && mongoose.Types.ObjectId.isValid(requester)
      ? Block.find({
          $or: [
            { userId: requester, toUserId: { $in: objectIds } },
            { userId: { $in: objectIds }, toUserId: requester },
          ],
        })
          .select("userId toUserId")
          .lean()
      : Promise.resolve([]),
  ]);

  const frameIds = users.map((user) => user.activeAvtarFrame).filter(Boolean);
  const frames = frameIds.length ? await AvtarFrame.find({ _id: { $in: frameIds } }).select("_id image type").lean() : [];
  const frameById = new Map(frames.map((frame) => [String(frame._id), frame]));

  //Prefer a video live when a user somehow has more than one live document
  const liveByUser = new Map();
  for (const live of lives) {
    const key = String(live.userId);
    const current = liveByUser.get(key);
    if (!current || (live.liveType === 1 && !live.isAudio)) liveByUser.set(key, live);
  }

  const blockedIds = new Set();
  for (const block of blocks) {
    blockedIds.add(String(block.userId) === requester ? String(block.toUserId) : String(block.userId));
  }

  for (const user of users) {
    const id = String(user._id);
    const live = liveByUser.get(id) || null;
    const frame = user.activeAvtarFrame ? frameById.get(String(user.activeAvtarFrame)) : null;
    const isVideoLive = !!live && live.liveType === 1 && !live.isAudio;

    let reason = null;
    if (requester && id === requester) reason = UNAVAILABLE_REASON.SELF;
    else if (blockedIds.has(id) || user.isBlock) reason = UNAVAILABLE_REASON.BLOCKED;
    else if (!live && !user.isLive && !user.isOnline) reason = UNAVAILABLE_REASON.OFFLINE;
    else if (!isVideoLive) reason = UNAVAILABLE_REASON.NOT_LIVE;
    else if (live.isPkMode) reason = UNAVAILABLE_REASON.IN_PK;

    result.set(id, {
      _id: isVideoLive ? live._id : null, //LiveStreamer id = socket room of that live
      channel: isVideoLive ? live.channel : "",
      token: isVideoLive ? live.token : "",
      liveHistoryId: isVideoLive ? live.liveHistoryId : null,
      userId: user._id,
      name: user.name || "",
      userName: user.userName || "",
      image: user.image || "",
      isProfilePicBanned: !!user.isProfilePicBanned,
      countryFlagImage: user.countryFlagImage || "",
      country: user.country || "",
      isVerified: !!user.isVerified,
      avtarFrame: frame?.image || "",
      avtarFrameType: frame?.type || 0,
      uniqueId: user.uniqueId || "",
      isOnline: !!user.isOnline,
      isLive: !!user.isLive,
      pkStatus: live?.pkStatus || "",
      isAvailable: reason === null,
      unavailableReason: reason,
    });
  }

  return result;
}

//Availability row for a single target, or a not_found row
async function getPkAvailabilityFor(targetUserId, { requesterId = null } = {}) {
  const rows = await getPkAvailability([targetUserId], { requesterId });
  return (
    rows.get(String(targetUserId)) || {
      userId: targetUserId,
      isAvailable: false,
      unavailableReason: UNAVAILABLE_REASON.NOT_FOUND,
    }
  );
}

module.exports = { UNAVAILABLE_REASON, UNAVAILABLE_MESSAGE, getPkAvailability, getPkAvailabilityFor };
