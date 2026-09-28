const Song = require("../../models/song.model");

//mongoose
const mongoose = require("mongoose");

//import model
const SongFavorite = require("../../models/songFavorite.model");

//get songs (when upload video by the user)
exports.fetchSongs = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized access. Please provide a valid token.",
      });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const start = parseInt(req.query.start) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50); // Restrict limit to 50 max for performance

    const songs = await Song.aggregate([
      { $sort: { createdAt: -1 } },
      { $skip: (start - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: "songcategories",
          localField: "songCategoryId",
          foreignField: "_id",
          as: "songCategory",
        },
      },
      { $unwind: "$songCategory" },
      {
        $lookup: {
          from: "songfavorites",
          let: { songId: "$_id" },
          pipeline: [
            {
              $match: {
                songId: "$$songId",
                userId: userId,
              },
            },
          ],
          as: "isFavorite",
        },
      },
      {
        $project: {
          singerName: 1,
          songTitle: 1,
          songTime: 1,
          songLink: 1,
          songImage: 1,
          createdAt: 1,
          songCategoryName: "$songCategory.name",
          songCategoryImage: "$songCategory.image",
          isFavorite: { $gt: [{ $size: "$isFavorite" }, 0] },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Songs retrieved successfully.",
      data: songs,
    });
  } catch (error) {
    console.error("Error fetching songs:", error);
    return res.status(500).json({
      status: false,
      message: "An unexpected error occurred while retrieving songs. Please try again later.",
      error: error.message,
    });
  }
};

//song favorite by user
exports.handleUserFavoriteSong = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized access. Please provide a valid token.",
      });
    }

    if (!req.query.songId) {
      return res.status(200).json({ status: false, message: "songId is required." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const songId = new mongoose.Types.ObjectId(req.query.songId);

    const [songExists, alreadyFavoriteSong] = await Promise.all([Song.findById(songId).select("_id").lean(), SongFavorite.findOne({ userId, songId }).select("_id").lean()]);

    if (!songExists) {
      return res.status(200).json({ status: false, message: "Song not found." });
    }

    if (alreadyFavoriteSong) {
      res.status(200).json({
        status: true,
        message: "The user has removed the song from their favorites list.",
        songIsFavorite: false,
      });

      await SongFavorite.deleteOne({ userId, songId });
    } else {
      res.status(200).json({
        status: true,
        message: "The user has added the song to their favorites.",
        songIsFavorite: true,
      });

      await SongFavorite.create({ userId, songId });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

//get favorite songs (when upload video by the user) (favorite by user)
exports.retrieveFavoriteSongs = async (req, res, next) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized access. Please provide a valid token.",
      });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const page = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const songs = await SongFavorite.aggregate([
      { $match: { userId } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "songs",
          localField: "songId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                singerName: 1,
                songTitle: 1,
                songTime: 1,
                songImage: 1,
                songLink: 1,
                songCategoryId: 1,
              },
            },
          ],
          as: "song",
        },
      },
      { $unwind: "$song" },
      {
        $lookup: {
          from: "songcategories",
          localField: "song.songCategoryId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1 } }],
          as: "songCategory",
        },
      },
      { $unwind: { path: "$songCategory", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "videos",
          localField: "song._id",
          foreignField: "songId",
          pipeline: [{ $count: "videoCount" }],
          as: "videoStats",
        },
      },
      {
        $addFields: {
          videoCount: { $ifNull: [{ $arrayElemAt: ["$videoStats.videoCount", 0] }, 0] },
        },
      },
      {
        $project: {
          _id: 0,
          songId: "$song._id",
          singerName: "$song.singerName",
          songTitle: "$song.songTitle",
          songTime: "$song.songTime",
          songImage: "$song.songImage",
          songLink: "$song.songLink",
          songCategory: "$songCategory.name",
          videoCount: 1,
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Retrieved all favorited songs with video counts.",
      songs,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//search songs by user
exports.findSongs = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized access. Please provide a valid token.",
      });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const searchString = req.query.searchString.trim();

    const response = await Song.aggregate([
      {
        $match: {
          $or: [{ songTitle: { $regex: searchString, $options: "i" } }, { singerName: { $regex: searchString, $options: "i" } }],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "songcategories",
          localField: "songCategoryId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, image: 1 } }],
          as: "songCategory",
        },
      },
      {
        $unwind: {
          path: "$songCategory",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $lookup: {
          from: "songfavorites",
          localField: "_id",
          foreignField: "songId",
          pipeline: [{ $match: { userId } }, { $project: { _id: 1 } }],
          as: "isFavorite",
        },
      },
      {
        $lookup: {
          from: "videos",
          localField: "_id",
          foreignField: "songId",
          pipeline: [{ $count: "videoCount" }],
          as: "videoStats",
        },
      },
      {
        $project: {
          singerName: 1,
          songTitle: 1,
          songTime: 1,
          songLink: 1,
          songImage: 1,
          createdAt: 1,
          songCategoryName: "$songCategory.name",
          songCategoryImage: "$songCategory.image",
          isFavorite: { $gt: [{ $size: "$isFavorite" }, 0] },
          videoCount: { $ifNull: [{ $arrayElemAt: ["$videoStats.videoCount", 0] }, 0] },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Success",
      searchData: response,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get category wise songs
exports.fetchSongsByCategory = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized access. Please provide a valid token.",
      });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const start = parseInt(req.query.start) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const categoryId = req.query.categoryId ? new mongoose.Types.ObjectId(req.query.categoryId) : null;

    const matchStage = categoryId ? { songCategoryId: categoryId } : {};

    const songs = await Song.aggregate([
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      { $skip: (start - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: "videos",
          localField: "_id",
          foreignField: "songId",
          pipeline: [{ $project: { _id: 1 } }],
          as: "videos",
        },
      },
      {
        $lookup: {
          from: "songfavorites",
          localField: "_id",
          foreignField: "songId",
          pipeline: [{ $match: { userId } }, { $project: { _id: 1 } }],
          as: "isFavorite",
        },
      },
      {
        $project: {
          _id: 1,
          singerName: 1,
          songTitle: 1,
          songTime: 1,
          songLink: 1,
          songImage: 1,
          createdAt: 1,
          videoCount: { $size: "$videos" },
          isFavorite: { $gt: [{ $size: "$isFavorite" }, 0] },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Songs retrieved successfully.",
      data: songs,
    });
  } catch (error) {
    console.error("Error fetching songs by category:", error);
    return res.status(500).json({
      status: false,
      message: "An unexpected error occurred while retrieving songs. Please try again later.",
      error: error.message,
    });
  }
};
