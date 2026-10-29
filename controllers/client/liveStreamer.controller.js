const mongoose = require("mongoose");
const moment = require("moment-timezone");
const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const { buildTencentBlock, isTencentEnabled } = require("../../util/tencentUserSig");

const LiveStreamer = require("../../models/liveStreamer.model");
const LiveStreamerHistory = require("../../models/liveStreamerHistory.model");
const LiveStreamerView = require("../../models/liveStreamerView.model");
const LiveStreamComment = require("../../models/liveStreamComment.model");
const User = require("../../models/user.model");
const FollowerFollowing = require("../../models/followerFollowing.model");
const FakeLiveStreamer = require("../../models/fakeLiveStreamer.model");
const TopGifter = require("../../models/topGifter.model");
const PkOpponent = require("../../models/pkOpponent.model");

const admin = require("../../util/privateKey");
const redis = require("../../util/redis");

const fs = require("fs");

const { deleteFile } = require("../../util/deletefile");
const { getPkAvailability } = require("../../util/pkAvailability");

const generateSessionId = async (userId) => {
  const lastSession = await LiveStreamerHistory.findOne({ userId }).sort({ createdAt: -1 }).select("sessionId").lean();

  let newSessionNumber = 1;
  if (lastSession && lastSession.sessionId) {
    const parts = lastSession.sessionId.split("_");
    const lastNumber = parseInt(parts[1], 10) || 0;
    newSessionNumber = lastNumber + 1;
  }

  return `live_${newSessionNumber.toString().padStart(3, "0")}`;
};

