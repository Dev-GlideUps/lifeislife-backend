const FakeLiveStreamer = require("../../models/fakeLiveStreamer.model");
const User = require("../../models/user.model");

const fs = require("fs");
const path = require("path");

const mongoose = require("mongoose");
const { deleteFile, deleteFiles } = require("../../util/deletefile");

//create fake liveStreamer
exports.registerFakeUserWithStream = async (req, res) => {
  try {
    const { streamType, thumbnailType, thumbnail, roomName, roomWelcome, pkThumbnails, streamSourceType, streamSource, multiLiveStreamSources, pkStreamSources, userId, multiLiveThumbnails } =
      req.body;

    if (!req.files || !streamType) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Missing required fields." });
    }

    const [user, existingStream] = await Promise.all([
      User.findOne({ _id: userId, isFake: true }).select("_id name image").lean(),
      FakeLiveStreamer.findOne({ userId, streamType: parseInt(streamType) }),
    ]);

    if (!user) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (existingStream) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({
        status: false,
        message: `Stream with streamType ${streamType} already exists for this fake user.`,
      });
    }

    let streamMeta = {
      userId,
      isStreaming: true,
      streamType: parseInt(streamType),
    };

    if (streamType == 1 || streamType == 2) {
      streamMeta.thumbnailType = parseInt(thumbnailType);
      streamMeta.streamSourceType = parseInt(streamSourceType);

      // Handle file or link for thumbnail
      if (streamMeta.thumbnailType === 2 && req.files.thumbnail?.length) {
        streamMeta.thumbnail = req.files.thumbnail[0].path.replace(/\\/g, "/");
      } else {
        streamMeta.thumbnail = thumbnail || "";
      }

      // Handle file or link for streamSource
      if (streamMeta.streamSourceType === 2 && req.files.streamSource?.length) {
        streamMeta.streamSource = req.files.streamSource[0].path.replace(/\\/g, "/");
      } else {
        streamMeta.streamSource = streamSource || "";
      }
    }

    if (streamType == 2) {
      streamMeta.roomName = roomName || "";
      streamMeta.roomWelcome = roomWelcome || "";
    }

    if (streamType == 3) {
      streamMeta.thumbnailType = parseInt(thumbnailType);
      streamMeta.streamSourceType = parseInt(streamSourceType);

      // pkThumbnails
      if (streamMeta.thumbnailType === 2 && req.files.pkThumbnails?.length) {
        streamMeta.pkThumbnails = req.files.pkThumbnails.map((file) => file.path.replace(/\\/g, "/"));
      } else if (typeof pkThumbnails === "string") {
        streamMeta.pkThumbnails = pkThumbnails.split(",").map((item) => item.trim());
      } else if (Array.isArray(pkThumbnails)) {
        streamMeta.pkThumbnails = pkThumbnails;
      } else {
        streamMeta.pkThumbnails = [];
      }

      // pkStreamSources
      if (streamMeta.streamSourceType === 2 && req.files.pkStreamSources?.length) {
        streamMeta.pkStreamSources = req.files.pkStreamSources.map((file) => file.path.replace(/\\/g, "/"));
      } else if (typeof pkStreamSources === "string") {
        streamMeta.pkStreamSources = pkStreamSources.split(",").map((item) => item.trim());
      } else if (Array.isArray(pkStreamSources)) {
        streamMeta.pkStreamSources = pkStreamSources;
      } else {
        streamMeta.pkStreamSources = [];
      }
    }

    if (streamType == 4) {
      streamMeta.thumbnailType = parseInt(thumbnailType);
      streamMeta.streamSourceType = parseInt(streamSourceType);

      if (streamMeta.thumbnailType === 2 && req.files.multiLiveThumbnails?.length) {
        streamMeta.multiLiveThumbnails = req.files.multiLiveThumbnails.map((file) => file.path.replace(/\\/g, "/"));
      } else if (typeof multiLiveThumbnails === "string") {
        streamMeta.multiLiveThumbnails = multiLiveThumbnails.split(",").map((item) => item.trim());
      } else if (Array.isArray(multiLiveThumbnails)) {
        streamMeta.multiLiveThumbnails = multiLiveThumbnails;
      } else {
        streamMeta.multiLiveThumbnails = [];
      }

      if (streamMeta.streamSourceType === 2 && req.files.multiLiveStreamSources?.length) {
        streamMeta.multiLiveStreamSources = req.files.multiLiveStreamSources.map((file) => file.path.replace(/\\/g, "/"));
      } else if (typeof multiLiveStreamSources === "string") {
        streamMeta.multiLiveStreamSources = multiLiveStreamSources.split(",").map((item) => item.trim());
      } else if (Array.isArray(multiLiveStreamSources)) {
        streamMeta.multiLiveStreamSources = multiLiveStreamSources;
      } else {
        streamMeta.multiLiveStreamSources = [];
      }
    }

    const stream = await new FakeLiveStreamer(streamMeta).save();

    return res.status(200).json({
      status: true,
      message: "Fake user with stream data successfully created.",
      data: { ...stream.toObject(), userId: user },
    });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update fake liveStreamer
