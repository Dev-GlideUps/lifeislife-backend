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

//deleteFiles
const { deleteFile, deleteFiles } = require("../../util/deletefile");

//mongoose
const mongoose = require("mongoose");

//fs
const fs = require("fs");

//generateUniqueVideoOrPostId
const generateVideoOrPostUniqueId = require("../../util/generateVideoOrPostUniqueId");

//upload video
exports.uploadVideo = async (req, res, next) => {
  try {
    const { userId } = req.query;
    const { videoTime, caption, songId, hashTagId, mentionedUserIds } = req.body;

    if (!userId) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "userId must be requried." });
    }

    if (!videoTime || !req.files) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Oops! Invalid details." });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const mentionedUserIdsArray = Array.isArray(mentionedUserIds) ? mentionedUserIds : typeof mentionedUserIds === "string" ? mentionedUserIds.split(",").map((id) => id.trim()) : [];
    const hashTagsArray = Array.isArray(hashTagId) ? hashTagId : typeof hashTagId === "string" ? hashTagId.split(",").map((tag) => tag.trim()) : [];

    const [uniqueVideoId, user, mentionedUsers, song, fullHashTags] = await Promise.all([
      generateVideoOrPostUniqueId(),
      User.findOne({ _id: userObjectId, isFake: true }).select("_id name userName image fcmToken isBlock").lean(),
      mentionedUserIdsArray.length
        ? User.find({ _id: { $in: mentionedUserIdsArray }, isFake: true })
            .select("_id name userName image")
            .lean()
        : [],
      songId ? Song.findById(songId).select("_id").lean() : null,
      HashTag.find({ _id: { $in: hashTagsArray } }).lean(),
    ]);

    if (!user) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (!settingJSON || settingJSON.durationOfShorts < parseInt(videoTime)) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Invalid video duration." });
    }

    if (songId && !song) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Song not found." });
    }

    const video = new Video({
      isFake: true,
      userId: user._id,
      caption: caption || "",
      videoTime,
      songId: song ? song._id : null,
      videoImage: req.files.videoImage?.[0]?.path,
      videoUrl: req.files.videoUrl?.[0]?.path,
      hashTagId: hashTagsArray,
      mentionedUserIds: mentionedUsers.map((u) => u._id),
      uniqueVideoId,
    });

    await video.save();

    res.status(200).json({
      status: true,
      message: "Video uploaded successfully.",
      video: {
        ...video.toObject(),
        userId: user,
        hashTags: fullHashTags,
        mentionedUsers: mentionedUsers,
      },
    });

    if (hashTagsArray.length) {
      await Promise.all(
        hashTagsArray.map(async (tagId) => {
          const hashTag = await HashTag.findById(tagId);
          if (hashTag) {
            const usageHistory = new HashTagUsageHistory({
              hashTagCreator: user._id,
              hashTagId: hashTag._id,
              videoId: video._id,
            });
            await usageHistory.save();
          }
        }),
      );
    }
  } catch (error) {
    console.error("Upload Broadcast Video Error:", error);
    if (req.files) deleteFiles(req.files);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update video
exports.updateVideoData = async (req, res, next) => {
  try {
    if (!req.query.userId || !req.query.videoId) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Missing required parameters: videoId and userId." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);
    const videoId = new mongoose.Types.ObjectId(req.query.videoId);
    const mentionedUserIdsArray = req.body.mentionedUserIds ? req.body.mentionedUserIds.split(",").map((id) => id.trim()) : [];

    const [videoOfUser, song, mentionedUsers] = await Promise.all([
      Video.findOne({ _id: videoId, userId }).lean(),
      req.body.songId ? Song.findById(req.body.songId).select("_id").lean() : null,
      req.body.mentionedUserIds
        ? User.find({ _id: { $in: mentionedUserIdsArray } })
            .select("_id name userName image")
            .lean()
        : [],
    ]);

    if (!videoOfUser) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Video not found or does not belong to the user." });
    }

    if (req.body.songId && !song) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "The requested song does not exist." });
    }

    let hashTagsArray = videoOfUser.hashTagId;
    if (req.body.hashTagId) {
      hashTagsArray = req.body.hashTagId.split(",").map((tag) => tag.trim());
      await HashTagUsageHistory.deleteMany({ hashTagCreator: userId, videoId });

      await Promise.all(
        hashTagsArray.map(async (hashTagId) => {
          const tag = await HashTag.findById(hashTagId).select("_id").lean();
          if (tag) {
            await new HashTagUsageHistory({
              hashTagCreator: userId,
              hashTagId: tag._id,
              videoId: videoOfUser._id,
            }).save();
          }
        }),
      );
    }

    let mentionedUserIdList = videoOfUser.mentionedUserIds;
    if (req.body.mentionedUserIds) {
      mentionedUserIdList = mentionedUsers.map((u) => u._id);
    }

    if (req.files?.videoImage && videoOfUser.videoImage) {
      deleteFile(videoOfUser?.videoImage);
    }

    if (req.files?.videoUrl && videoOfUser.videoUrl) {
      deleteFile(videoOfUser?.videoUrl);
    }

    const updatedVideo = await Video.findOneAndUpdate(
      { _id: videoId, userId },
      {
        $set: {
          hashTagId: hashTagsArray,
          videoImage: req.files?.videoImage ? req.files.videoImage[0].path : videoOfUser.videoImage,
          videoUrl: req.files?.videoUrl ? req.files.videoUrl[0].path : videoOfUser.videoUrl,
          songId: req.body.songId ? song._id : videoOfUser.songId,
          caption: req.body.caption || videoOfUser.caption,
          mentionedUserIds: mentionedUserIdList,
        },
      },
      { new: true },
    )
      .populate("userId")
      .populate("hashTagId")
      .populate("mentionedUserIds", "_id name userName image")
      .lean();

    const responseVideo = {
      ...updatedVideo,
      userId: updatedVideo.userId,
      hashTags: updatedVideo.hashTagId,
      mentionedUsers: updatedVideo.mentionedUserIds,
    };

    res.status(200).json({
      status: true,
      message: "Video updated successfully",
      data: responseVideo,
    });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    console.error(error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while updating the video. Please try again later.",
    });
  }
};

