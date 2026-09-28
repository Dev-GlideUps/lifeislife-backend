const LiveStreamer = require("../../models/liveStreamer.model");
const requestedDefault = require("../../util/requestedDefault");
const User = require("../../models/user.model");
const TopGifter = require("../../models/topGifter.model");
const LiveStreamComment = require("../../models/liveStreamComment.model");
const LiveStreamerView = require("../../models/liveStreamerView.model");
const LiveStreamerHistory = require("../../models/liveStreamerHistory.model");
const FakeLiveStreamer = require("../../models/fakeLiveStreamer.model");

const mongoose = require("mongoose");
const fs = require("fs");
const moment = require("moment");
const redis = require("../../util/redis");
const admin = require("../../util/privateKey");
const { deleteFile } = require("../../util/deletefile");

//ends an active live session from admin
async function performAdminEndLiveSession({ userId, liveHistoryId, liveUserObjId, endLiveStreamPayload = {} }) {
  const ioRef = global.io;
  const roomId = liveUserObjId.toString();

  const [user, liveUser, liveHistory] = await Promise.all([
    User.findOne({ liveHistoryId }).select("_id isLive isBusy liveHistoryId name").lean(),
    LiveStreamer.findOne({ userId, liveHistoryId }).select("_id userId liveHistoryId isAudio roomImage isPkMode pkId pkConfig").lean(),
    LiveStreamerHistory.findById(liveHistoryId).select("_id startTime").lean(),
  ]);

  if (!user) {
    return { ok: false, status: 404, message: "User not found." };
  }

  if (!liveUser) {
    return { ok: false, status: 404, message: "LiveStreamer not found." };
  }

  if (!liveHistory) {
    return { ok: false, status: 404, message: "Live history not found." };
  }

  if (!(user.isLive && user.liveHistoryId)) {
    return { ok: false, status: 400, message: "User is not currently live." };
  }

  const streamPayload = {
    userId,
    liveHistoryId,
    liveUserObjId,
    endedBy: "admin",
    message: "Audio session has been ended by the host.",
    ...endLiveStreamPayload,
  };

  if (liveUser?.isPkMode && liveUser?.pkConfig && ioRef) {
    // const host1Room = pk.host1ObjId?.toString();
    // const host2Room = pk.host2ObjId?.toString();

    console.log("[adminEndLive] PK active - ending due to admin end live");

    let winnerHost1 = 0;
    let winnerHost2 = 0;

    if (liveUser.pkConfig.localRank > liveUser.pkConfig.remoteRank) {
      winnerHost1 = 2;
      winnerHost2 = 1;
    } else if (liveUser.pkConfig.localRank < liveUser.pkConfig.remoteRank) {
      winnerHost1 = 1;
      winnerHost2 = 2;
    }

    await Promise.all([
      LiveStreamer.findOneAndUpdate({ _id: liveUser._id, isAudio: false }, { "pkConfig.isWinner": winnerHost1 }, { new: true, lean: true }),
      LiveStreamer.findOneAndUpdate({ userId: liveUser.pkConfig.host2Id, isAudio: false }, { "pkConfig.isWinner": winnerHost2 }, { new: true, lean: true }),
    ]);

    const [responseForUser1, responseForUser2] = await Promise.all([
      LiveStreamer.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(liveUser.pkConfig.host2Id),
            isAudio: false,
          },
        },
        {
          $project: {
            _id: 1,
            userId: 1,
            name: 1,
            userName: 1,
            image: 1,
            token: 1,
            channel: 1,
            duration: 1,
            isPkMode: 1,
            pkConfig: 1,
            liveHistoryId: 1,
            view: 1,
          },
        },
      ]),
      LiveStreamer.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(liveUser.pkConfig.host1Id), //same as liveUser._id
            isAudio: false,
          },
        },
        {
          $project: {
            _id: 1,
            userId: 1,
            name: 1,
            userName: 1,
            image: 1,
            token: 1,
            channel: 1,
            duration: 1,
            isPkMode: 1,
            pkConfig: 1,
            liveHistoryId: 1,
            view: 1,
          },
        },
      ]),
    ]);

    io.in(liveUser.pkConfig.host1ObjId).emit("pkEnd", {
      isManualMode: true,
      pkEndUserId: liveUser?.userId,
      data: responseForUser2[0],
      winner: responseForUser2[0]?.pkConfig.isWinner == 2 ? responseForUser2[0]?.pkConfig.host1Details : responseForUser2[0]?.pkConfig.host2Details,
    });

    io.in(liveUser.pkConfig.host2ObjId).emit("pkEnd", {
      isManualMode: true,
      pkEndUserId: liveUser?.userId,
      data: responseForUser1[0],
      winner: responseForUser1[0]?.pkConfig.isWinner == 2 ? responseForUser1[0]?.pkConfig.host1Details : responseForUser1[0]?.pkConfig.host2Details,
    });

    if (ioRef) {
      ioRef.in(roomId).emit("endLiveStream", streamPayload);
    }

    if (ioRef) {
      const sockets = await ioRef.in(roomId).fetchSockets();
      if (sockets.length) {
        ioRef.socketsLeave(roomId);
      }
    }

    await Promise.all([
      LiveStreamer.updateMany(
        { pkId: liveUser.pkId },
        {
          $set: {
            isPkMode: false,
            pkId: null,
            pkEndTime: null,
            "pkConfig.host1Id": null,
            "pkConfig.host1Name": "",
            "pkConfig.host1Image": "",
            "pkConfig.host1UniqueId": "",
            "pkConfig.host1LiveId": "",
            "pkConfig.host1Channel": "",
            "pkConfig.host1AgoraUID": 0,

            "pkConfig.host2Id": null,
            "pkConfig.host2Name": "",
            "pkConfig.host2userName": "",
            "pkConfig.host2Image": "",
            "pkConfig.host2UniqueId": "",
            "pkConfig.host2LiveId": "",
            "pkConfig.host2Channel": "",
            "pkConfig.host2AgoraUID": 0,

            "pkConfig.localRank": 0,
            "pkConfig.localGiftCount": 0,
            "pkConfig.remoteRank": 0,
            "pkConfig.remoteGiftCount": 0,
            "pkConfig.isWinner": 0,

            "pkConfig.host1Details.userId": null,
            "pkConfig.host1Details.name": "",
            "pkConfig.host1Details.userName": "",
            "pkConfig.host1Details.image": "",
            "pkConfig.host1Details.isProfilePicBanned": false,
            "pkConfig.host1Details.isVerified": false,
            "pkConfig.host1Details.gender": "",
            "pkConfig.host1Details.age": 0,
            "pkConfig.host1Details.countryFlagImage": "",
            "pkConfig.host1Details.country": "",
            "pkConfig.host1Details.uniqueId": "",
            "pkConfig.host1Details.coin": 0,

            "pkConfig.host2Details.userId": null,
            "pkConfig.host2Details.name": "",
            "pkConfig.host2Details.userName": "",
            "pkConfig.host2Details.image": "",
            "pkConfig.host1Details.isProfilePicBanned": false,
            "pkConfig.host1Details.isVerified": false,
            "pkConfig.host2Details.gender": "",
            "pkConfig.host2Details.age": 0,
            "pkConfig.host2Details.countryFlagImage": "",
            "pkConfig.host2Details.country": "",
            "pkConfig.host2Details.uniqueId": "",
            "pkConfig.host2Details.coin": 0,
          },
        },
        { new: true },
      ),
      TopGifter.deleteMany({ liveHistoryId: liveUser.pkConfig.host1LiveId }),
      TopGifter.deleteMany({ liveHistoryId: liveUser.pkConfig.host2LiveId }),
    ]);
  }

  if (!liveUser.isAudio) {
    console.log("🎥 VIDEO LIVE");

    if (ioRef) {
      ioRef.in(roomId).emit("endLiveStream", streamPayload);
    }

    if (ioRef) {
      const sockets = await ioRef.in(roomId).fetchSockets();
      if (sockets.length) {
        ioRef.socketsLeave(roomId);
      }
    }

    if (liveUser.roomImage) {
      deleteFile(liveUser.roomImage);
    }

    await LiveStreamer.deleteOne({ userId, liveHistoryId });
  } else {
    console.log("🔊 AUDIO LIVE");

    io.in(liveUser._id.toString()).emit("audioSessionEnded", streamPayload);

    await handleParticipantRemovedForRoom({ liveUserObjId, clearAllSeats: true, emitEvents: false });
    await LiveStreamer.updateOne(
      { userId, liveHistoryId },
      {
        $set: {
          liveHistoryId: null,
          isHostActiveInRoom: false,
        },
      },
    );
  }

  const endTime = moment().tz("Asia/Kolkata").format();

  const start = moment.tz(liveHistory.startTime, "Asia/Kolkata");
  const end = moment.tz(endTime, "Asia/Kolkata");
  const duration = moment.utc(end.diff(start)).format("HH:mm:ss");

  await Promise.all([
    User.updateOne(
      { _id: user._id },
      {
        $set: {
          isLive: false,
          isBusy: false,
          liveHistoryId: null,
          liveStreamerId: null,
        },
      },
    ),
    LiveStreamerHistory.updateOne({ _id: liveHistory._id }, { $set: { endTime, duration } }),
    !liveUser.isAudio ? LiveStreamerView.deleteMany({ liveStreamerId: liveUserObjId }) : Promise.resolve(),
    !liveUser.isAudio ? LiveStreamComment.deleteMany({ liveStreamerId: liveUserObjId }) : Promise.resolve(),
    !liveUser.isAudio ? TopGifter.deleteMany({ liveHistoryId: liveHistory._id }) : Promise.resolve(),
  ]);

  return { ok: true };
}

