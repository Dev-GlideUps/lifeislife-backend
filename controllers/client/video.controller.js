const Video = require("../../models/video.model");

//import model
const User = require("../../models/user.model");
const Song = require("../../models/song.model");
const HashTag = require("../../models/hashTag.model");
const HashTagUsageHistory = require("../../models/hashTagUsageHistory.model");
const LikeHistory = require("../../models/likeHistory.model");
const Comment = require("../../models/comment.model");
const Report = require("../../models/report.model");
const Notification = require("../../models/notification.model");
const WatchHistory = require("../../models/watchHistory.model");
const Block = require("../../models/block.model");

//deleteFiles
const { deleteFiles, deleteFile } = require("../../util/deletefile");

//generateUniqueVideoOrPostId
const generateVideoOrPostUniqueId = require("../../util/generateVideoOrPostUniqueId");

//private key
const admin = require("../../util/privateKey");

//mongoose
const mongoose = require("mongoose");

//fs
const fs = require("fs");

//day.js
const dayjs = require("dayjs");

//axios
const axios = require("axios");

//upload video by user
exports.broadcastVideo = async (req, res, next) => {
  try {
    if (!req.user?.userId) {
      if (req.files) deleteFiles(req.files);
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    if (!req.body.videoTime || !req.files) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Oops! Invalid details." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const mentionedUsersArray = req.body.mentionedUserIds ? req.body.mentionedUserIds.split(",").map((id) => id.trim()) : [];
    const hashTagsArray = req.body.hashTagId ? req.body.hashTagId.split(",").map((tag) => tag.trim()) : [];

    const [uniqueVideoId, user, mentionedUsers, song] = await Promise.all([
      generateVideoOrPostUniqueId(),
      User.findOne({ _id: userId, isFake: false }).select("_id fcmToken isPushNotificationEnabled isBlock").lean(),
      mentionedUsersArray.length
        ? User.find({ _id: { $in: mentionedUsersArray }, isFake: false })
            .select("_id")
            .lean()
        : [],
      req.body.songId ? Song.findById(req.body.songId).select("_id").lean() : null,
    ]);

    if (!user) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user.isBlock) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "You are blocked by the admin." });
    }

    if (!settingJSON || settingJSON.durationOfShorts < parseInt(req.body.videoTime)) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Invalid video duration." });
    }

    if (req.body.songId && !song) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Song not found." });
    }

    res.status(200).json({ status: true, message: "Video uploaded successfully." });

    const video = new Video({
      userId: user._id,
      caption: req.body.caption || "",
      videoTime: req.body.videoTime,
      songId: req.body.songId ? song._id : null,
      videoImage: req.files.videoImage?.[0]?.path,
      videoUrl: req.files.videoUrl?.[0]?.path,
      hashTagId: hashTagsArray,
      mentionedUserIds: mentionedUsers.map((u) => u._id),
      uniqueVideoId,
    });

    await video.save();

    if (hashTagsArray) {
      await Promise.all(
        hashTagsArray.map(async (hashTagId) => {
          const hashTag = await HashTag.findById(hashTagId);
          if (hashTag) {
            const hashTagUsageHistory = new HashTagUsageHistory({
              hashTagCreator: user._id,
              hashTagId: hashTag._id,
              videoId: video._id,
            });
            await hashTagUsageHistory.save();
          }
        }),
      );
    }

    if (req.files.videoUrl) {
      const videoUrl = process?.env?.baseURL + req?.files?.videoUrl[0]?.path;
      if (videoUrl && settingJSON.videoBanned) {
        const checks = [];
        if (settingJSON.videoBanned.includes("1")) checks.push("nudity-2.1");
        if (settingJSON.videoBanned.includes("2")) checks.push("offensive");
        if (settingJSON.videoBanned.includes("3")) checks.push("violence");
        if (settingJSON.videoBanned.includes("4")) checks.push("gore-2.0");
        if (settingJSON.videoBanned.includes("5")) checks.push("weapon");
        if (settingJSON.videoBanned.includes("6")) checks.push("tobacco");
        if (settingJSON.videoBanned.includes("7")) checks.push("recreational_drug,medical");
        if (settingJSON.videoBanned.includes("8")) checks.push("gambling");
        if (settingJSON.videoBanned.includes("9")) checks.push("alcohol");
        if (settingJSON.videoBanned.includes("10")) checks.push("money");
        if (settingJSON.videoBanned.includes("11")) checks.push("self-harm");

        if (checks.length > 0 && videoUrl) {
          (async () => {
            try {
              const response = await axios.get("https://api.sightengine.com/1.0/video/check-sync.json", {
                params: {
                  stream_url: videoUrl,
                  models: checks.join(","),
                  api_user: settingJSON.sightengineUser,
                  api_secret: settingJSON.sightengineApiSecret,
                },
                timeout: 60000,
              });

              const result = response.data;
              if (result.status === "success") {
                const frames = result?.data?.frames;
                if (frames) {
                  let isBanned = false;
                  let bannedReason = "";

                  for (const check of checks) {
                    // --- NUDITY ---
                    if (settingJSON.videoBanned.includes("1") && check === "nudity-2.1") {
                      const nudityBanned = frames.some((frame) => {
                        const { sexual_activity, sexual_display, erotica, very_suggestive, suggestive, mildly_suggestive } = frame.nudity;
                        return sexual_activity > 0.7 || sexual_display > 0.7 || erotica > 0.7 || very_suggestive > 0.7 || suggestive > 0.7 || mildly_suggestive > 0.7;
                      });
                      if (nudityBanned) {
                        isBanned = true;
                        bannedReason = "🔞 Nudity or suggestive content detected.";
                        break;
                      }
                    }

                    // --- OFFENSIVE ---
                    if (settingJSON.videoBanned.includes("2") && check === "offensive") {
                      const offensiveFrames = frames.map((f) => f.offensive?.prob || 0);
                      const avgOffensive = offensiveFrames.reduce((a, b) => a + b, 0) / offensiveFrames.length;
                      if (avgOffensive > 0.7) {
                        isBanned = true;
                        bannedReason = "⚠️ Offensive content detected.";
                        break;
                      }
                    }

                    // --- VIOLENCE ---
                    if (settingJSON.videoBanned.includes("3") && check === "violence") {
                      const violenceFrames = frames.map((f) => f.violence?.prob || 0);
                      const avgViolence = violenceFrames.reduce((a, b) => a + b, 0) / violenceFrames.length;
                      if (avgViolence > 0.7) {
                        isBanned = true;
                        bannedReason = "💥 Violent content detected.";
                        break;
                      }
                    }

                    // --- GORE ---
                    if (settingJSON.videoBanned.includes("4") && check === "gore-2.0") {
                      const goreFrames = frames.map((f) => f.gore?.prob || 0);
                      const avgGore = goreFrames.reduce((a, b) => a + b, 0) / goreFrames.length;
                      if (avgGore > 0.7) {
                        isBanned = true;
                        bannedReason = "🩸 Gore or disturbing imagery detected.";
                        break;
                      }
                    }

                    // --- WEAPON ---
                    if (settingJSON.videoBanned.includes("5") && check === "weapon") {
                      const weaponFrames = frames.flatMap((f) => {
                        const all = [];
                        if (f.weapon?.classes) all.push(...Object.values(f.weapon.classes));
                        if (f.weapon?.firearm_type) all.push(...Object.values(f.weapon.firearm_type));
                        if (f.weapon?.firearm_action) all.push(...Object.values(f.weapon.firearm_action));
                        return all.map((v) => v || 0);
                      });
                      const avgWeapon = weaponFrames.reduce((a, b) => a + b, 0) / weaponFrames.length;
                      if (avgWeapon > 0.7) {
                        isBanned = true;
                        bannedReason = "🔫 Weapon-related visuals detected.";
                        break;
                      }
                    }

                    // --- TOBACCO ---
                    if (settingJSON.videoBanned.includes("6") && check === "tobacco") {
                      const tobaccoFrames = frames.map((f) => f.tobacco?.prob || 0);
                      const avgTobacco = tobaccoFrames.reduce((a, b) => a + b, 0) / tobaccoFrames.length;
                      if (avgTobacco > 0.7) {
                        isBanned = true;
                        bannedReason = "🚬 Tobacco use detected.";
                        break;
                      }
                    }

                    // --- DRUGS ---
                    if (settingJSON.videoBanned.includes("7") && check === "recreational_drug,medical") {
                      const drugFrames = frames.map((f) => f.recreational_drug?.prob || 0);
                      const avgDrug = drugFrames.reduce((a, b) => a + b, 0) / drugFrames.length;
                      if (avgDrug > 0.7) {
                        isBanned = true;
                        bannedReason = "💊 Drug-related content detected.";
                        break;
                      }
                    }

                    // --- GAMBLING ---
                    if (settingJSON.videoBanned.includes("8") && check === "gambling") {
                      const gamblingFrames = frames.map((f) => f.gambling?.prob || 0);
                      const avgGambling = gamblingFrames.reduce((a, b) => a + b, 0) / gamblingFrames.length;
                      if (avgGambling > 0.7) {
                        isBanned = true;
                        bannedReason = "🎰 Gambling content detected.";
                        break;
                      }
                    }

                    // --- ALCOHOL ---
                    if (settingJSON.videoBanned.includes("9") && check === "alcohol") {
                      const alcoholFrames = frames.map((f) => f.alcohol?.prob || 0);
                      const avgAlcohol = alcoholFrames.reduce((a, b) => a + b, 0) / alcoholFrames.length;
                      if (avgAlcohol > 0.7) {
                        isBanned = true;
                        bannedReason = "🍺 Alcohol consumption detected.";
                        break;
                      }
                    }

                    // --- MONEY ---
                    if (settingJSON.videoBanned.includes("10") && check === "money") {
                      const moneyFrames = frames.map((f) => f.money?.prob || 0);
                      const avgMoney = moneyFrames.reduce((a, b) => a + b, 0) / moneyFrames.length;
                      if (avgMoney > 0.7) {
                        isBanned = true;
                        bannedReason = "💰 Suspicious money visuals detected.";
                        break;
                      }
                    }

                    // --- SELF-HARM ---
                    if (settingJSON.videoBanned.includes("11") && check === "self-harm") {
                      const selfHarmFrames = frames.map((f) => f["self-harm"]?.prob || 0);
                      const avgSelfHarm = selfHarmFrames.reduce((a, b) => a + b, 0) / selfHarmFrames.length;
                      if (avgSelfHarm > 0.7) {
                        isBanned = true;
                        bannedReason = "🚨 Self-harm or dangerous behavior detected.";
                        break;
                      }
                    }
                  }

                  if (isBanned) {
                    video.isBanned = true;
                    await video.save();

                    if (!user.isBlock && user.isPushNotificationEnabled && user.fcmToken) {
                      const payload = {
                        token: user.fcmToken,
                        notification: {
                          title: "🚫 Video Flagged 🚫",
                          body: `${bannedReason} Please review and update your video to continue sharing. 🎥`,
                        },
                        data: {
                          type: "VIDEO_BANNED",
                          videoId: String(video?._id),
                          videoUserId: String(video?.userId),
                        },
                      };

                      try {
                        const adminInstance = await admin;
                        const response = await adminInstance.messaging().send(payload);
                        console.log("📩 Video banned notification sent:", response);
                      } catch (err) {
                        console.error("❌ Error sending video banned notification:", err);
                      }
                    }
                  }
                }
              }
            } catch (err) {
              console.error("⚠️ Sightengine error:", err);
            }
          })();
        } else {
          console.log("⚙️ No checks selected or video URL missing.");
        }
      }
    }
  } catch (error) {
    console.log(error);
    if (req.files) deleteFiles(req.files);
    return res.status(500).json({ status: false, message: error.message || "Internal Sever Error" });
  }
};

