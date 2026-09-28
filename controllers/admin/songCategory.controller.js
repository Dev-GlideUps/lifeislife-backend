const SongCategory = require("../../models/songCategory.model");

//import model
const Song = require("../../models/song.model");
const SongFavorite = require("../../models/songFavorite.model");
const Notification = require("../../models/notification.model");
const Video = require("../../models/video.model");
const Report = require("../../models/report.model");
const HashTagUsageHistory = require("../../models/hashTagUsageHistory.model");
const WatchHistory = require("../../models/watchHistory.model");
const LikeHistory = require("../../models/likeHistory.model");
const Comment = require("../../models/comment.model");

//fs
const fs = require("fs");

//deletefile
const { deleteFile } = require("../../util/deletefile");

//create songCategory
exports.createSongCategory = async (req, res) => {
  try {
    if (!req.body.name || !req.file) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Invalid details!" });
    }

    const songCategory = await new SongCategory({
      name: req.body.name,
      image: req.file.path,
    }).save();

    return res.status(200).json({
      status: true,
      message: "SongCategory created successfully!",
      songCategory,
    });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, error: error.message });
  }
};

//update songCategory
exports.modifySongCategory = async (req, res) => {
  try {
    const { songCategoryId } = req.body;

    if (!songCategoryId) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "songCategoryId is required!" });
    }

    const songCategory = await SongCategory.findById(songCategoryId);
    if (!songCategory) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "SongCategory not found!" });
    }

    if (req.file) {
      if (songCategory?.image) {
        deleteFile(songCategory?.image);
      }

      songCategory.image = req?.file?.path;
    }

    songCategory.name = req.body.name ? req.body.name.trim() : songCategory.name;
    await songCategory.save();

    return res.status(200).json({ status: true, message: "SongCategory updated!", songCategory });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.log(error);
    return res.status(500).json({ status: false, error: error.message });
  }
};

//get songCategories
exports.fetchAllSongCategories = async (req, res) => {
  try {
    const start = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req?.query?.search || "";

    const matchQuery = {};

    if (search && search.trim() !== "") {
      const regex = { $regex: search, $options: "i" };
      matchQuery.$or = [{ name: regex }];
    }

    const result = await SongCategory.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          totalCount: [{ $count: "total" }],
          categories: [{ $sort: { createdAt: -1 } }, { $skip: (start - 1) * limit }, { $limit: limit }, { $project: { name: 1, image: 1, createdAt: 1, updatedAt: 1 } }],
        },
      },
    ]);

    const total = result[0]?.totalCount[0]?.total || 0;
    const categories = result[0]?.categories || [];

    return res.status(200).json({
      status: true,
      message: "SongCategories retrieved!",
      total,
      categories,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//delete songCategory
exports.removeSongCategory = async (req, res) => {
  try {
    const { songCategoryId } = req.query;
    if (!songCategoryId) {
      return res.status(200).json({ status: false, message: "songCategoryId is required!" });
    }

    const songCategory = await SongCategory.findById(songCategoryId);
    if (!songCategory) {
      return res.status(200).json({ status: false, message: "SongCategory not found!" });
    }

    res.status(200).json({
      status: true,
      message: "SongCategory deleted successfully!",
    });

    if (songCategory?.image) {
      deleteFile(songCategory?.image);
    }

    const songs = await Song.find({ songCategoryId }).select("_id songImage songLink").lean();

    await songs.map(async (song) => {
      deleteFile(song?.songImage);
      deleteFile(song?.songLink);

      const videos = await Video.find({ songId: song._id }).select("_id videoImage videoUrl userId").lean();

      await videos.map(async (video) => {
        deleteFile(video?.videoImage);
        deleteFile(video?.videoUrl);

        await Promise.all([
          WatchHistory.deleteMany({ videoId: video._id }),
          LikeHistory.deleteMany({ videoId: video._id }),
          Comment.deleteMany({ videoId: video._id }),
          HashTagUsageHistory.deleteMany({ videoId: video._id }),
          Report.deleteMany({ videoId: video._id }),
          Notification.deleteMany({ $or: [{ otherUserId: video?.userId }, { userId: video?.userId }] }),
          Video.deleteOne({ _id: video._id }),
        ]);
      });

      await Promise.all([SongFavorite.deleteMany({ songId: song._id }), Song.deleteOne({ _id: song._id })]);
    });

    await songCategory.deleteOne();
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