//live user ( video live / pk battle / multi )
exports.startLiveStream = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    const { liveType, channel, agoraUID } = req.query;

    if (!liveType || !channel || !agoraUID) {
      return res.status(200).json({ status: false, message: "Invalid request parameters." });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);

    const role = RtcRole.PUBLISHER;
    const uid = 0;
    const expirationTimeInSeconds = 24 * 3600;
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + expirationTimeInSeconds;

    const [user, sessionId, token, existingLiveUser] = await Promise.all([
      User.findById(userObjectId).select("userName name role agencyId country countryFlagImage isLiveBanned liveBanReason liveBanUntil"),
      generateSessionId(userObjectId),
      RtcTokenBuilder.buildTokenWithUid(settingJSON?.agoraAppId, settingJSON?.agoraAppCertificate, channel, uid, role, privilegeExpiredTs),
      LiveStreamer.findOne({ userId: userObjectId }).select("_id"),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user?.isLiveBanned && (!user?.liveBanUntil || new Date(user.liveBanUntil) > new Date())) {
      return res.status(200).json({
        status: false,
        message: "You are banned from going live by the admin.",
      });
    }

    if (existingLiveUser) {
      await existingLiveUser.deleteOne();
    }

    const liveHistoryData = {
      sessionId,
      userId: userObjectId,
      agencyId: user?.agencyId,
      liveType,
      startTime: moment().tz("Asia/Kolkata").format(),
    };

    if (user.role.includes(2) && user.agencyId) {
      liveHistoryData.agencyId = user.agencyId;
    }

    const liveHistory = new LiveStreamerHistory(liveHistoryData);

    // Build Tencent block if enabled (before creating LiveStreamer so we can store roomId)
    let tencentBlock = null;
    if (isTencentEnabled()) {
      try {
        tencentBlock = buildTencentBlock(
          userObjectId.toString(),
          null,
          "live",
          liveHistory._id.toString()
        );
      } catch (tencentError) {
        console.error("Error building Tencent block:", tencentError);
      }
    }

    const newLiveUser = new LiveStreamer({
      userId: userObjectId,
      liveHistoryId: liveHistory._id,
      liveType: liveType,
      token: token,
      channel: channel,
      agoraUid: agoraUID,
      country: user.country.toLowerCase() || "",
      countryFlagImage: user?.countryFlagImage || "",
      tencentRoomId: tencentBlock?.roomId || "",
      tencentUserId: tencentBlock?.userId || "",
    });

    res.status(200).json({
      status: true,
      message: "Live stream started successfully.",
      data: newLiveUser,
      tencent: tencentBlock,
    });

    await Promise.all([
      liveHistory.save(),
      newLiveUser.save(),
      User.updateOne(
        { _id: userObjectId },
        {
          $set: {
            isBusy: true,
            isLive: true,
            liveHistoryId: liveHistory._id,
            liveStreamerId: newLiveUser._id,
          },
        },
      ),
    ]);

    const followers = await FollowerFollowing.find({ toUserId: userObjectId }).distinct("fromUserId");

    if (followers.length === 0) {
      console.log("No followers found.");
      return;
    }

    const followerTokens = await User.find({
      _id: { $in: followers },
      isBlock: false,
      isPushNotificationEnabled: true,
      fcmToken: { $ne: null },
    }).distinct("fcmToken");

    if (followerTokens.length === 0) {
      console.log("No valid FCM tokens found.");
      return;
    }

    if (followerTokens.length !== 0) {
      const titleMessages = [
        "🚨 Live Session Just Went Live! 🎥",
        "🎤 Join the Live Event—It’s Happening Now! 🔴",
        "🌟 Don't Miss the Action—Live Streaming Now! 🚀",
        "🔥 An Exclusive Live Session is On! Tune In! 🎬",
      ];

      const bodyMessages = [
        `🚀 Tap to join the live session and experience it now! 🎉`,
        `🔥 Get ready to engage, interact, and enjoy! Watch now! 🎥`,
        `✨ A special moment is live—don’t miss out! Join now! 🚀📺`,
        `🎬 The live stream is on! Be part of the excitement! 🔥`,
      ];

      const title = titleMessages[Math.floor(Math.random() * titleMessages.length)];
      const body = bodyMessages[Math.floor(Math.random() * bodyMessages.length)];

      const payload = {
        tokens: followerTokens,
        notification: {
          // title: title,
          // body: body,
          title: `${user?.name ? user.name : "Someone"} 🚀 just went LIVE!`,
          body: `🎥 Join the fun and don’t miss out on the action!`,
        },
        data: {
          type: "LIVE",
          liveType: String(liveType),
          liveHistoryId: String(liveHistory._id),
          liveUserObjId: String(newLiveUser._id),
          userId: String(userObjectId),
          userName: String(user?.userName),
          name: String(user?.name),
        },
      };

      const adminPromise = await admin;
      adminPromise
        .messaging()
        .sendEachForMulticast(payload)
        .then((response) => {
          console.log("Successfully sent with response: ", response);

          if (response.failureCount > 0) {
            response.responses.forEach((res, index) => {
              if (!res.success) {
                console.error(`Error for token`, res.error.message);
              }
            });
          }
        })
        .catch((error) => {
          console.log("Error sending message:      ", error);
        });
    }
  } catch (error) {
    console.error("Start Live Error:", error);
    res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//live user ( audio live )
exports.initializeLiveStream = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    const { liveType, channel, agoraUID, audioLiveType, privateCode, roomName, roomWelcome, bgTheme } = req.body;
    if (!liveType || !channel || !agoraUID) {
      return res.status(200).json({ status: false, message: "Invalid request parameters." });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
    const role = RtcRole.PUBLISHER;
    const uid = 0;
    const expirationTimeInSeconds = 24 * 3600;
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + expirationTimeInSeconds;

    const [user, sessionId, token, existingLiveUser] = await Promise.all([
      User.findById(userObjectId).select("name userName role agencyId country countryFlagImage isLiveBanned liveBanReason liveBanUntil"),
      generateSessionId(userObjectId),
      RtcTokenBuilder.buildTokenWithUid(settingJSON?.agoraAppId, settingJSON?.agoraAppCertificate, channel, uid, role, privilegeExpiredTs),
      LiveStreamer.findOne({
        userId: userObjectId,
        liveType: 2,
        isAudio: true,
      }),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user?.isLiveBanned && (!user?.liveBanUntil || new Date(user.liveBanUntil) > new Date())) {
      return res.status(200).json({
        status: false,
        message: "You are banned from going live by the admin.",
      });
    }

    if (!sessionId || !token) {
      return res.status(200).json({ status: false, message: "Error generating session/token." });
    }

    const liveHistoryData = {
      sessionId,
      userId: userObjectId,
      agencyId: user?.agencyId,
      liveType,
      isAudio: true,
      startTime: moment().tz("Asia/Kolkata").format(),
    };

    if (user?.role?.includes(2) && user.agencyId) {
      liveHistoryData.agencyId = user.agencyId;
    }

    const liveHistory = new LiveStreamerHistory(liveHistoryData);

    let liveUser;
    if (!existingLiveUser) {
      console.log("If no existing live user, create a new one");

      liveUser = new LiveStreamer({
        userId: userObjectId,
        liveType,
        isAudio: true,
        liveHistoryId: liveHistory._id,
        agoraUid: agoraUID,
        channel,
        token,
        audioLiveType,
        privateCode,
        roomName,
        roomWelcome,
        roomImage: req.file ? req.file.path : "",
        bgTheme: bgTheme || "",
      });
    } else {
      console.log("Update existing user");

      existingLiveUser.isAudio = true;
      existingLiveUser.liveHistoryId = liveHistory._id;
      existingLiveUser.agoraUid = agoraUID || existingLiveUser.agoraUid;
      existingLiveUser.channel = channel || existingLiveUser.channel;
      existingLiveUser.token = token || existingLiveUser.token;
      existingLiveUser.audioLiveType = audioLiveType || existingLiveUser.audioLiveType;
      existingLiveUser.privateCode = privateCode || existingLiveUser.privateCode;
      existingLiveUser.roomName = roomName || existingLiveUser.roomName;
      existingLiveUser.roomWelcome = roomWelcome || existingLiveUser.roomWelcome;
      existingLiveUser.roomImage = req.file ? req.file.path : existingLiveUser.roomImage;
      existingLiveUser.bgTheme = bgTheme || "";

      liveUser = existingLiveUser;
    }

    liveUser.country = user.country.toLowerCase() || "";
    liveUser.countryFlagImage = user?.countryFlagImage || "";

    // Build Tencent block if enabled
    let tencentBlock = null;
    if (isTencentEnabled()) {
      try {
        tencentBlock = buildTencentBlock(
          userObjectId.toString(),
          null,
          "audio",
          liveHistory._id.toString()
        );
        // Store Tencent roomId in the liveUser
        liveUser.tencentRoomId = tencentBlock?.roomId || "";
        liveUser.tencentUserId = tencentBlock?.userId || "";
      } catch (tencentError) {
        console.error("Error building Tencent block:", tencentError);
      }
    }

    res.status(200).json({
      status: true,
      message: "Live stream initialized successfully.",
      data: liveUser._doc,
      tencent: tencentBlock,
    });

    await Promise.all([
      liveUser.save(),
      liveHistory.save(),
      User.updateOne(
        { _id: userObjectId },
        {
          $set: {
            isBusy: true,
            isLive: true,
            liveHistoryId: liveHistory._id,
            liveStreamerId: liveUser._id,
          },
        },
      ),
    ]);

    // Notify followers
    const followers = await FollowerFollowing.find({ toUserId: userObjectId }).distinct("fromUserId").lean();
    if (!followers.length) return;

    const followerTokens = await User.find({
      _id: { $in: followers },
      isBlock: false,
      isPushNotificationEnabled: true,
      fcmToken: { $ne: null },
    })
      .select("fcmToken")
      .lean();

    if (!followerTokens.length) return;

    const messages = [
      "🚨 Live Session Just Went Live! 🎥",
      "🎤 Join the Live Event—It’s Happening Now! 🔴",
      "🌟 Don't Miss the Action—Live Streaming Now! 🚀",
      "🔥 An Exclusive Live Session is On! Tune In! 🎬",
    ];

    const title = messages[Math.floor(Math.random() * messages.length)];
    const displayName = user?.name?.trim() || "A talented creator";

    const payload = {
      tokens: followerTokens.map((u) => u.fcmToken),
      notification: {
        title: `🎬 ${displayName} is broadcasting live!`,
        body: "🚀 Tap to join the live session and experience it now! 🎉",
      },
      data: {
        type: "LIVE",
        liveType: String(liveType),
        liveHistoryId: String(liveHistory._id),
        liveUserObjId: String(liveUser._id),
        userId: String(userObjectId),
        userName: String(user?.userName),
        name: String(user?.name),
      },
    };

    const adminInstance = await admin;
    adminInstance
      .messaging()
      .sendEachForMulticast(payload)
      .then((response) => {
        if (response.failureCount > 0) {
          console.warn("Some FCM messages failed to send.");
        }
      })
      .catch((error) => {
        console.error("FCM Error:", error);
      });
  } catch (error) {
    console.error("Live Stream Initialization Error:", error);
    res.status(500).json({ status: false, error: "Internal Server Error" });
  }
};

//update audio room info
exports.updateAudioRoomInfo = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    const { liveHistoryId, privateCode, roomName, roomWelcome } = req.body;
    if (!liveHistoryId) {
      return res.status(200).json({ status: false, message: "Live history ID is required." });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);

    const existingLiveUser = await LiveStreamer.findOne({
      userId: userObjectId,
      liveHistoryId,
      liveType: 2,
      isAudio: true,
    });

    if (!existingLiveUser) {
      return res.status(200).json({ status: false, message: "Audio room not found." });
    }

    existingLiveUser.privateCode = privateCode || existingLiveUser.privateCode;
    existingLiveUser.roomName = roomName || existingLiveUser.roomName;
    existingLiveUser.roomWelcome = roomWelcome || existingLiveUser.roomWelcome;
    existingLiveUser.roomImage = req.file ? req.file.path : existingLiveUser.roomImage;
    await existingLiveUser.save();

    res.status(200).json({
      status: true,
      message: "Audio room information updated successfully.",
      data: existingLiveUser,
    });

    io.in(existingLiveUser._id.toString()).emit("seatUpdate", existingLiveUser);
  } catch (error) {
    console.error("Update Audio Room Info Error:", error);
    res.status(500).json({ status: false, error: "Internal Server Error" });
  }
};