//same behavior as socket "participantRemoved" — clear seat
async function handleParticipantRemovedForRoom({ liveUserObjId, userId = null, position = -1, mute = 0, clearAllSeats = false, extraEmitPayload = null, emitEvents = true }) {
  const liveUserObjIdOId = new mongoose.Types.ObjectId(liveUserObjId);
  const liveRoomId = liveUserObjIdOId.toString();
  const positionNum = Number(position);

  const clearedSeatFieldSet = {
    "seat.$.userId": null,
    "seat.$.name": "",
    "seat.$.userName": "",
    "seat.$.image": "",
    "seat.$.isProfilePicBanned": false,
    "seat.$.gender": "",
    "seat.$.age": 0,
    "seat.$.country": "",
    "seat.$.countryFlagImage": "",
    "seat.$.avtarFrameType": 0,
    "seat.$.avtarFrame": "",
    "seat.$.uniqueId": "",
    "seat.$.agoraUid": 0,
    "seat.$.isVerified": false,
    "seat.$.lock": false,
    "seat.$.reserved": false,
    "seat.$.invite": false,
  };

  let liveUser = null;

  if (clearAllSeats) {
    const roomDoc = await LiveStreamer.findById(liveUserObjIdOId).select("seat").lean();
    const occupiedSeats = (roomDoc?.seat || []).filter((s) => s?.userId != null);

    console.log(
      "[adminParticipantRemoved] clearing all occupied seats:",
      liveRoomId,
      occupiedSeats.length,
      occupiedSeats.map((s) => ({ position: s.position, userId: s.userId })),
    );

    for (const seat of occupiedSeats) {
      const updated = await LiveStreamer.findOneAndUpdate(
        {
          _id: liveUserObjIdOId,
          seat: { $elemMatch: { userId: seat.userId, position: seat.position } },
        },
        {
          $set: {
            ...clearedSeatFieldSet,
            "seat.$.mute": 0,
          },
        },
        { new: true },
      );

      if (updated) {
        liveUser = updated;
        console.log("[adminParticipantRemoved] cleared seat position:", seat.position);
      } else {
        console.log("[adminParticipantRemoved] failed to clear seat position:", seat.position);
      }
    }

    if (!liveUser) {
      liveUser = await LiveStreamer.findById(liveUserObjIdOId).lean();
    }

    const remainingOccupied = Array.isArray(liveUser?.seat) ? liveUser.seat.filter((s) => s?.userId != null).length : 0;
    if (remainingOccupied === 0) {
      console.log("[adminParticipantRemoved] all occupied seats cleared successfully");
    } else {
      console.log("[adminParticipantRemoved] some seats may still be occupied after clear:", remainingOccupied);
    }
  } else if (positionNum !== -1) {
    console.log("[adminParticipantRemoved] clearing single seat:", { liveRoomId, userId, position: positionNum });
    liveUser = await LiveStreamer.findOneAndUpdate(
      {
        _id: liveUserObjIdOId,
        seat: { $elemMatch: { userId: new mongoose.Types.ObjectId(userId), position: positionNum } },
      },
      {
        $set: {
          ...clearedSeatFieldSet,
          "seat.$.mute": mute || 0,
        },
      },
      { new: true },
    );

    if (liveUser) {
      console.log("[adminParticipantRemoved] LiveUser updated successfully");
    } else {
      console.log("[adminParticipantRemoved] LiveUser update failed or no matching document found");
      return { ok: false, liveUser: null, seatedUsers: [] };
    }
  } else {
    console.log("[adminParticipantRemoved] position -1, fetching live room without seat clear:", liveRoomId);
    liveUser = await LiveStreamer.findById(liveUserObjIdOId).lean();
  }

  const seatedUsers = await LiveStreamer.aggregate([
    { $match: { _id: liveUserObjIdOId } },
    { $unwind: "$seat" },
    { $match: { "seat.userId": { $ne: null } } },
    {
      $project: {
        _id: 1,
        "seat.userId": 1,
        "seat.name": 1,
        "seat.userName": 1,
        "seat.image": 1,
        "seat.isProfilePicBanned": 1,
        "seat.isVerified": 1,
      },
    },
  ]);

  console.log("[adminParticipantRemoved] seatedUsers count:", seatedUsers.length);

  if (emitEvents) {
    const ioRef = global.io;
    if (ioRef) {
      const emitSockets = ioRef.sockets.adapter.rooms.get(liveRoomId);
      console.log("[adminParticipantRemoved] before emit, room sockets:", emitSockets);

      ioRef.in(liveRoomId).emit("seatUpdate", liveUser);
      ioRef.in(liveRoomId).emit("seatedUsersUpdate", seatedUsers);

      console.log("[adminParticipantRemoved] global.io available");
    } else {
      console.log("[adminParticipantRemoved] global.io not available, skipped socket emits");
    }
  }

  console.log("[adminParticipantRemoved] done:", liveRoomId);
  return { ok: true, liveUser, seatedUsers };
}