exports.updateFakeUserStream = async (req, res) => {
  try {
    const {
      streamerId,
      streamType,
      thumbnailType,
      thumbnail,
      roomName,
      roomWelcome,
      pkThumbnails,
      streamSourceType,
      streamSource,
      pkStreamSources,
      userId,
      multiLiveThumbnails,
      multiLiveStreamSources,
    } = req.body;

    if (!userId || !streamType || !streamerId) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Missing required fields." });
    }

    const [user, stream] = await Promise.all([User.findOne({ _id: userId, isFake: true }).select("_id name image").lean(), FakeLiveStreamer.findOne({ _id: streamerId, userId, streamType })]);

    if (!user) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (!stream) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Stream not found." });
    }

    const arrayFields = ["removeMultiLiveThumbnailIndexes", "removeMultiLiveStreamSourcesIndexes"];
    for (const key of arrayFields) {
      if (req.body[key]) {
        if (typeof req.body[key] === "string") {
          try {
            req.body[key] = JSON.parse(req.body[key]);
          } catch (e) {
            if (req.files) deleteFiles(req.files);
            return res.status(200).json({
              status: false,
              message: `Invalid format for '${key}'. It must be a valid JSON array.`,
            });
          }
        }

        if (!Array.isArray(req.body[key])) {
          if (req.files) deleteFiles(req.files);
          return res.status(200).json({ status: false, message: `'${key}' must be an array.` });
        }
      }
    }

    if (streamType == 2) {
      stream.roomName = roomName || stream.roomName;
      stream.roomWelcome = roomWelcome || stream.roomWelcome;
    }

    if ((streamType == 1 || streamType == 2) && thumbnailType == 2) {
      const newThumbFile = req.files?.thumbnail?.[0];
      if (newThumbFile) {
        if (stream.thumbnail && stream.thumbnail !== newThumbFile.path) {
          deleteFile(stream.thumbnail);
        }
        stream.thumbnailType = parseInt(thumbnailType);
        stream.thumbnail = newThumbFile.path.replace(/\\/g, "/");
      }
    } else if ((streamType == 1 || streamType == 2) && thumbnailType == 1) {
      stream.thumbnailType = 1;
      stream.thumbnail = thumbnail || stream.thumbnail;
    }

    if ((streamType == 1 || streamType == 2) && streamSourceType == 2) {
      const newSrcFile = req.files?.streamSource?.[0];
      if (newSrcFile) {
        if (stream.streamSource && stream.streamSource !== newSrcFile.path) {
          deleteFile(stream.streamSource);
        }
        stream.streamSourceType = parseInt(streamSourceType);
        stream.streamSource = newSrcFile.path.replace(/\\/g, "/");
      }
    } else if ((streamType == 1 || streamType == 2) && streamSourceType == 1) {
      stream.streamSourceType = 1;
      stream.streamSource = streamSource || stream.streamSource;
    }

    if (streamType == 3) {
      stream.thumbnailType = parseInt(thumbnailType);
      stream.streamSourceType = parseInt(streamSourceType);

      if (thumbnailType == 2 && req.files?.pkThumbnails?.length) {
        if (Array.isArray(stream.pkThumbnails)) {
          stream.pkThumbnails.forEach((url) => {
            if (url) {
              deleteFile(url);
            }
          });
        }
        stream.pkThumbnails = req.files.pkThumbnails.map((file) => file.path.replace(/\\/g, "/"));
      } else if (thumbnailType == 1) {
        if (typeof pkThumbnails === "string") {
          stream.pkThumbnails = pkThumbnails.split(",").map((item) => item.trim());
        } else if (Array.isArray(pkThumbnails)) {
          stream.pkThumbnails = pkThumbnails;
        }
      }

      if (streamSourceType == 2 && req.files?.pkStreamSources?.length) {
        if (Array.isArray(stream.pkStreamSources)) {
          stream.pkStreamSources.forEach((url) => {
            if (url) {
              deleteFile(url);
            }
          });
        }
        stream.pkStreamSources = req.files.pkStreamSources.map((file) => file.path.replace(/\\/g, "/"));
      } else if (streamSourceType == 1) {
        if (typeof pkStreamSources === "string") {
          stream.pkStreamSources = pkStreamSources.split(",").map((item) => item.trim());
        } else if (Array.isArray(pkStreamSources)) {
          stream.pkStreamSources = pkStreamSources;
        }
      }
    }

    if (streamType == 4) {
      stream.thumbnailType = parseInt(thumbnailType);
      stream.streamSourceType = parseInt(streamSourceType);

      if (Array.isArray(req.body.removeMultiLiveThumbnailIndexes)) {
        const sorted = req.body.removeMultiLiveThumbnailIndexes
          .map(Number)
          .filter((i) => !isNaN(i))
          .sort((a, b) => b - a);
        for (const i of sorted) {
          const thumbnailPath = stream.multiLiveThumbnails?.[i];
          deleteFile(thumbnailPath);
          stream.multiLiveThumbnails.splice(i, 1);
        }
      }

      if (thumbnailType == 2 && req.files?.multiLiveThumbnails?.length) {
        const newThumbnails = req.files.multiLiveThumbnails.map((file) => file.path.replace(/\\/g, "/"));
        stream.multiLiveThumbnails = stream.multiLiveThumbnails.concat(newThumbnails);
      } else if (thumbnailType == 1) {
        if (typeof multiLiveThumbnails === "string") {
          stream.multiLiveThumbnails = multiLiveThumbnails.split(",").map((item) => item.trim());
        } else if (Array.isArray(multiLiveThumbnails)) {
          stream.multiLiveThumbnails = multiLiveThumbnails;
        }
      }

      if (Array.isArray(req.body.removeMultiLiveStreamSourcesIndexes)) {
        const sorted = req.body.removeMultiLiveStreamSourcesIndexes
          .map(Number)
          .filter((i) => !isNaN(i))
          .sort((a, b) => b - a);
        for (const i of sorted) {
          const videoPath = stream.multiLiveStreamSources?.[i];
          if (videoPath) {
            deleteFile(videoPath);
            console.log(`🗑️ Deleted video[${i}]: ${videoPath}`);
          }
          stream.multiLiveStreamSources.splice(i, 1);
        }
      }

      if (streamSourceType == 2 && req.files?.multiLiveStreamSources?.length) {
        const newVideos = req.files.multiLiveStreamSources.map((file) => file.path.replace(/\\/g, "/"));
        stream.multiLiveStreamSources = stream.multiLiveStreamSources.concat(newVideos);
      } else if (streamSourceType == 1) {
        if (typeof multiLiveStreamSources === "string") {
          stream.multiLiveStreamSources = multiLiveStreamSources.split(",").map((item) => item.trim());
        } else if (Array.isArray(multiLiveStreamSources)) {
          stream.multiLiveStreamSources = multiLiveStreamSources;
        }
      }
    }

    await stream.save();

    return res.status(200).json({
      status: true,
      message: "Stream updated successfully.",
      data: { ...stream.toObject(), userId: user },
    });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//toggles the isStreaming status for the fakeLiveStreamer