//get live user list
exports.fetchLiveStreamers = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const liveType = req.query.liveType?.trim();

    if (!liveType) {
      return res.status(200).json({ status: false, message: "liveType must be provided." });
    }

    if (isNaN(start) || start < 1) {
      return res.status(200).json({ status: false, message: "Invalid 'start' value. It must be a positive integer (minimum 1)." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const country = req.query.country?.trim();

    let countryFilter = {};
    if (country && country.toLowerCase() !== "global") {
      countryFilter = { country: country.toLowerCase() };
    }

    let liveTypeFilter = {};
    switch (liveType) {
      case "normal":
        liveTypeFilter = {
          liveType: 1,
          userId: { $ne: userId },
        };
        break;
      case "audio":
        liveTypeFilter = {
          userId: { $ne: userId },
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
      case "pk":
        liveTypeFilter = {
          liveType: { $nin: [2, 3, 4] },
          isPkMode: true,
          userId: { $ne: userId },
        };
        break;
      case "follow":
        liveTypeFilter = {
          userId: { $ne: userId },
          $or: [
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
            {
              liveType: { $in: [1, 3, 4] },
            },
          ],
        };
        break;
      case "followLiveAudio":
        liveTypeFilter = {
          userId: { $ne: userId },
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
      case "new":
        liveTypeFilter = {
          userId: { $ne: userId },
          $or: [
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
            {
              liveType: { $in: [1, 3, 4] },
            },
          ],
        };
        break;
      case "explore":
        liveTypeFilter = {
          userId: { $ne: userId },
          $or: [
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
            {
              liveType: { $in: [1, 3, 4] },
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
      case "explore":
        break;
      default:
        fakeStreamTypeFilter = { streamType: -1 }; //Will match nothing
    }

    const pipeline = [
      { $match: liveTypeFilter },
      { $match: countryFilter },
      {
        $lookup: {
          from: "blocks",
          localField: "userId",
          foreignField: "toUserId",
          pipeline: [{ $match: { userId: userId } }], //it finds blocks where the live streamer is blocked by the current user
          as: "isBlocked",
        },
      },
      {
        $match: {
          isBlocked: { $eq: [] },
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
                isBlock: 1,
                // country: 1,
                // countryFlagImage: 1,
                uniqueId: 1,
                isVerified: 1,
                isFake: 1,
                wealthLevel: 1,
                activeAvtarFrame: 1,
                isProfilePicBanned: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
      { $match: { "user.isBlock": false } },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "user.wealthLevel",
          foreignField: "_id",
          pipeline: [{ $project: { image: 1, name: 1 } }],
          as: "wealthDetails",
        },
      },
      { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "avtarframes",
          localField: "user.activeAvtarFrame",
          foreignField: "_id",
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "userId",
          foreignField: "toUserId",
          pipeline: [{ $match: { fromUserId: userId } }], //if the current user is following the live streamer
          as: "isFollow",
        },
      },
      {
        $project: {
          _id: 1,
          liveHistoryId: 1,
          view: 1,
          liveType: 1,
          audioLiveType: 1,
          privateCode: 1,
          roomName: 1,
          roomWelcome: 1,
          roomImage: 1,
          isPkMode: 1,
          pkStatus: { $ifNull: ["$pkStatus", ""] },
          pkRound: { $ifNull: ["$pkRound", 0] },
          host1Wins: { $ifNull: ["$pkConfig.host1Wins", 0] },
          host2Wins: { $ifNull: ["$pkConfig.host2Wins", 0] },
          userId: 1,
          bgTheme: 1,
          admins: {
            $map: {
              input: { $ifNull: ["$admins", []] },
              as: "admin",
              in: "$$admin.adminUserId",
            },
          },
          blockedUsers: {
            $map: {
              input: { $ifNull: ["$blockedUsers", []] },
              as: "blocked",
              in: "$$blocked.blockedUserId",
            },
          },
          name: "$user.name",
          userName: "$user.userName",
          image: "$user.image",
          isProfilePicBanned: "$user.isProfilePicBanned",
          countryFlagImage: 1,
          country: 1,
          uniqueId: "$user.uniqueId",
          isVerified: "$user.isVerified",
          isFake: "$user.isFake",
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          host2Name: "$pkConfig.host2Name",
          host2userName: "$pkConfig.host2userName",
          host2Image: "$pkConfig.host2Image",
          host2isProfilePicBanned: "$pkConfig.host2Details.isProfilePicBanned",
          host2AvtarFrame: { $ifNull: ["$pkConfig.host2Details.avtarFrame", ""] },
          host2AvtarFrameType: { $ifNull: ["$pkConfig.host2Details.avtarFrameType", 0] },
          host2TencentRoomId: { $ifNull: ["$pkConfig.host2TencentRoomId", ""] },
          host2TencentUserId: { $ifNull: ["$pkConfig.host2TencentUserId", ""] },
          localRank: "$pkConfig.localRank",
          localGiftCount: "$pkConfig.localGiftCount",
          remoteRank: "$pkConfig.remoteRank",
          remoteGiftCount: "$pkConfig.remoteGiftCount",
          isFollow: { $gt: [{ $size: "$isFollow" }, 0] },
          viewers: { $ifNull: ["$viewers", []] },
          streamSource: { $ifNull: ["$streamSource", ""] },
          pkThumbnails: { $ifNull: ["$pkThumbnails", []] },
          pkStreamSources: { $ifNull: ["$pkStreamSources", []] },
          multiLiveStreamSources: { $ifNull: ["$multiLiveStreamSources", []] },
          tencent: {
            roomId: { $ifNull: ["$tencentRoomId", ""] },
            userId: { $toString: "$userId" },
          },
        },
      },
    ];

    if (liveType === "follow" || liveType === "followLiveAudio") {
      pipeline.push({ $match: { isFollow: true } });
    }

    if (liveType === "audio") {
      pipeline.splice(
        4, // Insert after the main user lookup
        0,
        {
          $lookup: {
            from: "livestreamerviews",
            localField: "liveHistoryId",
            foreignField: "liveHistoryId",
            pipeline: [{ $sort: { createdAt: -1 } }, { $project: { _id: 0, image: 1, isProfilePicBanned: 1 } }, { $limit: 4 }],
            as: "viewers",
          },
        },
      );
    }

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
                    isBlock: 1,
                    country: 1,
                    countryFlagImage: 1,
                    uniqueId: 1,
                    isVerified: 1,
                    isFake: 1,
                    // wealthLevel: 1,
                    // activeAvtarFrame: 1,
                    isProfilePicBanned: 1,
                  },
                },
              ],
              as: "user",
            },
          },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
          { $match: { "user.isBlock": false } },
          {
            $addFields: {
              view: {
                $add: [{ $floor: { $multiply: [{ $rand: {} }, 25] } }, 1],
              },
            },
          },
          {
            $project: {
              _id: 1,
              liveHistoryId: { $literal: "" },
              view: 1,
              //liveType: "$streamType",
              liveType: {
                $cond: [
                  { $eq: ["$streamType", 4] },
                  {
                    $cond: [
                      { $lt: [{ $rand: {} }, 0.5] }, // 50% random chance
                      5,
                      4,
                    ],
                  },
                  "$streamType",
                ],
              },
              isPkMode: { $eq: ["$streamType", 3] },
              pkStatus: { $cond: [{ $eq: ["$streamType", 3] }, "round", ""] },
              pkRound: { $literal: 0 },
              host1Wins: { $literal: 0 },
              host2Wins: { $literal: 0 },
              audioLiveType: { $literal: 0 },
              privateCode: { $literal: 0 },
              roomName: 1,
              roomWelcome: 1,
              roomImage: "$thumbnail",
              userId: 1,
              blockedUsers: { $literal: [] },
              name: "$user.name",
              userName: "$user.userName",
              image: "$user.image",
              isProfilePicBanned: "$user.isProfilePicBanned",
              countryFlagImage: "$user.countryFlagImage",
              country: "$user.country",
              uniqueId: "$user.uniqueId",
              isVerified: "$user.isVerified",
              isFake: { $literal: true },
              host2Name: { $literal: "" },
              host2userName: { $literal: "" },
              host2Image: { $literal: "" },
              host2isProfilePicBanned: { $literal: false },
              bgTheme: { $literal: "" },
              localRank: { $literal: 0 },
              localGiftCount: { $literal: 0 },
              remoteRank: { $literal: 0 },
              remoteGiftCount: { $literal: 0 },
              isFollow: { $literal: false },
              viewers: { $literal: [] },
              streamSource: 1,
              pkThumbnails: { $ifNull: ["$pkThumbnails", []] },
              pkStreamSources: { $ifNull: ["$pkStreamSources", []] },
              multiLiveStreamSources: { $ifNull: ["$multiLiveStreamSources", []] },
              tencent: {
                roomId: { $literal: "" },
                userId: { $literal: "" },
              },
            },
          },
          { $sample: { size: limit } },
        ])
      : Promise.resolve([]);

    // Fetch user's own live stream (for reconnection scenarios)
    // Only show if LiveStreamer exists AND user is still marked as live
    const ownStreamPipeline = [
      {
        $match: {
          userId: userId,
          liveHistoryId: { $ne: null },
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
                isBlock: 1,
                uniqueId: 1,
                isVerified: 1,
                isFake: 1,
                wealthLevel: 1,
                activeAvtarFrame: 1,
                isProfilePicBanned: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "user.wealthLevel",
          foreignField: "_id",
          pipeline: [{ $project: { image: 1, name: 1 } }],
          as: "wealthDetails",
        },
      },
      { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "avtarframes",
          localField: "user.activeAvtarFrame",
          foreignField: "_id",
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          liveHistoryId: 1,
          view: 1,
          liveType: 1,
          audioLiveType: 1,
          privateCode: 1,
          roomName: 1,
          roomWelcome: 1,
          roomImage: 1,
          isPkMode: 1,
          userId: 1,
          bgTheme: 1,
          admins: {
            $map: {
              input: { $ifNull: ["$admins", []] },
              as: "admin",
              in: "$$admin.adminUserId",
            },
          },
          blockedUsers: {
            $map: {
              input: { $ifNull: ["$blockedUsers", []] },
              as: "blocked",
              in: "$$blocked.blockedUserId",
            },
          },
          name: "$user.name",
          userName: "$user.userName",
          image: "$user.image",
          isProfilePicBanned: "$user.isProfilePicBanned",
          countryFlagImage: 1,
          country: 1,
          uniqueId: "$user.uniqueId",
          isVerified: "$user.isVerified",
          isFake: "$user.isFake",
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          isOwnStream: { $literal: true },
          tencent: {
            roomId: { $ifNull: ["$tencentRoomId", ""] },
            userId: { $toString: "$userId" },
          },
        },
      },
    ];

    const ownStreamPromise = LiveStreamer.aggregate(ownStreamPipeline);

    const [realLiveUsers, fakeLiveUsers, ownStream] = await Promise.all([realLiveUsersPromise, fakeLiveUsersPromise, ownStreamPromise]);

    if (liveType === "new") {
      realLiveUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      realLiveUsers.sort((a, b) => b.view - a.view);
    }

    if (liveType === "new") {
      fakeLiveUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      fakeLiveUsers.sort((a, b) => b.view - a.view);
    }

    // Add isOwnStream: false to other streams
    realLiveUsers.forEach(user => user.isOwnStream = false);
    fakeLiveUsers.forEach(user => user.isOwnStream = false);

    // Put own stream first, then others
    let combinedUsers = [...ownStream, ...realLiveUsers, ...fakeLiveUsers];

    const startIndex = (start - 1) * limit;
    const paginatedUsers = combinedUsers.slice(startIndex, startIndex + limit);

    // Add Tencent config if enabled (userSig fetched separately at join time)
    let tencentConfig = null;
    if (isTencentEnabled()) {
      tencentConfig = {
        sdkAppId: global.settingJSON?.tencentSdkAppId || 0,
        roomIdType: "string",
      };
    }

    return res.status(200).json({
      status: true,
      message: "Retrieved live user list successfully.",
      liveUserList: paginatedUsers,
      tencentConfig: tencentConfig,
    });
  } catch (error) {
    console.error("Error in fetchLiveStreamers:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get available users to send pk request ( pk battle )
exports.getAvailableLiveUsers = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    const objectId = new mongoose.Types.ObjectId(req.user.userId);

    const liveUsers = await LiveStreamer.aggregate([
      {
        $match: {
          liveType: 1,
          isAudio: false,
          isPkMode: false,
          userId: { $ne: objectId },
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
                isProfilePicBanned: 1,
                countryFlagImage: 1,
                country: 1,
                isVerified: 1,
                activeAvtarFrame: 1,
                uniqueId: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $lookup: {
          from: "avtarframes",
          localField: "user.activeAvtarFrame",
          foreignField: "_id",
          as: "avtarframeDetails",
        },
      },
      {
        $unwind: {
          path: "$avtarframeDetails",
          preserveNullAndEmptyArrays: true, // in case user has no active frame
        },
      },
      {
        $project: {
          _id: 1,
          channel: 1,
          token: 1,
          liveHistoryId: 1,
          userId: 1,
          name: "$user.name",
          userName: "$user.userName",
          image: "$user.image",
          uniqueId: "$user.uniqueId",
          isProfilePicBanned: "$user.isProfilePicBanned",
          countryFlagImage: "$user.countryFlagImage",
          country: "$user.country",
          isVerified: "$user.isVerified",
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: liveUsers.length ? "Live users retrieved successfully." : "No live users available.",
      liveUserList: liveUsers,
    });
  } catch (error) {
    console.error("Error fetching live users:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error", error: error.message });
  }
};

//get available users to invite user ( audio live )
exports.getAvailableUsersForInvite = async (req, res) => {
  try {
    const { liveHistoryId } = req.query;

    if (!liveHistoryId) {
      return res.status(200).json({ status: false, message: "The 'liveHistoryId' parameter is required." });
    }

    const liveHistoryObjectId = new mongoose.Types.ObjectId(liveHistoryId);

    const viewers = await LiveStreamerView.aggregate([
      {
        $match: {
          liveHistoryId: liveHistoryObjectId,
        },
      },
      {
        $lookup: {
          from: "livestreamers",
          localField: "userId",
          foreignField: "seat.userId",
          as: "seatedUsers",
        },
      },
      {
        $match: {
          seatedUsers: { $size: 0 }, // Only users who are NOT seated
        },
      },
      {
        $project: {
          userId: 1,
          name: 1,
          userName: 1,
          image: 1,
          isProfilePicBanned: 1,
          gender: 1,
          countryFlagImage: 1,
          country: 1,
          uniqueId: 1,
          isVerified: 1,
          liveHistoryId: 1,
          avtarFrameType: 1,
          avtarFrame: 1,
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: viewers.length > 0 ? "Successfully retrieved the live viewer list." : "No viewers found for the specified live history or all are seated.",
      viewerList: viewers,
    });
  } catch (error) {
    console.error("Error fetching live viewer list:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while retrieving the live viewer list.",
      error: error.message || "Internal Server Error",
    });
  }
};

//retrieves list of users currently occupying seats ( audio live )
exports.fetchSeatedUsersList = async (req, res) => {
  try {
    const { liveHistoryId } = req.query;

    if (!liveHistoryId) {
      return res.status(200).json({ status: false, message: "The 'liveHistoryId' parameter is required." });
    }

    const liveHistoryObjectId = new mongoose.Types.ObjectId(liveHistoryId);

    const seatedUsers = await LiveStreamer.aggregate([
      {
        $match: {
          liveHistoryId: liveHistoryObjectId,
        },
      },
      {
        $unwind: "$seat",
      },
      {
        $match: {
          "seat.userId": { $ne: null }, // Filter users who are seated
        },
      },
      {
        $project: {
          _id: 1,
          "seat.userId": 1,
          "seat.name": 1,
          "seat.userName": 1,
          "seat.image": 1,
          "seat.isProfilePicBanned": 1,
          "seat.isVerified": 1,
          "seat.avtarFrameType": 1,
          "seat.avtarFrame": 1,
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: seatedUsers.length > 0 ? "Successfully retrieved the list of users who are seated." : "No users are currently seated.",
      seatedUsers,
    });
  } catch (error) {
    console.error("Error fetching seated users list:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while retrieving the seated users list.",
      error: error.message || "Internal Server Error",
    });
  }
};

//get block users list ( audio live )
exports.fetchBlockedUsersList = async (req, res) => {
  try {
    const { liveHistoryId } = req.query;

    if (!liveHistoryId) {
      return res.status(200).json({ status: false, message: "The 'liveHistoryId' parameter is required." });
    }

    const liveHistoryObjectId = new mongoose.Types.ObjectId(liveHistoryId);

    const liveHistory = await LiveStreamer.findOne({ liveHistoryId: liveHistoryObjectId })
      .select("blockedUsers")
      .populate({
        path: "blockedUsers.blockedUserId",
        select: "_id name userName image isProfilePicBanned uniqueId isVerified activeAvtarFrame",
        populate: {
          path: "activeAvtarFrame",
          select: "type image",
        },
      });

    return res.status(200).json({
      status: true,
      message: "Successfully retrieved the list of blocked users.",
      blockedUsers: liveHistory?.blockedUsers || [],
    });
  } catch (error) {
    console.error("Error fetching blocked users list:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while retrieving the blocked users list.",
      error: error.message || "Internal Server Error",
    });
  }
};

//get live summary
exports.getLiveSummaryDetails = async (req, res) => {
  try {
    const { liveHistoryId } = req.query;

    if (!liveHistoryId) {
      return res.status(200).json({ status: false, message: "The 'liveHistoryId' parameter is required." });
    }

    const liveHistoryObjectId = new mongoose.Types.ObjectId(liveHistoryId);

    const liveHistory = await LiveStreamerHistory.findById(liveHistoryObjectId)
      .populate({
        path: "userId",
        select: "name userName image isProfilePicBanned isVerified uniqueId gender age countryFlagImage country coin wealthLevel activeAvtarFrame",
        populate: [
          {
            path: "wealthLevel",
            select: "levelImage",
          },
          {
            path: "activeAvtarFrame",
            select: "type image svgaImage",
          },
        ],
      })
      .lean();

    if (!liveHistory) {
      return res.status(200).json({ status: false, message: "Live history not found." });
    }

    const user = liveHistory.userId || {};

    const responseData = {
      user: {
        name: user.name || "",
        userName: user.userName || "",
        image: user.image || "",
        isProfilePicBanned: user.isProfilePicBanned || false,
        isVerified: user.isVerified || false,
        uniqueId: user.uniqueId || "",
        gender: user.gender || "",
        age: user.age || "",
        countryFlagImage: user.countryFlagImage || "",
        country: user.country || "",
        coin: user.coin || 0,
        wealthLevel: user.wealthLevel || null,
        avtarFrame: user.activeAvtarFrame || null,
      },
      joinedUsers: liveHistory.viewerCount || 0,
      receivedGifts: liveHistory.receivedGifts || 0,
      publicComments: liveHistory.commentCount || 0,
      increasedFans: liveHistory.increasedFans || 0,
      coinsCollected: liveHistory.earnedCoins || 0,
      duration: liveHistory.duration || "00:00:00",
    };

    return res.status(200).json({
      status: true,
      message: "Live summary fetched successfully.",
      data: responseData,
    });
  } catch (error) {
    console.error("Live summary error:", error);
    return res.status(500).json({ status: false, message: "Internal server error.", error: error.message });
  }
};

//find the user with an active audio session
exports.exitAudioSession = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const liveUser = await LiveStreamer.findOne({ userId, isAudio: true })
      .select(
        "_id userId liveHistoryId agoraUid channel token earnedCoins view liveType audioLiveType privateCode roomName roomWelcome roomImage bgTheme isAudio isHostActiveInRoom hostIsMuted blockedUsers seat",
      )
      .lean();

    if (!liveUser) {
      return res.status(200).json({ status: false, message: "No active audio session found for this user." });
    }

    return res.status(200).json({
      status: true,
      message: "Audio session has been successfully fetched.",
      liveUser,
    });
  } catch (error) {
    console.error("Error fetched audio session:", error);
    return res.status(500).json({ status: false, message: "An error occurred while fetched the audio session." });
  }
};

//delete user's audio room
exports.stopAudioSession = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const liveUser = await LiveStreamer.findOne({ userId, isAudio: true }).select("_id roomImage liveHistoryId").lean();

    if (!liveUser) {
      return res.status(200).json({ status: false, message: "No active audio session found for this user." });
    }

    res.status(200).json({
      status: true,
      message: "Audio session successfully stopped.",
    });

    io.in(liveUser._id.toString()).emit("audioSessionEnded", "Audio session has been ended by the host.");

    if (liveUser && liveUser.roomImage) {
      deleteFile(liveUser.roomImage);
    }

    await Promise.all([
      LiveStreamerView.deleteMany({ liveStreamerId: liveUser._id }),
      LiveStreamComment.deleteMany({ liveStreamerId: liveUser._id }),
      TopGifter.deleteMany({ liveStreamerId: liveUser._id }),
      LiveStreamer.deleteOne({ _id: liveUser._id }),
    ]);
  } catch (error) {
    console.error("Error stopping audio session:", error);
    return res.status(500).json({ status: false, message: "An error occurred while stopping the audio session." });
  }
};