//get video statistics (total / real / fake / banned)
exports.fetchVideoStatistics = async (req, res) => {
  try {
    const result = await Video.aggregate([
      {
        $group: {
          _id: null,
          totalVideos: { $sum: 1 },
          realVideos: {
            $sum: {
              $cond: [{ $eq: ["$isFake", false] }, 1, 0],
            },
          },
          fakeVideos: {
            $sum: {
              $cond: [{ $eq: ["$isFake", true] }, 1, 0],
            },
          },
          bannedVideos: {
            $sum: {
              $cond: [{ $eq: ["$isBanned", true] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalVideos: 1,
          realVideos: 1,
          fakeVideos: 1,
          bannedVideos: 1,
        },
      },
    ]);

    const data = result[0] || {
      totalVideos: 0,
      realVideos: 0,
      fakeVideos: 0,
      bannedVideos: 0,
    };

    return res.status(200).json({
      status: true,
      message: "Video statistics fetched successfully.",
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get real or fake videos
exports.fetchVideos = async (req, res, next) => {
  try {
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";
    const start = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 20;

    if (start < 1 || limit < 1) {
      return res.status(200).json({ status: false, message: "Invalid pagination." });
    }

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const formatStartDate = new Date(startDate);
      const formatEndDate = new Date(endDate);
      formatEndDate.setHours(23, 59, 59, 999);

      dateFilterQuery.createdAt = {
        $gte: formatStartDate,
        $lte: formatEndDate,
      };
    }

    const type = req.query.type?.trim();
    const isFake = type === "fakeVideo" ? true : type === "realVideo" ? false : null;

    if (isFake === null) {
      return res.status(200).json({
        status: false,
        message: "Invalid 'type' parameter. Use 'realVideo' or 'fakeVideo'.",
      });
    }

    const search = req?.query?.search?.trim() || "";
    const matchQuery = { isFake, ...dateFilterQuery };

    const result = await Video.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, userName: 1, image: 1, uniqueId: 1 } }],
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $lookup: {
          from: "users",
          localField: "mentionedUserIds",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, userName: 1, image: 1, uniqueId: 1 } }],
          as: "mentionedUsers",
        },
      },
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { caption: { $regex: search, $options: "i" } },
                  { "user.name": { $regex: search, $options: "i" } },
                  { "user.userName": { $regex: search, $options: "i" } },
                  { "user.uniqueId": { $regex: search, $options: "i" } },
                  { "mentionedUsers.name": { $regex: search, $options: "i" } },
                  { "mentionedUsers.userName": { $regex: search, $options: "i" } },
                  { "mentionedUsers.uniqueId": { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
        : []),
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          videos: [
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "hashtags",
                localField: "hashTagId",
                foreignField: "_id",
                pipeline: [{ $project: { hashTag: 1 } }],
                as: "hashTags",
              },
            },
            {
              $lookup: {
                from: "comments",
                localField: "_id",
                foreignField: "videoId",
                pipeline: [
                  {
                    $group: {
                      _id: null,
                      count: { $sum: 1 },
                    },
                  },
                ],
                as: "totalComments",
              },
            },
            {
              $lookup: {
                from: "likehistories",
                localField: "_id",
                foreignField: "videoId",
                pipeline: [
                  {
                    $group: {
                      _id: null,
                      count: { $sum: 1 },
                    },
                  },
                ],
                as: "totalLikes",
              },
            },
            {
              $addFields: {
                totalLikes: {
                  $ifNull: [{ $arrayElemAt: ["$totalLikes.count", 0] }, 0],
                },
                totalComments: {
                  $ifNull: [{ $arrayElemAt: ["$totalComments.count", 0] }, 0],
                },
              },
            },
            {
              $project: {
                _id: 1,
                caption: 1,
                videoTime: 1,
                videoUrl: 1,
                videoImage: 1,
                isFake: 1,
                createdAt: 1,
                totalLikes: 1,
                totalComments: 1,
                userId: "$user._id",
                name: "$user.name",
                userName: "$user.userName",
                uniqueId: "$user.uniqueId",
                userImage: "$user.image",
                hashTags: 1,
                mentionedUsers: {
                  $map: {
                    input: "$mentionedUsers",
                    as: "user",
                    in: {
                      _id: "$$user._id",
                      name: "$$user.name",
                      userName: "$$user.userName",
                      uniqueId: "$$user.uniqueId",
                      image: "$$user.image",
                    },
                  },
                },
              },
            },
          ],
        },
      },
      {
        $project: {
          videos: 1,
          totalVideo: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] },
        },
      },
    ]);

    const finalResult = result[0] || { videos: [], totalVideo: 0 };

    return res.status(200).json({
      status: true,
      message: `Retrieved ${isFake ? "fake" : "real"} videos of the users.`,
      totalVideo: finalResult.totalVideo,
      videos: finalResult.videos,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get user's videos
exports.getUserMediaLibrary = async (req, res) => {
  try {
    const { userId, start, limit } = req.query;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(200).json({ status: false, message: "userId is missing or invalid." });
    }

    const pageStart = parseInt(start) || 1;
    const pageLimit = parseInt(limit) || 20;

    if (pageStart < 1 || pageLimit < 1) {
      return res.status(200).json({ status: false, message: "Invalid pagination." });
    }

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const formatStartDate = new Date(startDate);
      const formatEndDate = new Date(endDate);
      formatEndDate.setHours(23, 59, 59, 999);

      dateFilterQuery.createdAt = {
        $gte: formatStartDate,
        $lte: formatEndDate,
      };
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const now = new Date();

    const result = await Video.aggregate([
      { $match: { userId: userObjectId, ...dateFilterQuery } },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (pageStart - 1) * pageLimit },
            { $limit: pageLimit },
            {
              $lookup: {
                from: "users",
                localField: "mentionedUserIds",
                foreignField: "_id",
                pipeline: [{ $project: { name: 1, userName: 1, image: 1 } }],
                as: "mentionedUsers",
              },
            },
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
                pipeline: [{ $project: { hashTag: 1 } }],
                as: "hashTag",
              },
            },
            {
              $lookup: {
                from: "likehistories",
                localField: "_id",
                foreignField: "videoId",
                pipeline: [
                  {
                    $group: {
                      _id: null,
                      count: { $sum: 1 },
                    },
                  },
                ],
                as: "totalLikes",
              },
            },
            {
              $lookup: {
                from: "comments",
                localField: "_id",
                foreignField: "videoId",
                pipeline: [
                  {
                    $group: {
                      _id: null,
                      count: { $sum: 1 },
                    },
                  },
                ],
                as: "comments",
              },
            },
            {
              $addFields: {
                totalLikes: {
                  $ifNull: [{ $arrayElemAt: ["$totalLikes.count", 0] }, 0],
                },
                totalComments: {
                  $ifNull: [{ $arrayElemAt: ["$comments.count", 0] }, 0],
                },
              },
            },
            {
              $project: {
                _id: 1,
                userId: 1,
                caption: 1,
                isBanned: 1,
                videoImage: 1,
                videoUrl: 1,
                videoTime: 1,
                shareCount: 1,
                isFake: 1,
                createdAt: 1,
                songTitle: { $ifNull: ["$song.songTitle", ""] },
                songImage: { $ifNull: ["$song.songImage", ""] },
                songLink: { $ifNull: ["$song.songLink", ""] },
                singerName: { $ifNull: ["$song.singerName", ""] },
                hashTagId: "$hashTag._id",
                hashTag: "$hashTag.hashTag",
                totalLikes: 1,
                totalComments: 1,
                mentionedUsers: {
                  $map: {
                    input: "$mentionedUsers",
                    as: "user",
                    in: {
                      _id: "$$user._id",
                      name: "$$user.name",
                      userName: "$$user.userName",
                      image: "$$user.image",
                    },
                  },
                },
                time: {
                  $let: {
                    vars: {
                      timeDiff: { $subtract: [now, "$createdAt"] },
                    },
                    in: {
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
                  },
                },
              },
            },
          ],
        },
      },
      {
        $project: {
          data: 1,
          total: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] },
        },
      },
    ]);

    const finalResult = result[0] || { data: [], total: 0 };

    return res.status(200).json({
      status: true,
      message: "Successfully retrieved videos for the requested user.",
      total: finalResult.total,
      data: finalResult.data,
    });
  } catch (error) {
    console.error("Error fetching user videos:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

//delete video
exports.removeVideoFromLibrary = async (req, res) => {
  try {
    if (!req.query.userId || !req.query.videoId) {
      return res.status(200).json({ status: false, message: "Missing required parameter: videoId or userId." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);
    const videoId = new mongoose.Types.ObjectId(req.query.videoId);

    const video = await Video.findOne({ _id: videoId, userId: userId }).select("_id videoImage videoUrl");

    if (!video) {
      return res.status(200).json({ status: false, message: "Video does not found for that user." });
    }

    res.status(200).json({
      status: true,
      message: "Video successfully deleted.",
    });

    if (video?.videoImage) {
      deleteFile(video?.videoImage);
    }

    if (video?.videoUrl) {
      deleteFile(video?.videoUrl);
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