//update video by user
exports.modifyVideoDetails = async (req, res, next) => {
  try {
    if (!req.user?.userId) {
      if (req.file) deleteFile(req.file);
      return res.status(401).json({ status: false, message: "Unauthorized access. Please provide a valid token." });
    }

    if (!req.query.videoId) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Missing required parameters: videoId." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const videoId = new mongoose.Types.ObjectId(req.query.videoId);
    const mentionedUserIdsArray = req.body.mentionedUserIds ? req.body.mentionedUserIds.split(",").map((id) => id.trim()) : [];

    const [videoOfUser, song, mentionedUsers] = await Promise.all([
      Video.findOne({ _id: videoId, userId }).select("_id songId caption hashTagId videoImage mentionedUserIds").lean(),
      req.body.songId ? Song.findById(req.body.songId).select("_id").lean() : null,
      req.body.mentionedUserIds
        ? User.find({ _id: { $in: mentionedUserIdsArray } })
            .select("_id name userName image")
            .lean()
        : [],
    ]);

    if (!videoOfUser) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Video not found or does not belong to the user." });
    }

    if (req.body.songId && !song) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "The requested song does not exist." });
    }

    // Respond success immediately
    res.status(200).json({ status: true, message: "Video updated successfully." });

    let hashTagsArray = videoOfUser.hashTagId;

    if (req.body.hashTagId) {
      hashTagsArray = req.body.hashTagId
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag);
    } else {
      hashTagsArray = [];
    }

    await HashTagUsageHistory.deleteMany({ hashTagCreator: userId, videoId });

    if (hashTagsArray.length > 0) {
      await Promise.all(
        hashTagsArray.map(async (hashTagId) => {
          const hashTag = await HashTag.findById(hashTagId).select("_id").lean();
          if (hashTag) {
            await new HashTagUsageHistory({
              hashTagCreator: userId,
              hashTagId: hashTag._id,
              videoId: videoOfUser._id,
            }).save();
          }
        }),
      );
    }

    let mentionedUserIdList = undefined;
    if (req.body.mentionedUserIds) {
      mentionedUserIdList = mentionedUsers.map((u) => u._id);
    }

    if (req.file && videoOfUser.videoImage) {
      deleteFile(videoOfUser.videoImage); // Delete the old video image
    }

    await Video.updateOne(
      { _id: videoId, userId },
      {
        $set: {
          hashTagId: hashTagsArray,
          videoImage: req.file ? req.file.path : videoOfUser.videoImage,
          songId: req.body.songId ? song._id : videoOfUser.songId,
          caption: req.body.caption !== undefined ? req.body.caption : videoOfUser.caption,
          mentionedUserIds: mentionedUserIdList !== undefined ? mentionedUserIdList : [],
        },
      },
    );
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating the video. Please try again later." });
  }
};