exports.toggleStreamerStreamingStatus = async (req, res, next) => {
  try {
    const { streamerId } = req.query;

    if (!streamerId) {
      return res.status(200).json({ status: false, message: "Streamer ID is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(streamerId)) {
      return res.status(200).json({ status: false, message: "Invalid streamerId. Please provide a valid ObjectId." });
    }

    const streamer = await FakeLiveStreamer.findById(streamerId);
    if (!streamer) {
      return res.status(200).json({ status: false, message: "Streamer not found." });
    }

    streamer.isStreaming = !streamer.isStreaming;
    await streamer.save();

    return res.status(200).json({
      status: true,
      message: `Streamer has been ${streamer.isStreaming ? "set to streaming" : "stopped streaming"} successfully.`,
      data: streamer,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating streamer status." });
  }
};

//get fake liveStreamer
exports.getFakeLiveStreamers = async (req, res) => {
  try {
    const { streamType } = req.query;

    if (!streamType) {
      return res.status(200).json({ status: false, message: "streamType is required." });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let matchQuery = {};

    if (startDate !== "All" && endDate !== "All") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      matchQuery.createdAt = {
        $gte: startDateObj,
        $lte: endDateObj,
      };
    }

    const result = await FakeLiveStreamer.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          stats: [
            {
              $group: {
                _id: null,
                totalFakeLiveStreamer: { $sum: 1 },
                totalVideoLive: {
                  $sum: {
                    $cond: [{ $eq: ["$streamType", 1] }, 1, 0],
                  },
                },
                totalAudioLive: {
                  $sum: {
                    $cond: [{ $eq: ["$streamType", 2] }, 1, 0],
                  },
                },
                totalPkBattle: {
                  $sum: {
                    $cond: [{ $eq: ["$streamType", 3] }, 1, 0],
                  },
                },
              },
            },
          ],

          total: [
            {
              $match: { streamType: Number(streamType) },
            },
            { $count: "count" },
          ],

          data: [
            {
              $match: { streamType: Number(streamType) },
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
                      image: 1,
                    },
                  },
                ],
                as: "userId",
              },
            },
            {
              $unwind: {
                path: "$userId",
                preserveNullAndEmptyArrays: true,
              },
            },
          ],
        },
      },
    ]);

    const stats = result[0]?.stats[0] || {};
    const total = result[0]?.total[0]?.count || 0;
    const data = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Fake live streamers fetched successfully.",
      totalFakeLiveStreamer: stats.totalFakeLiveStreamer || 0,
      totalVideoLive: stats.totalVideoLive || 0,
      totalAudioLive: stats.totalAudioLive || 0,
      totalPkBattle: stats.totalPkBattle || 0,
      total,
      data,
    });
  } catch (error) {
    console.error("Error fetching fake live streamers:", error);
    return res.status(500).json({ status: false, message: "Failed to fetch fake live streamers. Please try again later." });
  }
};