//get admin list (Audio Live)
exports.fetchAdminUsersList = async (req, res) => {
  try {
    const { liveHistoryId } = req.query || {};

    if (!liveHistoryId) {
      return res.status(200).json({
        status: false,
        message: "The 'liveHistoryId' parameter is required.",
      });
    }

    const liveHistoryObjectId = new mongoose.Types.ObjectId(liveHistoryId);

    const liveHistory = await LiveStreamer.findOne({ liveHistoryId: liveHistoryObjectId })
      .select("admins")
      .populate({
        path: "admins.adminUserId",
        select: "_id name userName image isProfilePicBanned uniqueId isVerified activeAvtarFrame",
        populate: {
          path: "activeAvtarFrame",
          select: "type image",
        },
      });

    return res.status(200).json({
      status: true,
      message: "Successfully retrieved admin users list.",
      admins: liveHistory?.admins || [],
    });
  } catch (error) {
    console.error("Error fetching admin users list:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while retrieving admin users.",
      error: error.message,
    });
  }
};

//get live countries list
exports.fetchLiveCountries = async (req, res) => {
  try {
    const isFakeLiveOn = settingJSON.isDummyData === true;
    // console.log("isFakeLiveOn: ", isFakeLiveOn);

    const cacheKey = isFakeLiveOn ? "active_live_countries_real_fake" : "active_live_countries_real";

    await redis.del(cacheKey);

    const ttl = await redis.ttl(cacheKey);
    // console.log("Remaining TTL:", ttl);

    const cachedData = await redis.get(cacheKey);
    // console.log("cachedData: ", cachedData);

    if (cachedData) {
      return res.status(200).json({
        status: true,
        message: "Live countries retrieved successfully from cache.",
        data: JSON.parse(cachedData),
      });
    }

    const pipeline = [
      {
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
      },
      {
        $project: {
          country: 1,
          flag: "$countryFlagImage",
        },
      },
    ];

    if (isFakeLiveOn) {
      pipeline.push({
        $unionWith: {
          coll: "fakelivestreamers",
          pipeline: [
            { $match: { isStreaming: true } },
            {
              $lookup: {
                from: "users",
                localField: "userId",
                foreignField: "_id",
                pipeline: [
                  {
                    $project: {
                      _id: 0,
                      country: 1,
                      countryFlagImage: 1,
                    },
                  },
                ],
                as: "user",
              },
            },
            { $unwind: "$user" },
            {
              $project: {
                country: "$user.country",
                flag: "$user.countryFlagImage",
              },
            },
          ],
        },
      });
    }

    pipeline.push(
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
      { $sort: { country: 1 } },
      {
        $project: {
          _id: 0,
          country: 1,
          flag: 1,
        },
      },
    );

    const countries = await LiveStreamer.aggregate(pipeline);
    // console.log("countries: ", countries);

    if (!countries.length) {
      return res.status(200).json({
        status: true,
        message: "No live countries found at the moment.",
        data: [],
      });
    }

    await redis.set(cacheKey, JSON.stringify(countries), {
      EX: 60, // expires in 60 seconds
    });

    return res.status(200).json({
      status: true,
      message: "Live countries retrieved successfully.",
      data: countries,
    });
  } catch (error) {
    console.error("Fetch Countries Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//search a host by uniqueId for a pk invitation ( pk battle )
exports.searchPkHost = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    const uniqueId = req.query.uniqueId ? String(req.query.uniqueId).trim() : "";

    if (!uniqueId) {
      return res.status(200).json({ status: false, message: "uniqueId must be needed." });
    }

    const user = await User.findOne({ uniqueId }).select("_id").lean();

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    const availability = await getPkAvailability([user._id], { requesterId: req.user.userId });
    const host = availability.get(String(user._id));

    if (!host) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    return res.status(200).json({
      status: true,
      message: host.isAvailable ? "Host is available for PK." : "Host is not available for PK.",
      data: host,
    });
  } catch (error) {
    console.error("Error searching PK host:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error", error: error.message });
  }
};

//recent pk opponents of the caller with live availability, for a one-tap rematch ( pk battle )
exports.recentPkOpponents = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const opponents = await PkOpponent.find({ userId })
      .sort({ lastBattledAt: -1 })
      .skip((start - 1) * limit)
      .limit(limit)
      .select("opponentId lastBattledAt battleCount")
      .lean();

    const availability = await getPkAvailability(
      opponents.map((opponent) => opponent.opponentId),
      { requesterId: req.user.userId },
    );

    const data = opponents.map((opponent) => ({
      ...(availability.get(String(opponent.opponentId)) || { userId: opponent.opponentId, isAvailable: false, unavailableReason: "not_found" }),
      lastBattledAt: opponent.lastBattledAt,
      battleCount: opponent.battleCount,
    }));

    return res.status(200).json({
      status: true,
      message: data.length ? "Recent PK opponents retrieved successfully." : "No recent PK opponents.",
      data,
    });
  } catch (error) {
    console.error("Error fetching recent PK opponents:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error", error: error.message });
  }
};