//get user's videos
exports.userVideoLibrary = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    let now = dayjs();
    const { userId: loggedInUserId } = req.user || {};
    const { toUserId } = req.query || {};

    if (!loggedInUserId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Token is missing or invalid." });
    }

    if (!toUserId) {
      return res.status(200).json({ status: false, message: "Missing required parameter: toUserId." });
    }

    const loggedInUserObjectId = new mongoose.Types.ObjectId(loggedInUserId);
    const toUserObjectId = new mongoose.Types.ObjectId(toUserId);

    // Check if target user has blocked the requesting user
    const isBlockedByTarget = await Block.exists({ userId: toUserObjectId, toUserId: loggedInUserObjectId });
    if (isBlockedByTarget) {
      return res.status(200).json({ status: false, message: "You cannot view this content.", isBlocked: true });
    }

    const [user, videos] = await Promise.all([
      User.findById(toUserObjectId).select("_id isBlock").lean(),
      Video.aggregate([
        {
          $match: {
            userId: toUserObjectId,
            ...(String(loggedInUserId) === String(toUserId) ? {} : { isBanned: false }),
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                  userName: 1,
                  gender: 1,
                  age: 1,
                  country: 1,
                  countryFlagImage: 1,
                  image: 1,
                  isProfilePicBanned: 1,
                  isVerified: 1,
                  isFake: 1,
                  uniqueId: 1,
                  activeAvtarFrame: 1,
                  wealthLevel: 1,
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
            pipeline: [{ $project: { image: 1, type: 1 } }],
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "songs",
            localField: "songId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  songTitle: 1,
                  songImage: 1,
                  songLink: 1,
                  singerName: 1,
                },
              },
            ],
            as: "song",
          },
        },
        { $unwind: { path: "$song", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "hashtags",
            localField: "hashTagId",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 1, hashTag: 1 } }],
            as: "hashTag",
          },
        },
        {
          $lookup: {
            from: "likehistories",
            localField: "_id",
            foreignField: "videoId",
            pipeline: [{ $match: { userId: loggedInUserObjectId } }, { $limit: 1 }],
            as: "likes",
          },
        },
        {
          $lookup: {
            from: "likehistories",
            localField: "_id",
            foreignField: "videoId",
            pipeline: [{ $count: "count" }],
            as: "totalLikes",
          },
        },
        {
          $lookup: {
            from: "comments",
            localField: "_id",
            foreignField: "videoId",
            pipeline: [{ $count: "count" }],
            as: "comments",
          },
        },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "userId",
            foreignField: "toUserId",
            pipeline: [{ $match: { fromUserId: loggedInUserObjectId } }, { $limit: 1 }],
            as: "isFollow",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "mentionedUserIds",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                  userName: 1,
                  uniqueId: 1,
                  image: 1,
                  isProfilePicBanned: 1,
                  isVerified: 1,
                  isFake: 1,
                  gender: 1,
                  age: 1,
                  coin: 1,
                  activeAvtarFrame: 1,
                  wealthLevel: 1,
                },
              },
            ],
            as: "mentionedUsers",
          },
        },
        {
          $lookup: {
            from: "avtarframes",
            localField: "mentionedUsers.activeAvtarFrame",
            foreignField: "_id",
            pipeline: [{ $project: { image: 1, type: 1 } }],
            as: "mentionedUsersAvtarFrames",
          },
        },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "mentionedUsers.wealthLevel",
            foreignField: "_id",
            pipeline: [{ $project: { levelImage: 1 } }],
            as: "mentionedUsersWealthLevels",
          },
        },
        {
          $project: {
            _id: 1,
            caption: 1,
            isBanned: 1,
            videoImage: 1,
            videoUrl: 1,
            videoTime: 1,
            shareCount: 1,
            isFake: 1,
            songId: 1,
            createdAt: 1,
            songTitle: { $ifNull: ["$song.songTitle", ""] },
            songImage: { $ifNull: ["$song.songImage", ""] },
            songLink: { $ifNull: ["$song.songLink", ""] },
            singerName: { $ifNull: ["$song.singerName", ""] },
            hashTagId: "$hashTag._id",
            hashTag: "$hashTag.hashTag",
            userId: "$user._id",
            name: "$user.name",
            userName: "$user.userName",
            gender: "$user.gender",
            age: "$user.age",
            countryFlagImage: "$user.countryFlagImage",
            country: "$user.country",
            userImage: "$user.image",
            isProfilePicBanned: "$user.isProfilePicBanned",
            isVerified: "$user.isVerified",
            userIsFake: "$user.isFake",
            avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
            avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
            isLike: { $gt: [{ $size: "$likes" }, 0] },
            isFollow: { $gt: [{ $size: "$isFollow" }, 0] },
            totalLikes: { $ifNull: [{ $arrayElemAt: ["$totalLikes.count", 0] }, 0] },
            totalComments: { $ifNull: [{ $arrayElemAt: ["$comments.count", 0] }, 0] },
            mentionedUsers: {
              $map: {
                input: "$mentionedUsers",
                as: "m",
                in: {
                  $let: {
                    vars: {
                      frame: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$mentionedUsersAvtarFrames",
                              as: "f",
                              cond: { $eq: ["$$f._id", "$$m.activeAvtarFrame"] },
                            },
                          },
                          0,
                        ],
                      },
                      wl: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$mentionedUsersWealthLevels",
                              as: "w",
                              cond: { $eq: ["$$w._id", "$$m.wealthLevel"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      _id: "$$m._id",
                      name: "$$m.name",
                      userName: "$$m.userName",
                      uniqueId: "$$m.uniqueId",
                      image: "$$m.image",
                      isProfilePicBanned: "$$m.isProfilePicBanned",
                      isVerified: "$$m.isVerified",
                      isFake: "$$m.isFake",
                      gender: "$$m.gender",
                      age: "$$m.age",
                      coin: "$$m.coin",
                      avtarFrame: { $ifNull: ["$$frame.image", ""] },
                      avtarFrameType: { $ifNull: ["$$frame.type", 0] },
                      wealthLevelImage: { $ifNull: ["$$wl.levelImage", ""] },
                    },
                  },
                },
              },
            },
            time: {
              $let: {
                vars: {
                  timeDiff: { $subtract: [now.toDate(), "$createdAt"] },
                },
                in: {
                  $concat: [
                    {
                      $switch: {
                        branches: [
                          {
                            case: { $gte: ["$$timeDiff", 31536000000] },
                            then: {
                              $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 31536000000] } } }, " years ago"],
                            },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 2592000000] },
                            then: {
                              $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 2592000000] } } }, " months ago"],
                            },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 604800000] },
                            then: {
                              $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 604800000] } } }, " weeks ago"],
                            },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 86400000] },
                            then: {
                              $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 86400000] } } }, " days ago"],
                            },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 3600000] },
                            then: {
                              $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 3600000] } } }, " hours ago"],
                            },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 60000] },
                            then: {
                              $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 60000] } } }, " minutes ago"],
                            },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 1000] },
                            then: {
                              $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 1000] } } }, " seconds ago"],
                            },
                          },
                          { case: true, then: "Just now" },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ]),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    return res.status(200).json({
      status: true,
      message: "Successfully retrieved videos for the requested user.",
      data: videos,
    });
  } catch (error) {
    console.error("Error fetching user videos:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

//delete video of user
exports.deleteUserVideo = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    if (!req.query.videoId) {
      return res.status(200).json({ status: false, message: "Missing required parameter: videoId." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const videoId = new mongoose.Types.ObjectId(req.query.videoId);

    const video = await Video.findOne({ _id: videoId, userId, isFake: false }).select("_id videoImage videoUrl");

    if (!video) {
      return res.status(200).json({ status: false, message: "Video does not found for that user." });
    }

    res.status(200).json({
      status: true,
      message: "Video successfully deleted.",
    });

    if (video?.videoImage) {
      deleteFile(video.videoImage); // Delete the video image file
    }

    if (video?.videoUrl) {
      deleteFile(video.videoUrl); // Delete the video file
    }

    await Promise.all([
      WatchHistory.deleteMany({ videoId: video._id }),
      LikeHistory.deleteMany({ videoId: video._id }),
      Comment.deleteMany({ videoId: video._id }),
      HashTagUsageHistory.deleteMany({ videoId: video._id }),
      Report.deleteMany({ videoId: video._id }),
      Notification.deleteMany({ userId: userId }),
      video.deleteOne(),
    ]);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Sever Error" });
  }
};

//user share video
exports.boostVideoShares = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Please provide a valid token." });
    }

    if (!req.query.videoId) {
      return res.status(200).json({ status: false, message: "Invalid request. videoId is required." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const videoId = new mongoose.Types.ObjectId(req.query.videoId);

    const video = await Video.findOne({ _id: videoId, userId: userId }).select("_id shareCount");

    if (!video) {
      return res.status(200).json({ status: false, message: "Video not found." });
    }

    res.status(200).json({
      status: true,
      message: "Video has been shared successfully. Share count updated.",
    });

    video.shareCount += 1;
    await video.save();
  } catch (error) {
    console.error("Error updating share count:", error);
    return res.status(500).json({ status: false, message: "An error occurred while updating share count. Please try again." });
  }
};

//get videos
exports.retrieveVideoCollection = async (req, res, next) => {
  try {
    let now = dayjs();

    const start = parseInt(req.query.start || 1);
    const limit = parseInt(req.query.limit || 20);
    const skip = (start - 1) * limit;

    if (!settingJSON) {
      return res.status(200).json({ status: false, message: "Setting does not found." });
    }

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Please provide a valid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    let seed;
    if (start === 1) {
      const seedId = req.query.videoId ? new mongoose.Types.ObjectId(req.query.videoId) : userId;
      seed =
        seedId
          .toString()
          .split("")
          .reduce((a, c) => a + c.charCodeAt(0), 0) + Date.now();
    } else {
      if (!req.query.seed) {
        return res.status(200).json({
          status: false,
          message: "Seed is required for pagination beyond first page.",
        });
      }

      seed = Number(req.query.seed);

      if (!Number.isInteger(seed) || seed <= 0) {
        return res.status(200).json({
          status: false,
          message: "Invalid seed value.",
        });
      }
    }

    const isFakeMatch = settingJSON.isDummyData ? { $or: [{ isFake: false }, { isFake: true }] } : { isFake: false };

    const baseMatchStages = [{ $match: isFakeMatch }, { $match: { isBanned: false } }];

    const randomSortStages = [
      {
        $addFields: {
          randomSortField: {
            $mod: [
              {
                $abs: {
                  $multiply: [{ $toLong: { $toDate: "$_id" } }, seed],
                },
              },
              1234567,
            ],
          },
        },
      },
      {
        $sort: {
          randomSortField: 1,
          _id: 1,
        },
      },
    ];

    const aggregationPipeline = [
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                userName: 1,
                gender: 1,
                age: 1,
                country: 1,
                countryFlagImage: 1,
                image: 1,
                isProfilePicBanned: 1,
                isVerified: 1,
                isFake: 1,
                uniqueId: 1,
                activeAvtarFrame: 1,
                wealthLevel: 1,
              },
            },
          ],
          as: "user",
        },
      },
      {
        $unwind: { path: "$user", preserveNullAndEmptyArrays: false },
      },
      {
        $lookup: {
          from: "blocks",
          localField: "user._id",
          foreignField: "toUserId",
          pipeline: [{ $match: { userId: userId } }, { $limit: 1 }, { $project: { _id: 1 } }],
          as: "isBlocked",
        },
      },
      { $match: { isBlocked: { $eq: [] } } },
      {
        $lookup: {
          from: "users",
          localField: "mentionedUserIds",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                userName: 1,
                uniqueId: 1,
                image: 1,
                isProfilePicBanned: 1,
                isVerified: 1,
                isFake: 1,
                gender: 1,
                age: 1,
                coin: 1,
                activeAvtarFrame: 1,
                wealthLevel: 1,
              },
            },
          ],
          as: "mentionedUsers",
        },
      },
      {
        $lookup: {
          from: "avtarframes",
          localField: "mentionedUsers.activeAvtarFrame",
          foreignField: "_id",
          as: "mentionedUsersAvtarFrames",
        },
      },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "mentionedUsers.wealthLevel",
          foreignField: "_id",
          as: "mentionedUsersWealthLevels",
        },
      },
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
          from: "songs",
          localField: "songId",
          foreignField: "_id",
          as: "song",
        },
      },
      {
        $unwind: { path: "$song", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "hashtags",
          localField: "hashTagId",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, hashTag: 1 } }],
          as: "hashTag",
        },
      },
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "videoId",
          pipeline: [{ $count: "count" }],
          as: "totalComments",
        },
      },
      {
        $lookup: {
          from: "likehistories",
          localField: "_id",
          foreignField: "videoId",
          pipeline: [{ $count: "count" }],
          as: "totalLikes",
        },
      },
      {
        $lookup: {
          from: "likehistories",
          localField: "_id",
          foreignField: "videoId",
          pipeline: [{ $match: { userId: userId } }, { $limit: 1 }, { $project: { _id: 1 } }],
          as: "likeHistory",
        },
      },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "userId",
          foreignField: "toUserId",
          pipeline: [{ $match: { fromUserId: userId } }, { $limit: 1 }, { $project: { _id: 1 } }],
          as: "isFollow",
        },
      },
      {
        $project: {
          _id: 1,
          caption: 1,
          isBanned: 1,
          videoImage: 1,
          videoUrl: 1,
          videoTime: 1,
          shareCount: 1,
          isFake: 1,
          songId: 1,
          createdAt: 1,
          songTitle: { $ifNull: ["$song.songTitle", ""] },
          songImage: { $ifNull: ["$song.songImage", ""] },
          songLink: { $ifNull: ["$song.songLink", ""] },
          singerName: { $ifNull: ["$song.singerName", ""] },
          hashTagId: "$hashTag._id",
          hashTag: "$hashTag.hashTag",
          userId: "$user._id",
          name: "$user.name",
          userName: "$user.userName",
          gender: "$user.gender",
          age: "$user.age",
          country: "$user.country",
          countryFlagImage: "$user.countryFlagImage",
          userImage: "$user.image",
          isProfilePicBanned: "$user.isProfilePicBanned",
          isVerified: "$user.isVerified",
          userIsFake: "$user.isFake",
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          isLike: { $cond: { if: { $gt: [{ $size: "$likeHistory" }, 0] }, then: true, else: false } },
          isFollow: { $cond: { if: { $gt: [{ $size: "$isFollow" }, 0] }, then: true, else: false } },
          totalLikes: {
            $ifNull: [{ $arrayElemAt: ["$totalLikes.count", 0] }, 0],
          },
          totalComments: {
            $ifNull: [{ $arrayElemAt: ["$totalComments.count", 0] }, 0],
          },
          mentionedUsers: {
            $map: {
              input: "$mentionedUsers",
              as: "m",
              in: {
                $let: {
                  vars: {
                    frame: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$mentionedUsersAvtarFrames",
                            as: "f",
                            cond: { $eq: ["$$f._id", "$$m.activeAvtarFrame"] },
                          },
                        },
                        0,
                      ],
                    },
                    wl: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$mentionedUsersWealthLevels",
                            as: "w",
                            cond: { $eq: ["$$w._id", "$$m.wealthLevel"] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    _id: "$$m._id",
                    name: "$$m.name",
                    userName: "$$m.userName",
                    uniqueId: "$$m.uniqueId",
                    image: "$$m.image",
                    isProfilePicBanned: "$$m.isProfilePicBanned",
                    isVerified: "$$m.isVerified",
                    isFake: "$$m.isFake",
                    gender: "$$m.gender",
                    age: "$$m.age",
                    coin: "$$m.coin",
                    avtarFrame: { $ifNull: ["$$frame.image", ""] },
                    avtarFrameType: { $ifNull: ["$$frame.type", 0] },
                    wealthLevelImage: { $ifNull: ["$$wl.levelImage", ""] },
                  },
                },
              },
            },
          },
          time: {
            $let: {
              vars: {
                timeDiff: { $subtract: [now.toDate(), "$createdAt"] },
              },
              in: {
                $concat: [
                  {
                    $switch: {
                      branches: [
                        {
                          case: { $gte: ["$$timeDiff", 31536000000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 31536000000] } } }, " years ago"] },
                        },
                        {
                          case: { $gte: ["$$timeDiff", 2592000000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 2592000000] } } }, " months ago"] },
                        },
                        {
                          case: { $gte: ["$$timeDiff", 604800000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 604800000] } } }, " weeks ago"] },
                        },
                        {
                          case: { $gte: ["$$timeDiff", 86400000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 86400000] } } }, " days ago"] },
                        },
                        {
                          case: { $gte: ["$$timeDiff", 3600000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 3600000] } } }, " hours ago"] },
                        },
                        {
                          case: { $gte: ["$$timeDiff", 60000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 60000] } } }, " minutes ago"] },
                        },
                        {
                          case: { $gte: ["$$timeDiff", 1000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 1000] } } }, " seconds ago"] },
                        },
                        { case: true, then: "Just now" },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ];

    const buildListPipeline = (listSkip, listLimit, excludeVideoId = null) => [
      ...baseMatchStages,
      ...(excludeVideoId ? [{ $match: { _id: { $ne: excludeVideoId } } }] : []),
      ...randomSortStages,
      { $skip: listSkip },
      { $limit: listLimit },
      ...aggregationPipeline,
    ];

    const buildSingleVideoPipeline = (videoId) => [...baseMatchStages, { $match: { _id: videoId } }, ...aggregationPipeline];

    if (req.query.videoId) {
      const videoId = new mongoose.Types.ObjectId(req.query.videoId);

      const video = await Video.findById(videoId).select("_id").lean();
      if (!video) {
        return res.status(200).json({ status: false, message: "Video does not found." });
      }

      const listSkip = start === 1 ? 0 : skip - 1;
      const listLimit = start === 1 ? limit - 1 : limit;

      const [featuredVideo, paginatedVideos] = await Promise.all([
        start === 1 ? Video.aggregate(buildSingleVideoPipeline(videoId), { allowDiskUse: true }) : [],
        listLimit > 0 ? Video.aggregate(buildListPipeline(listSkip, listLimit, videoId), { allowDiskUse: true }) : [],
      ]);

      const allVideos = start === 1 ? [...featuredVideo, ...paginatedVideos] : paginatedVideos;

      return res.status(200).json({
        status: true,
        message: "Retrieve the videos uploaded by users.",
        seed,
        data: allVideos,
      });
    }

    const paginatedVideos = await Video.aggregate(buildListPipeline(skip, limit), { allowDiskUse: true });

    return res.status(200).json({
      status: true,
      message: "Retrieve the videos uploaded by users.",
      seed,
      data: paginatedVideos,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Sever Error" });
  }
};