//delete fake liveStreamer
exports.deleteFakeLiveStreamer = async (req, res) => {
  try {
    const { streamerId } = req.query;

    if (!streamerId || !streamerId.trim() || !mongoose.Types.ObjectId.isValid(streamerId)) {
      return res.status(200).json({ status: false, message: "Invalid or missing streamerId." });
    }

    const fakeStreamer = await FakeLiveStreamer.findById(streamerId);
    if (!fakeStreamer) {
      return res.status(200).json({ status: false, message: "Fake live streamer not found." });
    }

    res.status(200).json({
      status: true,
      message: "Fake live streamer deleted successfully.",
    });

    if (fakeStreamer.thumbnail) {
      deleteFile(fakeStreamer.thumbnail);
    }

    if (Array.isArray(fakeStreamer.multiLiveThumbnails)) {
      fakeStreamer.multiLiveThumbnails.forEach((url) => {
        deleteFile(url);
      });
    }

    if (Array.isArray(fakeStreamer.pkThumbnails)) {
      fakeStreamer.pkThumbnails.forEach((url) => {
        deleteFile(url);
      });
    }

    if (fakeStreamer.streamSource) {
      deleteFile(fakeStreamer.streamSource);
    }

    if (Array.isArray(fakeStreamer.multiLiveStreamSources)) {
      fakeStreamer.multiLiveStreamSources.forEach((url) => {
        deleteFile(url);
      });
    }

    if (Array.isArray(fakeStreamer.pkStreamSources)) {
      fakeStreamer.pkStreamSources.forEach((url) => {
        deleteFile(url);
      });
    }

    await FakeLiveStreamer.findByIdAndDelete(streamerId);
  } catch (error) {
    console.error("Error deleting fake live streamer:", error);
    return res.status(500).json({ status: false, message: "Failed to delete fake live streamer. Please try again." });
  }
};
