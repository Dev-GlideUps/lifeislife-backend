const Song = require("../../models/song.model");

//fs
const fs = require("fs");

//import model
const SongFavorite = require("../../models/songFavorite.model");
const SongCategory = require("../../models/songCategory.model");
const Notification = require("../../models/notification.model");
const Video = require("../../models/video.model");
const Report = require("../../models/report.model");
const HashTagUsageHistory = require("../../models/hashTagUsageHistory.model");
const WatchHistory = require("../../models/watchHistory.model");
const LikeHistory = require("../../models/likeHistory.model");
const Comment = require("../../models/comment.model");

//deleteFiles
const { deleteFile, deleteFiles } = require("../../util/deletefile");

//create song
exports.addSong = async (req, res) => {
  try {
    const { singerName, songTitle, songTime, songCategoryId } = req.body;
    if (!singerName || !songTitle || !songTime || !songCategoryId || !req.files) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Invalid details!" });
    }

    const songCategory = await SongCategory.findById(songCategoryId).select("_id name image").lean();
    if (!songCategory) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Song category not found!" });
    }

    const song = await new Song({
      singerName,
      songTitle,
      songTime,
      songImage: req.files.songImage ? req.files.songImage[0].path : "",
      songLink: req.files.songLink ? req.files.songLink[0].path : "",
      songCategoryId: songCategory._id,
    }).save();

    return res.status(200).json({ status: true, message: "Song added.", data: { ...song.toObject(), songCategory } });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//update song
exports.modifySong = async (req, res) => {
  try {
    const { songId } = req.body;

    if (!songId) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Invalid song ID!" });
    }

    const [song, songCategory] = await Promise.all([Song.findById(songId), req.body.songCategoryId ? SongCategory.findById(req.body.songCategoryId).lean().select("_id name image") : null]);

    if (!song) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Song not found!" });
    }

    if (req.body.songCategoryId && !songCategory) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Song category not found!" });
    }

    song.songCategoryId = req.body.songCategoryId ? songCategory._id : song.songCategoryId;
    song.singerName = req.body.singerName ? req.body.singerName : song.singerName;
    song.songTitle = req.body.songTitle ? req.body.songTitle : song.songTitle;
    song.songTime = req.body.songTime ? req.body.songTime : song.songTime;

    if (req?.files?.songImage) {
      deleteFile(song?.songImage);
      song.songImage = req?.files?.songImage[0].path;
    }

    if (req?.files?.songLink) {
      deleteFile(song?.songLink);
      song.songLink = req?.files?.songLink[0].path;
    }

    await song.save();

    return res.status(200).json({
      status: true,
      message: "Song updated.",
      data: { ...song.toObject(), songCategory },
    });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get songs
exports.fetchSongs = async (req, res) => {
  try {
    const start = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let matchQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const formatStartDate = new Date(startDate);
      const formatEndDate = new Date(endDate);
      formatEndDate.setHours(23, 59, 59, 999);
      matchQuery.createdAt = { $gte: formatStartDate, $lte: formatEndDate };
    }

    if (search.trim() !== "") {
      const regex = { $regex: search, $options: "i" };
      matchQuery.$or = [{ singerName: regex }, { songTitle: regex }];
    }

    const result = await Song.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "songcategories",
          localField: "songCategoryId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, image: 1 } }],
          as: "songCategory",
        },
      },
      { $unwind: { path: "$songCategory", preserveNullAndEmptyArrays: true } },
      {
        $facet: {
          totalCount: [{ $count: "total" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $project: {
                singerName: 1,
                songTitle: 1,
                songTime: 1,
                songImage: 1,
                songLink: 1,
                createdAt: 1,
                songCategoryId: "$songCategory",
              },
            },
          ],
        },
      },
    ]);

    const totalSongs = result[0]?.totalCount[0]?.total || 0;
    const songs = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Songs retrieved.",
      total: totalSongs,
      data: songs,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//delete song
exports.removeSong = async (req, res) => {
  try {
    if (!req.query.songId) {
      return res.status(200).json({ status: false, message: "songId is required!" });
    }

    const songIds = req.query.songId.split(",");

    const songs = await Promise.all(songIds.map((Id) => Song.findById(Id)));
    if (songs.some((song) => !song)) {
      return res.status(200).json({ status: false, message: "No songs found with the provided IDs." });
    }

    res.status(200).json({
      status: true,
      message: "Songs deleted successfully.",
    });

    await songs.map(async (song) => {
      deleteFile(song?.songImage);
      deleteFile(song?.songLink);

      const videos = await Video.find({ songId: song._id }).lean();

      await videos.map(async (video) => {
        if (video.videoImage) {
          deleteFile(video?.videoImage);
        }

        if (video.videoUrl) {
          deleteFile(video?.videoUrl);
        }

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

      await SongFavorite.deleteMany({ songId: song?._id });
      await song.deleteOne();
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