//get particular song's videos
exports.fetchSongVideos = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Please provide a valid token." });
    }

    if (!req.query.songId) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const songId = new mongoose.Types.ObjectId(req.query.songId);
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const song = await Song.findOne({ _id: songId }).select("_id").lean();
    if (!song) {
      return res.status(200).json({ status: false, message: "Song does not found." });
    }

    const data = await Video.aggregate([
      {
        $facet: {
          totalVideos: [
            {
              $match: {
                songId: songId,
                isBanned: false,
              },
            },
            { $count: "count" },
          ],

          videos: [
            {
              $match: {
                songId: songId,
                isBanned: false,
              },
            },
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
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
                      gender: 1,
                      age: 1,
                      country: 1,
                      countryFlagImage: 1,
                      image: 1,
                      isProfilePicBanned: 1,
                      isVerified: 1,
                      isFake: 1,
                      uniqueId: 1,
                      activeAvtarFrame: 1,
                      wealthLevel: 1,
                    },
                  },
                ],
                as: "user",
              },
            },
            { $unwind: "$user" },
            {
              $lookup: {
                from: "blocks",
                localField: "user._id",
                foreignField: "toUserId",
                pipeline: [{ $match: { userId: userId } }, { $project: { _id: 1 } }],
                as: "isBlocked",
              },
            },
            { $match: { isBlocked: { $size: 0 } } },
            {
              $lookup: {
                from: "hashtags",
                localField: "hashTagId",
                foreignField: "_id",
                pipeline: [{ $project: { hashTag: 1 } }],
                as: "hashTag",
              },
            },
            {
              $lookup: {
                from: "avtarframes",
                localField: "user.activeAvtarFrame",
                foreignField: "_id",
                pipeline: [{ $project: { image: 1, type: 1 } }],
                as: "avtarframeDetails",
              },
            },
            {
              $lookup: {
                from: "likehistories",
                localField: "_id",
                foreignField: "videoId",
                pipeline: [{ $count: "count" }],
                as: "totalLikes",
              },
            },
            {
              $lookup: {
                from: "comments",
                localField: "_id",
                foreignField: "videoId",
                pipeline: [{ $count: "count" }],
                as: "totalComments",
              },
            },
            {
              $lookup: {
                from: "likehistories",
                localField: "_id",
                foreignField: "videoId",
                pipeline: [{ $match: { userId: userId } }, { $limit: 1 }],
                as: "likeHistory",
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "post.mentionedUserIds",
                foreignField: "_id",
                as: "mentionedUsers",
              },
            },
            {
              $lookup: {
                from: "avtarframes",
                localField: "mentionedUsers.activeAvtarFrame",
                foreignField: "_id",
                as: "mentionedUsersAvtarFrames",
              },
            },
            {
              $lookup: {
                from: "wealthlevels",
                localField: "mentionedUsers.wealthLevel",
                foreignField: "_id",
                as: "mentionedUsersWealthLevels",
              },
            },
            {
              $project: {
                _id: 1,
                caption: 1,
                isBanned: 1,
                videoImage: 1,
                videoUrl: 1,
                videoTime: 1,
                shareCount: 1,
                isFake: 1,
                songId: 1,
                createdAt: 1,
                hashTagId: "$hashTag._id",
                hashTag: "$hashTag.hashTag",
                userId: "$user._id",
                name: "$user.name",
                userName: "$user.userName",
                gender: "$user.gender",
                age: "$user.age",
                country: "$user.country",
                countryFlagImage: "$user.countryFlagImage",
                userImage: "$user.image",
                isProfilePicBanned: "$user.isProfilePicBanned",
                isVerified: "$user.isVerified",
                userIsFake: "$user.isFake",
                avtarFrame: { $ifNull: [{ $arrayElemAt: ["$avtarframeDetails.image", 0] }, ""] },
                avtarFrameType: { $ifNull: [{ $arrayElemAt: ["$avtarframeDetails.type", 0] }, 0] },
                isLike: { $gt: [{ $size: "$likeHistory" }, 0] },
                totalLikes: { $ifNull: [{ $arrayElemAt: ["$totalLikes.count", 0] }, 0] },
                totalComments: { $ifNull: [{ $arrayElemAt: ["$totalComments.count", 0] }, 0] },
                mentionedUsers: {
                  $map: {
                    input: "$mentionedUsers",
                    as: "m",
                    in: {
                      _id: "$$m._id",
                      name: "$$m.name",
                      userName: "$$m.userName",
                      uniqueId: "$$m.uniqueId",
                      image: "$$m.image",
                      isProfilePicBanned: "$$m.isProfilePicBanned",
                      isVerified: "$$m.isVerified",
                      isFake: "$$m.isFake",
                      gender: "$$m.gender",
                      age: "$$m.age",
                      coin: "$$m.coin",
                      avtarFrame: {
                        $let: {
                          vars: {
                            frame: {
                              $arrayElemAt: [
                                {
                                  $filter: {
                                    input: "$mentionedUsersAvtarFrames",
                                    as: "frame",
                                    cond: { $eq: ["$$frame._id", "$$m.activeAvtarFrame"] },
                                  },
                                },
                                0,
                              ],
                            },
                          },
                          in: { $ifNull: ["$$frame.image", ""] },
                        },
                      },
                      avtarFrameType: {
                        $let: {
                          vars: {
                            frame: {
                              $arrayElemAt: [
                                {
                                  $filter: {
                                    input: "$mentionedUsersAvtarFrames",
                                    as: "frame",
                                    cond: { $eq: ["$$frame._id", "$$m.activeAvtarFrame"] },
                                  },
                                },
                                0,
                              ],
                            },
                          },
                          in: { $ifNull: ["$$frame.type", 0] },
                        },
                      },
                      wealthLevelImage: {
                        $let: {
                          vars: {
                            wl: {
                              $arrayElemAt: [
                                {
                                  $filter: {
                                    input: "$mentionedUsersWealthLevels",
                                    as: "wl",
                                    cond: { $eq: ["$$wl._id", "$$m.wealthLevel"] },
                                  },
                                },
                                0,
                              ],
                            },
                          },
                          in: { $ifNull: ["$$wl.levelImage", ""] },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Retrive videos with the use of that song.",
      totalVideosOfSong: data[0].totalVideos[0]?.count || 0,
      videos: data[0].videos,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get videos where the logged-in user is mentioned
exports.listMentionedVideos = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        status: false,
        message: "Access denied. Please authenticate with a valid token.",
      });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    let now = dayjs();

    const mentionedUserId = req.query.toUserId ? new mongoose.Types.ObjectId(req.query.toUserId) : new mongoose.Types.ObjectId(req.user.userId);

    const videos = await Video.aggregate([
      {
        $match: {
          isBanned: false,
          mentionedUserIds: mentionedUserId, // filter posts where the user is mentioned
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (start - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                userName: 1,
                gender: 1,
                age: 1,
                country: 1,
                countryFlagImage: 1,
                image: 1,
                isProfilePicBanned: 1,
                isVerified: 1,
                isFake: 1,
                uniqueId: 1,
                activeAvtarFrame: 1,
                wealthLevel: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "blocks",
          localField: "user._id",
          foreignField: "toUserId",
          pipeline: [{ $match: { userId: mentionedUserId } }, { $project: { _id: 1 } }],
          as: "isBlocked",
        },
      },
      { $match: { isBlocked: { $eq: [] } } },
      {
        $lookup: {
          from: "songs",
          localField: "songId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                songTitle: 1,
                songImage: 1,
                songLink: 1,
                singerName: 1,
                songTime: 1,
              },
            },
          ],
          as: "song",
        },
      },
      {
        $unwind: { path: "$song", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "users",
          localField: "mentionedUserIds",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                userName: 1,
                uniqueId: 1,
                image: 1,
                isProfilePicBanned: 1,
                isVerified: 1,
                isFake: 1,
                gender: 1,
                age: 1,
                coin: 1,
                activeAvtarFrame: 1,
                wealthLevel: 1,
              },
            },
          ],
          as: "mentionedUsers",
        },
      },
      {
        $lookup: {
          from: "avtarframes",
          localField: "mentionedUsers.activeAvtarFrame",
          foreignField: "_id",
          pipeline: [{ $project: { image: 1, type: 1 } }],
          as: "mentionedUsersAvtarFrames",
        },
      },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "mentionedUsers.wealthLevel",
          foreignField: "_id",
          pipeline: [{ $project: { levelImage: 1 } }],
          as: "mentionedUsersWealthLevels",
        },
      },
      {
        $lookup: {
          from: "avtarframes",
          localField: "user.activeAvtarFrame",
          foreignField: "_id",
          pipeline: [{ $project: { image: 1, type: 1 } }],
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "hashtags",
          localField: "hashTagId",
          foreignField: "_id",
          pipeline: [{ $project: { hashTag: 1 } }],
          as: "hashTag",
        },
      },
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "videoId",
          pipeline: [{ $count: "count" }],
          as: "totalComments",
        },
      },
      {
        $lookup: {
          from: "likehistories",
          localField: "_id",
          foreignField: "videoId",
          pipeline: [{ $count: "count" }],
          as: "totalLikes",
        },
      },
      {
        $lookup: {
          from: "likehistories",
          localField: "_id",
          foreignField: "videoId",
          pipeline: [{ $match: { userId: mentionedUserId } }, { $limit: 1 }],
          as: "likeHistory",
        },
      },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "userId",
          foreignField: "toUserId",
          pipeline: [{ $match: { fromUserId: mentionedUserId } }, { $limit: 1 }],
          as: "isFollow",
        },
      },
      {
        $project: {
          _id: 1,
          caption: 1,
          isBanned: 1,
          videoImage: 1,
          videoUrl: 1,
          videoTime: 1,
          shareCount: 1,
          isFake: 1,
          songId: 1,
          createdAt: 1,
          hashTagId: "$hashTag._id",
          hashTag: "$hashTag.hashTag",
          userId: "$user._id",
          name: "$user.name",
          userName: "$user.userName",
          gender: "$user.gender",
          age: "$user.age",
          country: "$user.country",
          countryFlagImage: "$user.countryFlagImage",
          userImage: "$user.image",
          isProfilePicBanned: "$user.isProfilePicBanned",
          isVerified: "$user.isVerified",
          userIsFake: "$user.isFake",
          userUniqueId: "$user.uniqueId",
          songTitle: { $ifNull: ["$song.songTitle", ""] },
          songImage: { $ifNull: ["$song.songImage", ""] },
          songLink: { $ifNull: ["$song.songLink", ""] },
          singerName: { $ifNull: ["$song.singerName", ""] },
          songTime: { $ifNull: ["$song.songTime", ""] },
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          isLike: { $gt: [{ $size: "$likeHistory" }, 0] },
          totalLikes: { $ifNull: [{ $arrayElemAt: ["$totalLikes.count", 0] }, 0] },
          totalComments: { $ifNull: [{ $arrayElemAt: ["$totalComments.count", 0] }, 0] },
          isFollow: { $gt: [{ $size: "$isFollow" }, 0] },
          mentionedUsers: {
            $map: {
              input: "$mentionedUsers",
              as: "m",
              in: {
                $let: {
                  vars: {
                    frame: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$mentionedUsersAvtarFrames",
                            as: "f",
                            cond: { $eq: ["$$f._id", "$$m.activeAvtarFrame"] },
                          },
                        },
                        0,
                      ],
                    },
                    wl: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$mentionedUsersWealthLevels",
                            as: "w",
                            cond: { $eq: ["$$w._id", "$$m.wealthLevel"] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    _id: "$$m._id",
                    name: "$$m.name",
                    userName: "$$m.userName",
                    uniqueId: "$$m.uniqueId",
                    image: "$$m.image",
                    isProfilePicBanned: "$$m.isProfilePicBanned",
                    isVerified: "$$m.isVerified",
                    isFake: "$$m.isFake",
                    gender: "$$m.gender",
                    age: "$$m.age",
                    coin: "$$m.coin",
                    avtarFrame: { $ifNull: ["$$frame.image", ""] },
                    avtarFrameType: { $ifNull: ["$$frame.type", 0] },
                    wealthLevelImage: { $ifNull: ["$$wl.levelImage", ""] },
                  },
                },
              },
            },
          },
          time: {
            $let: {
              vars: {
                timeDiff: { $subtract: [now.toDate(), "$createdAt"] },
              },
              in: {
                $concat: [
                  {
                    $switch: {
                      branches: [
                        {
                          case: { $gte: ["$$timeDiff", 31536000000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 31536000000] } } }, " years ago"] },
                        },
                        {
                          case: { $gte: ["$$timeDiff", 2592000000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 2592000000] } } }, " months ago"] },
                        },
                        {
                          case: { $gte: ["$$timeDiff", 604800000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 604800000] } } }, " weeks ago"] },
                        },
                        {
                          case: { $gte: ["$$timeDiff", 86400000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 86400000] } } }, " days ago"] },
                        },
                        {
                          case: { $gte: ["$$timeDiff", 3600000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 3600000] } } }, " hours ago"] },
                        },
                        {
                          case: { $gte: ["$$timeDiff", 60000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 60000] } } }, " minutes ago"] },
                        },
                        {
                          case: { $gte: ["$$timeDiff", 1000] },
                          then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 1000] } } }, " seconds ago"] },
                        },
                        { case: true, then: "Just now" },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Posts where you are mentioned retrieved successfully.",
      data: videos,
    });
  } catch (error) {
    console.error("Error retrieving mentioned posts:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while retrieving mentioned posts. Please try again later.",
    });
  }
};