//get live countries list
exports.fetchActiveLiveCountries = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const search = req.query.search ? req.query.search.trim() : "";
    const skip = (start - 1) * limit;

    const cacheKey = `active_live_countries_real:${start}:${limit}:${search}`;

    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      return res.status(200).json({
        status: true,
        message: "Live countries retrieved successfully from cache.",
        ...JSON.parse(cachedData),
      });
    }

    const matchStage = {
      $match: {
        $or: [
          { liveType: { $in: [1, 3, 4] } },
          {
            liveType: 2,
            isAudio: true,
            $or: [
              { isHostActiveInRoom: true },
              {
                seat: {
                  $elemMatch: {
                    userId: { $ne: null },
                  },
                },
              },
            ],
          },
        ],
      },
    };

    const pipeline = [
      matchStage,
      {
        $project: {
          country: 1,
          flag: "$countryFlagImage",
        },
      },
      {
        $match: {
          country: { $nin: ["", null] },
        },
      },
      {
        $group: {
          _id: "$country",
          country: { $first: "$country" },
          flag: { $first: "$flag" },
        },
      },
    ];

    if (search) {
      pipeline.push({
        $match: {
          country: { $regex: search, $options: "i" },
        },
      });
    }

    pipeline.push({
      $facet: {
        data: [
          { $sort: { country: 1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              country: 1,
              flag: 1,
            },
          },
        ],
        totalCount: [{ $count: "total" }],
      },
    });

    const result = await LiveStreamer.aggregate(pipeline);

    const countries = result[0]?.data || [];
    const total = result[0]?.totalCount[0]?.total || 0;

    const response = {
      status: true,
      message: "Live countries retrieved successfully.",
      total,
      data: countries,
    };

    await redis.set(cacheKey, JSON.stringify(response), { EX: 60 });

    return res.status(200).json(response);
  } catch (error) {
    console.error("Fetch Countries Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get overall dashboard stats
exports.fetchLiveStreamsSummary = async (req, res) => {
  try {
    const liveType = req.query.liveType?.trim()?.toLowerCase() || "all";
    const country = req.query.country?.trim();

    let countryFilter = {};

    if (country && country.toLowerCase() !== "global") {
      countryFilter = { country: country.toLowerCase() };
    }

    let liveTypeFilter = {};

    switch (liveType) {
      case "normal":
        liveTypeFilter = { liveType: 1 };
        break;

      case "audio":
        liveTypeFilter = {
          liveType: 2,
          isAudio: true,
          $or: [
            { isHostActiveInRoom: true },
            {
              seat: {
                $elemMatch: {
                  userId: { $ne: null },
                },
              },
            },
          ],
        };
        break;

      case "multi":
        liveTypeFilter = { liveType: 3 };
        break;

      case "calljoin":
      case "call-join":
        liveTypeFilter = { liveType: 4 };
        break;

      case "pk":
        liveTypeFilter = {
          liveType: { $nin: [2, 3, 4] },
          isPkMode: true,
        };
        break;

      case "all":
        liveTypeFilter = {
          $or: [
            { liveType: 1 },

            { liveType: 3 },

            { liveType: 4 },

            {
              liveType: { $nin: [2, 3, 4] },
              isPkMode: true,
            },

            {
              liveType: 2,
              isAudio: true,
              $or: [
                { isHostActiveInRoom: true },
                {
                  seat: {
                    $elemMatch: {
                      userId: { $ne: null },
                    },
                  },
                },
              ],
            },
          ],
        };
        break;

      default:
        return res.status(200).json({
          status: false,
          message: "Invalid liveType.",
        });
    }

    const pipeline = [
      { $match: liveTypeFilter },
      { $match: countryFilter },

      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                isBlock: 1,
              },
            },
          ],
          as: "user",
        },
      },

      { $unwind: "$user" },

      {
        $match: {
          "user.isBlock": false,
        },
      },

      {
        $lookup: {
          from: "livestreamerhistories",
          localField: "liveHistoryId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                receivedGifts: 1,
                earnedCoins: 1,
              },
            },
          ],
          as: "liveSessionStats",
        },
      },

      {
        $addFields: {
          _sessionHist: {
            $arrayElemAt: ["$liveSessionStats", 0],
          },
        },
      },

      {
        $group: {
          _id: null,

          liveNow: {
            $sum: 1,
          },

          totalViewers: {
            $sum: {
              $ifNull: ["$view", 0],
            },
          },

          totalGifts: {
            $sum: {
              $ifNull: ["$_sessionHist.receivedGifts", 0],
            },
          },

          totalRevenue: {
            $sum: {
              $ifNull: ["$_sessionHist.earnedCoins", 0],
            },
          },
        },
      },
    ];

    const result = await LiveStreamer.aggregate(pipeline);

    const summary = {
      liveNow: result[0]?.liveNow || 0,
      totalViewers: result[0]?.totalViewers || 0,
      totalGifts: result[0]?.totalGifts || 0,
      totalRevenue: result[0]?.totalRevenue || 0,
    };

    return res.status(200).json({
      status: true,
      message: "Live stream summary fetched successfully.",
      summary,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get live user list
exports.fetchLiveStreams = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const liveType = req?.query?.liveType?.trim()?.toLowerCase() || "all";

    const search = req.query.search?.trim();

    if (!liveType) {
      return res.status(200).json({ status: false, message: "liveType must be provided." });
    }

    if (isNaN(start) || start < 1) {
      return res.status(200).json({ status: false, message: "Invalid 'start' value." });
    }

    const country = req.query.country?.trim();

    let countryFilter = {};
    if (country && country.toLowerCase() !== "global") {
      countryFilter = { country: country.toLowerCase() };
    }

    let liveTypeFilter = {};
    switch (liveType) {
      case "normal":
        liveTypeFilter = { liveType: 1, isPkMode: false };
        break;

      case "audio":
        liveTypeFilter = {
          liveType: 2,
          isAudio: true,
          $or: [
            { isHostActiveInRoom: true },
            {
              seat: {
                $elemMatch: {
                  userId: { $ne: null },
                },
              },
            },
          ],
        };
        break;

      case "multi":
        liveTypeFilter = { liveType: 3 };
        break;

      case "calljoin":
      case "call-join":
        liveTypeFilter = { liveType: 4 };
        break;

      case "pk":
        liveTypeFilter = {
          liveType: { $nin: [2, 3, 4] },
          isPkMode: true,
        };
        break;

      case "all":
        liveTypeFilter = {
          $or: [
            // Normal live
            { liveType: 1 },

            // Multi-live
            { liveType: 3 },

            // Call-join
            { liveType: 4 },

            // PK live
            {
              liveType: { $nin: [2, 3, 4] },
              isPkMode: true,
            },

            // Audio live with condition
            {
              liveType: 2,
              isAudio: true,
              $or: [
                { isHostActiveInRoom: true },
                {
                  seat: {
                    $elemMatch: {
                      userId: { $ne: null },
                    },
                  },
                },
              ],
            },
          ],
        };
        break;

      default:
        return res.status(200).json({ status: false, message: "Invalid liveType." });
    }

    let fakeStreamTypeFilter = {};
    switch (liveType) {
      case "normal":
        fakeStreamTypeFilter.streamType = 1;
        break;
      case "audio":
        fakeStreamTypeFilter.streamType = 2;
        break;
      case "pk":
        fakeStreamTypeFilter.streamType = 3;
        break;
      case "follow":
      case "followLiveAudio":
        fakeStreamTypeFilter.streamType = 2;
        break;
      case "new":
        fakeStreamTypeFilter = {
          streamType: { $in: [1, 2, 3, 4] },
        };
        break;
      case "multi":
        fakeStreamTypeFilter.streamType = 4;
        break;
      case "calljoin":
      case "call-join":
        fakeStreamTypeFilter = { streamType: -1 };
        break;
      case "all":
        fakeStreamTypeFilter = { streamType: { $in: [1, 2, 3, 4] } };
        break;
      case "explore":
        break;
      default:
        fakeStreamTypeFilter = { streamType: -1 }; //Will match nothing
    }

    const startIndex = (start - 1) * limit;

    const pipeline = [
      { $match: liveTypeFilter },
      { $match: countryFilter },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                userName: 1,
                image: 1,
                uniqueId: 1,
                isVerified: 1,
                wealthLevel: 1,
                isBlock: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: "$user" },
      { $match: { "user.isBlock": false } },
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { "user.name": { $regex: search, $options: "i" } },
                  { "user.userName": { $regex: search, $options: "i" } },
                  { "user.uniqueId": { $regex: search, $options: "i" } },
                  { roomName: { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
        : []),
      {
        $lookup: {
          from: "wealthlevels",
          localField: "user.wealthLevel",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                levelName: 1,
                levelImage: 1,
              },
            },
          ],
          as: "wealthDetails",
        },
      },
      { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "livestreamerhistories",
          localField: "liveHistoryId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 0,
                sessionId: 1,
                receivedGifts: 1,
                earnedCoins: 1,
                viewerCount: 1,
                commentCount: 1,
                increasedFans: 1,
                startTime: 1,
              },
            },
          ],
          as: "liveSessionStats",
        },
      },
      {
        $addFields: {
          _sessionHist: { $arrayElemAt: ["$liveSessionStats", 0] },
        },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          liveHistoryId: 1,
          view: 1,
          liveType: 1,
          audioLiveType: 1,
          privateCode: 1,
          roomName: 1,
          roomWelcome: 1,
          bgTheme: 1,
          roomImage: 1,
          isHostActiveInRoom: 1,
          hostIsMuted: 1,
          seat: 1,
          isPkMode: 1,
          pkEndTime: 1,
          pkConfig: 1,
          requested: 1,
          name: "$user.name",
          userName: "$user.userName",
          image: "$user.image",
          uniqueId: "$user.uniqueId",
          wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
          wealthLevelName: { $ifNull: ["$wealthDetails.levelName", ""] },
          country: 1,
          countryFlagImage: 1,
          isFake: { $literal: false },
          sessionId: { $ifNull: ["$_sessionHist.sessionId", ""] },
          viewerCount: { $ifNull: ["$_sessionHist.viewerCount", 0] },
          commentCount: { $ifNull: ["$_sessionHist.commentCount", 0] },
          increasedFans: { $ifNull: ["$_sessionHist.increasedFans", 0] },
          startTime: { $ifNull: ["$_sessionHist.startTime", ""] },
          receivedGifts: { $ifNull: ["$_sessionHist.receivedGifts", 0] },
          earnedCoins: { $ifNull: ["$_sessionHist.earnedCoins", 0] },
          createdAt: 1,
        },
      },

      {
        $sort: {
          view: -1,
          createdAt: -1,
        },
      },
    ];

    const fakeUserCountryMatch = country && country.toLowerCase() !== "global" ? [{ $match: { "user.country": country.toLowerCase() } }] : [];

    const fakeSearchMatch = search
      ? [
          {
            $match: {
              $or: [
                { "user.name": { $regex: search, $options: "i" } },
                { "user.userName": { $regex: search, $options: "i" } },
                { "user.uniqueId": { $regex: search, $options: "i" } },
                { roomName: { $regex: search, $options: "i" } },
              ],
            },
          },
        ]
      : [];

    const realLiveUsersPromise = LiveStreamer.aggregate(pipeline);
    const fakeLiveUsersPromise = settingJSON.isDummyData
      ? FakeLiveStreamer.aggregate([
          {
            $match: {
              isStreaming: true,
              ...fakeStreamTypeFilter,
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "userId",
              foreignField: "_id",
              pipeline: [
                {
                  $project: {
                    name: 1,
                    userName: 1,
                    image: 1,
                    uniqueId: 1,
                    isVerified: 1,
                    wealthLevel: 1,
                    isBlock: 1,
                    country: 1,
                    countryFlagImage: 1,
                  },
                },
              ],
              as: "user",
            },
          },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
          // { $match: { "user.isBlock": false } },
          ...fakeUserCountryMatch,
          ...fakeSearchMatch,
          {
            $addFields: {
              view: {
                $add: [{ $floor: { $multiply: [{ $rand: {} }, 25] } }, 1],
              },
              viewerCount: {
                $add: [{ $floor: { $multiply: [{ $rand: {} }, 500] } }, 1],
              },
              commentCount: {
                $add: [{ $floor: { $multiply: [{ $rand: {} }, 120] } }, 1],
              },
              earnedCoins: {
                $add: [{ $floor: { $multiply: [{ $rand: {} }, 5000] } }, 1],
              },
              _sessionNum: {
                $add: [{ $floor: { $multiply: [{ $rand: {} }, 999] } }, 1],
              },
              audioLiveType: {
                $add: [{ $floor: { $multiply: [{ $rand: {} }, 2] } }, 1],
              },
              _startMinutesAgo: {
                $add: [{ $floor: { $multiply: [{ $rand: {} }, 180] } }, 1],
              },
            },
          },
          {
            $project: {
              _id: 1,
              userId: 1,
              liveHistoryId: { $literal: "" },
              view: 1,
              audioLiveType: 1,
              privateCode: { $literal: 0 },
              roomName: 1,
              roomWelcome: 1,
              bgTheme: { $literal: "" },
              roomImage: "$thumbnail",
              isHostActiveInRoom: { $literal: false },
              hostIsMuted: { $literal: false },
              isFake: { $literal: true },
              seat: { $literal: [] },
              isPkMode: { $eq: ["$streamType", 3] },
              pkEndTime: { $literal: null },
              pkConfig: { $literal: null },
              requested: { $literal: requestedDefault },
              name: "$user.name",
              userName: "$user.userName",
              image: "$user.image",
              uniqueId: "$user.uniqueId",
              wealthLevelImage: { $literal: "" },
              wealthLevelName: { $literal: "" },
              country: "$user.country",
              countryFlagImage: "$user.countryFlagImage",
              sessionId: {
                $concat: [
                  "live_",
                  {
                    $substr: [
                      { $concat: ["000", { $toString: "$_sessionNum" }] },
                      {
                        $subtract: [{ $strLenCP: { $concat: ["000", { $toString: "$_sessionNum" }] } }, 3],
                      },
                      3,
                    ],
                  },
                ],
              },
              viewerCount: 1,
              commentCount: 1,
              increasedFans: { $literal: 0 },
              startTime: {
                $dateToString: {
                  date: {
                    $dateSubtract: {
                      startDate: "$$NOW",
                      unit: "minute",
                      amount: "$_startMinutesAgo",
                    },
                  },
                  timezone: "Asia/Kolkata",
                  format: "%Y-%m-%dT%H:%M:%S",
                },
              },
              receivedGifts: { $literal: 0 },
              earnedCoins: 1,
              createdAt: 1,
              streamSource: 1,
              pkThumbnails: { $ifNull: ["$pkThumbnails", []] },
              pkStreamSources: { $ifNull: ["$pkStreamSources", []] },
              multiLiveThumbnails: { $ifNull: ["$multiLiveThumbnails", []] },
              multiLiveStreamSources: { $ifNull: ["$multiLiveStreamSources", []] },
            },
          },
          {
            $sort: {
              view: -1,
              createdAt: -1,
            },
          },
        ])
      : Promise.resolve([]);

    const [realLiveUsers, fakeLiveUsers] = await Promise.all([realLiveUsersPromise, fakeLiveUsersPromise]);

    const combined = [...realLiveUsers, ...fakeLiveUsers];

    combined.sort((a, b) => {
      // Real live first
      if (a.isFake !== b.isFake) {
        return a.isFake - b.isFake;
      }

      // Then by views
      const viewDiff = (b.view || 0) - (a.view || 0);
      if (viewDiff !== 0) return viewDiff;

      // Then latest
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    const total = combined.length;
    const liveUserList = combined.slice(startIndex, startIndex + limit);

    return res.status(200).json({
      status: true,
      message: "Live streams fetched successfully.",
      total,
      liveUserList,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//single live stream details by liveUserObjId
exports.fetchLiveStreamById = async (req, res) => {
  try {
    const liveUserObjId = req.query.liveUserObjId?.trim();

    if (!liveUserObjId) {
      return res.status(200).json({ status: false, message: "liveUserObjId must be provided." });
    }

    if (!mongoose.Types.ObjectId.isValid(liveUserObjId)) {
      return res.status(200).json({ status: false, message: "Invalid liveUserObjId." });
    }

    const liveUserObjIdOId = new mongoose.Types.ObjectId(liveUserObjId);

    const pipeline = [
      { $match: { _id: liveUserObjIdOId } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                userName: 1,
                image: 1,
                uniqueId: 1,
                isVerified: 1,
                wealthLevel: 1,
                isBlock: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: "$user" },
      { $match: { "user.isBlock": false } },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "user.wealthLevel",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                levelName: 1,
                levelImage: 1,
              },
            },
          ],
          as: "wealthDetails",
        },
      },
      { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "livestreamerhistories",
          localField: "liveHistoryId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 0,
                sessionId: 1,
                receivedGifts: 1,
                earnedCoins: 1,
                viewerCount: 1,
                commentCount: 1,
                increasedFans: 1,
                startTime: 1,
              },
            },
          ],
          as: "liveSessionStats",
        },
      },
      {
        $addFields: {
          _sessionHist: { $arrayElemAt: ["$liveSessionStats", 0] },
        },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          liveHistoryId: 1,
          view: 1,
          liveType: 1,
          audioLiveType: 1,
          privateCode: 1,
          roomName: 1,
          roomWelcome: 1,
          bgTheme: 1,
          roomImage: 1,
          isHostActiveInRoom: 1,
          hostIsMuted: 1,
          seat: 1,
          isPkMode: 1,
          pkEndTime: 1,
          pkConfig: 1,
          requested: 1,
          name: "$user.name",
          userName: "$user.userName",
          image: "$user.image",
          uniqueId: "$user.uniqueId",
          wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
          wealthLevelName: { $ifNull: ["$wealthDetails.levelName", ""] },
          country: 1,
          countryFlagImage: 1,
          sessionId: { $ifNull: ["$_sessionHist.sessionId", ""] },
          viewerCount: { $ifNull: ["$_sessionHist.viewerCount", 0] },
          commentCount: { $ifNull: ["$_sessionHist.commentCount", 0] },
          increasedFans: { $ifNull: ["$_sessionHist.increasedFans", 0] },
          startTime: { $ifNull: ["$_sessionHist.startTime", ""] },
          receivedGifts: { $ifNull: ["$_sessionHist.receivedGifts", 0] },
          earnedCoins: { $ifNull: ["$_sessionHist.earnedCoins", 0] },
        },
      },
      { $limit: 1 },
    ];

    const [liveUser] = await LiveStreamer.aggregate(pipeline);

    if (!liveUser) {
      return res.status(200).json({ status: false, message: "Live stream not found." });
    }

    return res.status(200).json({
      status: true,
      message: "Live stream fetched successfully.",
      liveUser,
    });
  } catch (error) {
    console.error("fetchLiveStreamById Error:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//check whether a user is live for a given session
exports.fetchUserLiveStatus = async (req, res) => {
  try {
    const userId = req.query.userId?.trim();
    const liveHistoryId = req.query.liveHistoryId?.trim();

    if (!userId || !liveHistoryId) {
      return res.status(200).json({ status: false, message: "userId and liveHistoryId must be provided." });
    }

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(liveHistoryId)) {
      return res.status(200).json({ status: false, message: "Invalid userId or liveHistoryId." });
    }

    const liveStreamer = await LiveStreamer.findOne({ userId, liveHistoryId }).lean();

    let liveStatus = false;

    if (liveStreamer && liveStreamer.isAudio) {
      liveStatus = liveStreamer.isHostActiveInRoom === true || liveStreamer.seat.some((seat) => seat.userId !== null);
    } else if (liveStreamer) {
      liveStatus = true;
    }

    return res.status(200).json({
      status: true,
      message: liveStatus ? "User is live." : "User is not live.",
      data: { userId, liveStatus },
    });
  } catch (error) {
    console.error("[fetchUserLiveStatus] Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//all users' live session history
exports.fetchAllLiveSessionHistory = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;

    if (isNaN(start) || start < 1) {
      return res.status(200).json({ status: false, message: "Invalid 'start' value." });
    }

    const userIdFilter = req.query.userId?.trim();
    const liveTypeRaw = req.query.liveType;
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";
    const search = req.query.search?.trim();

    const matchQuery = {};

    if (userIdFilter) {
      if (!mongoose.Types.ObjectId.isValid(userIdFilter)) {
        return res.status(400).json({ status: false, message: "Invalid userId." });
      }
      matchQuery.userId = new mongoose.Types.ObjectId(userIdFilter);
    }

    if (liveTypeRaw !== undefined && liveTypeRaw !== null && String(liveTypeRaw).trim() !== "") {
      const liveTypeStr = String(liveTypeRaw).trim().toLowerCase();

      if (liveTypeStr === "pk" || liveTypeStr === "pklive" || liveTypeStr === "pk-live") {
        matchQuery.isPkMode = true;
      } else {
        const lt = parseInt(liveTypeRaw, 10);
        if (!isNaN(lt)) {
          matchQuery.liveType = lt;
        }
      }
    }

    if (startDate !== "All" && endDate !== "All") {
      const startObj = new Date(startDate);
      const endObj = new Date(endDate);
      endObj.setHours(23, 59, 59, 999);
      matchQuery.createdAt = { $gte: startObj, $lte: endObj };
    }

    const startIndex = (start - 1) * limit;

    const pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, userName: 1, uniqueId: 1, image: 1, isVerified: 1 } }],
          as: "hostUser",
        },
      },
      { $unwind: { path: "$hostUser", preserveNullAndEmptyArrays: true } },
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { sessionId: { $regex: search, $options: "i" } },
                  { "hostUser.name": { $regex: search, $options: "i" } },
                  { "hostUser.userName": { $regex: search, $options: "i" } },
                  { "hostUser.uniqueId": { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
        : []),
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: startIndex },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                userId: 1,
                sessionId: 1,
                liveType: 1,
                isAudio: 1,
                isPkMode: 1,
                earnedCoins: 1,
                receivedGifts: 1,
                viewerCount: 1,
                commentCount: 1,
                increasedFans: 1,
                startTime: 1,
                endTime: 1,
                duration: 1,
                createdAt: 1,
                updatedAt: 1,
                hostUser: 1,
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ];

    const result = await LiveStreamerHistory.aggregate(pipeline);
    const liveHistoryList = result[0]?.data || [];
    const total = result[0]?.total[0]?.count || 0;

    return res.status(200).json({
      status: true,
      message: "Live session history fetched successfully.",
      total,
      liveHistoryList,
    });
  } catch (error) {
    console.error("fetchAllLiveSessionHistory Error:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//live end
exports.terminateLiveStream = async (req, res) => {
  try {
    const { userId, liveHistoryId, liveUserObjId } = req.body || {};

    if (!userId || !liveHistoryId || !liveUserObjId) {
      return res.status(400).json({
        status: false,
        message: "userId, liveHistoryId and liveUserObjId are required.",
      });
    }

    const host = await User.findById(userId).select("isLive liveHistoryId liveStreamerId fcmToken isBlock isPushNotificationEnabled name userName").lean();

    if (!host) {
      return res.status(404).json({ status: false, message: "User not found." });
    }

    if (!host.isLive) {
      return res.status(400).json({
        status: false,
        message: "User is not currently live.",
      });
    }

    if (!host.liveHistoryId || !host.liveStreamerId) {
      return res.status(400).json({
        status: false,
        message: "User is marked live but liveHistoryId or liveStreamerId is missing.",
      });
    }

    if (String(host.liveHistoryId) !== String(liveHistoryId) || String(host.liveStreamerId) !== String(liveUserObjId)) {
      return res.status(400).json({
        status: false,
        message: "Live session details do not match this user's current live state.",
      });
    }

    const ioRef = global.io;
    if (ioRef) {
      const sockets = await ioRef.in(liveUserObjId.toString()).fetchSockets();
      console.log(`🔄 Active sockets in room (${liveUserObjId}) adminEndLiveStream: ${sockets.length}`);
    }

    if (!mongoose.Types.ObjectId.isValid(liveUserObjId)) {
      return res.status(400).json({ status: false, message: "Invalid liveUserObjId." });
    }

    const liveUserObjIdOId = new mongoose.Types.ObjectId(liveUserObjId);
    const liveRoom = await LiveStreamer.findById(liveUserObjIdOId).select("liveType isAudio isHostActiveInRoom liveHistoryId seat").lean();

    const hasOccupiedSeat = Array.isArray(liveRoom?.seat) && liveRoom.seat.some((s) => s && s.userId != null);
    const isActiveAudioLive = liveRoom?.liveType === 2 && liveRoom?.isAudio === true && liveRoom?.liveHistoryId != null && (liveRoom?.isHostActiveInRoom === true || hasOccupiedSeat);

    if (isActiveAudioLive) {
      const liveRoomId = liveUserObjId.toString();
      console.log("[terminateLiveStream] active audio live, running participantRemoved flow:", {
        liveRoomId,
        hasOccupiedSeat,
        isHostActiveInRoom: liveRoom?.isHostActiveInRoom,
      });

      const terminatePayload = {
        listenMessage: "This live has been ended by an administrator.",
        position: -1,
        liveUserObjId: liveRoomId,
      };

      const participantRemovedResult = await handleParticipantRemovedForRoom({
        liveUserObjId,
        userId,
        position: -1,
        clearAllSeats: true,
        extraEmitPayload: terminatePayload,
      });
    }

    const result = await performAdminEndLiveSession({
      userId,
      liveHistoryId,
      liveUserObjId,
      endLiveStreamPayload: {
        bannedByAdmin: false,
        endMessage: "This live has been ended by an administrator.",
      },
    });

    if (!result.ok) {
      return res.status(result.status).json({ status: false, message: result.message });
    }

    res.status(200).json({
      status: true,
      message: "Live stream ended successfully by admin.",
    });

    if (host?.fcmToken && !host?.isBlock && host?.isPushNotificationEnabled) {
      const terminateNotifyPayload = {
        token: host.fcmToken,
        notification: {
          title: "🔴 Live Session Ended",
          body: "👮 An administrator ended your live stream. Open the app for details.",
        },
        data: {
          type: "LIVE_TERMINATED_BY_ADMIN",
          userId: String(userId),
          liveHistoryId: String(liveHistoryId),
          liveUserObjId: String(liveUserObjId),
          userName: String(host?.userName || ""),
          name: String(host?.name || ""),
        },
      };

      const adminPromise = await admin;
      adminPromise
        .messaging()
        .send(terminateNotifyPayload)
        .then((response) => {
          console.log("[terminateLiveStream] host notification sent:", response);
        })
        .catch((error) => {
          console.log("[terminateLiveStream] host notification error:", error);
        });
    }
  } catch (error) {
    console.error("❌ Admin End Live Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//remove audio-room participant from seat (same behavior as socket "participantRemoved")
exports.removeLiveParticipant = async (req, res) => {
  try {
    const { liveUserObjId, userId, position } = req.body || {};

    if (!liveUserObjId || !userId || position === undefined || position === null) {
      return res.status(400).json({ status: false, message: "liveUserObjId, userId, and position are required." });
    }

    const positionNum = Number(position);
    if (Number.isNaN(positionNum)) {
      return res.status(400).json({ status: false, message: "position must be a number." });
    }

    if (!mongoose.Types.ObjectId.isValid(liveUserObjId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ status: false, message: "Invalid liveUserObjId or userId." });
    }

    const liveUserObjIdOId = new mongoose.Types.ObjectId(liveUserObjId);

    const liveRoom = await LiveStreamer.findById(liveUserObjIdOId).select("liveType isAudio isHostActiveInRoom liveHistoryId seat").lean();

    if (!liveRoom) {
      return res.status(404).json({ status: false, message: "Live room not found." });
    }

    const hasOccupiedSeat = Array.isArray(liveRoom.seat) && liveRoom.seat.some((s) => s && s.userId != null);
    const isActiveAudioLive = liveRoom.liveType === 2 && liveRoom.isAudio === true && liveRoom.liveHistoryId != null && (liveRoom.isHostActiveInRoom === true || hasOccupiedSeat);

    if (!isActiveAudioLive) {
      return res.status(400).json({ status: false, message: "Live room is not an active audio live." });
    }

    const liveRoomId = liveUserObjId.toString();

    const listenMessage = positionNum !== -1 ? "A participant was removed from this room by an administrator." : "Room seats were refreshed by an administrator.";

    const removedByAdminPayload = {
      listenMessage,
      position: positionNum,
      liveUserObjId: liveRoomId,
    };

    const result = await handleParticipantRemovedForRoom({
      liveUserObjId,
      userId,
      position: positionNum,
      extraEmitPayload: removedByAdminPayload,
    });

    if (!result.ok) {
      return res.status(400).json({ status: false, message: "No matching participant on that seat." });
    }

    return res.status(200).json({
      status: true,
      message: "Participant removed successfully.",
    });
  } catch (error) {
    console.error("Admin removeLiveParticipant Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//ban live user
exports.banLiveUser = async (req, res) => {
  try {
    const { userId, reason } = req.body || {};
    const banReason = reason || "Violation of guidelines";
    const banEndMessage = "This live has ended. The host was banned by an administrator.";

    if (!userId) {
      return res.status(400).json({
        status: false,
        message: "userId is required.",
      });
    }

    const user = await User.findById(userId).select("_id isLive liveHistoryId liveStreamerId fcmToken isBlock isPushNotificationEnabled name userName").lean();

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }

    if (!user.isLive) {
      return res.status(400).json({
        status: false,
        message: "User is not currently live.",
      });
    }

    if (!user.liveHistoryId || !user.liveStreamerId) {
      return res.status(400).json({
        status: false,
        message: "User is marked live but liveHistoryId or liveStreamerId is missing.",
      });
    }

    const endResult = await performAdminEndLiveSession({
      userId,
      liveHistoryId: user.liveHistoryId,
      liveUserObjId: user.liveStreamerId,
      endLiveStreamPayload: {
        bannedByAdmin: true,
        endMessage: banEndMessage,
        banReason,
      },
    });

    if (!endResult.ok) {
      return res.status(endResult.status).json({
        status: false,
        message: endResult.message,
      });
    }

    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isLiveBanned: true,
          liveBanReason: banReason,
          liveBanAt: new Date(),
        },
      },
    );

    res.status(200).json({
      status: true,
      message: "User has been banned from live streaming.",
      banReason,
      endMessage: banEndMessage,
    });

    if (user?.fcmToken && !user?.isBlock && user?.isPushNotificationEnabled) {
      const banNotifyPayload = {
        token: user.fcmToken,
        notification: {
          title: "⛔ Live Access Blocked",
          body: `🚫 You cannot go live right now. Reason: ${banReason}`,
        },
        data: {
          type: "LIVE_BANNED_BY_ADMIN",
          userId: String(userId),
          liveHistoryId: String(user.liveHistoryId),
          liveUserObjId: String(user.liveStreamerId),
          userName: String(user?.userName || ""),
          name: String(user?.name || ""),
          banReason: String(banReason),
        },
      };

      const adminPromise = await admin;
      adminPromise
        .messaging()
        .send(banNotifyPayload)
        .then((response) => {
          console.log("[banLiveUser] host notification sent:", response);
        })
        .catch((error) => {
          console.log("[banLiveUser] host notification error:", error);
        });
    }
  } catch (error) {
    console.error("Admin Ban Live Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//unban live user
exports.unbanLiveUser = async (req, res) => {
  try {
    const { userId } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        status: false,
        message: "userId is required.",
      });
    }

    const user = await User.findById(userId).select("_id isLiveBanned fcmToken isBlock isPushNotificationEnabled name userName").lean();

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }

    if (!user.isLiveBanned) {
      return res.status(400).json({
        status: false,
        message: "User is not live banned.",
      });
    }

    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isLiveBanned: false,
        },
        $unset: {
          liveBanReason: "",
          liveBanBy: "",
          liveBanAt: "",
          liveBanUntil: "",
        },
      },
    );

    res.status(200).json({
      status: true,
      message: "User unbanned successfully. User can go live now.",
    });

    if (user?.fcmToken && !user?.isBlock && user?.isPushNotificationEnabled) {
      const unbanNotifyPayload = {
        token: user.fcmToken,
        notification: {
          title: "🟢 Live Access Restored",
          body: "🎬 Good news! Your live ban is lifted — you can go live again anytime.",
        },
        data: {
          type: "LIVE_UNBANNED_BY_ADMIN",
          userId: String(userId),
          userName: String(user?.userName || ""),
          name: String(user?.name || ""),
        },
      };

      const adminPromise = await admin;
      adminPromise
        .messaging()
        .send(unbanNotifyPayload)
        .then((response) => {
          console.log("[unbanLiveUser] host notification sent:", response);
        })
        .catch((error) => {
          console.log("[unbanLiveUser] host notification error:", error);
        });
    }
  } catch (error) {
    console.error("Unban Live Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get live banned users
exports.fetchBannedLiveUsers = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const search = req.query.search ? req.query.search.trim() : "";

    const skip = (start - 1) * limit;

    const matchStage = {
      isLiveBanned: true,
    };

    if (search) {
      matchStage.$or = [{ uniqueId: { $regex: search, $options: "i" } }, { name: { $regex: search, $options: "i" } }, { userName: { $regex: search, $options: "i" } }];
    }

    const pipeline = [
      {
        $match: matchStage,
      },
      {
        $facet: {
          totalCount: [{ $count: "total" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                name: 1,
                userName: 1,
                uniqueId: 1,
                image: 1,
                email: 1,
                countryFlagImage: 1,
                country: 1,
                isLiveBanned: 1,
                liveBanReason: 1,
                liveBanAt: 1,
              },
            },
          ],
        },
      },
    ];

    const result = await User.aggregate(pipeline);

    const users = result[0]?.data || [];
    const total = result[0]?.totalCount[0]?.total || 0;

    const mock = String(req.query.mock || "")
      .trim()
      .toLowerCase();
    const shouldMock = mock === "1" || mock === "true";

    if (shouldMock) {
      const now = Date.now();
      const firstNames = ["Aarav", "Vivaan", "Aditya", "Arjun", "Ishaan", "Reyansh", "Anaya", "Diya", "Ira", "Aadhya", "Myra", "Kiara"];
      const lastNames = ["Sharma", "Patel", "Singh", "Gupta", "Khan", "Mehta", "Jain", "Verma", "Iyer", "Reddy"];
      const reasons = ["Inappropriate content", "Community guideline violation", "Abusive language", "Spam activity", "Suspicious behavior"];
      const countryCodes = ["in", "us", "gb", "ca", "au", "de", "fr", "it", "es", "br", "mx", "id", "my", "sg", "th", "ph", "vn", "za", "ng", "ae"];

      const mockUsers = Array.from({ length: 20 }).map((_, i) => {
        const f = firstNames[(i + start) % firstNames.length];
        const l = lastNames[(i + limit) % lastNames.length];
        const name = `${f} ${l}`;
        const base = `${f}${l}`.toLowerCase();
        const suffix = ((start - 1) * 20 + i + 11) % 9999;
        const userName = `@${base}${suffix ? suffix : ""}`;
        const uniqueId = String(100000 + ((start - 1) * 20 + i));
        const liveBanAt = new Date(now - (i + 1) * 36 * 60 * 60 * 1000);
        const liveBanReason = reasons[i % reasons.length];
        const country = countryCodes[Math.floor(Math.random() * countryCodes.length)];

        return {
          _id: new mongoose.Types.ObjectId(),
          name,
          userName,
          uniqueId,
          image: "",
          email: `${base}${suffix ? suffix : ""}@gmail.com`,
          countryFlagImage: `https://flagcdn.com/w40/${country}.png`,
          country,
          isLiveBanned: true,
          liveBanReason,
          liveBanAt,
        };
      });

      return res.status(200).json({
        status: true,
        message: "Live banned users retrieved successfully.",
        total: total + 20,
        data: [...users, ...mockUsers],
      });
    }

    return res.status(200).json({
      status: true,
      message: "Live banned users retrieved successfully.",
      total,
      data: users,
    });
  } catch (error) {
    console.error("Get Live Banned Users Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
