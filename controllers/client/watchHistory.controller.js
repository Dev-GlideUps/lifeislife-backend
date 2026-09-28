const WatchHistory = require("../../models/watchHistory.model");

//import model
const Video = require("../../models/video.model");

//mongoose
const mongoose = require("mongoose");

//when user view the video
exports.addWatchHistory = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Please provide a valid token." });
    }

    if (!req.query.videoId) {
      return res.status(200).json({ status: false, message: "Invalid request. Video ID is required." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const videoId = req.query.videoId || {};

    const video = await Video.findOne({ _id: videoId }).select("_id userId").lean();

    if (!video) {
      return res.status(200).json({ status: false, message: "Video not found." });
    }

    res.status(200).json({
      status: true,
      message: "Watch history will be recorded once the user views this video.",
    });

    await new WatchHistory({
      userId,
      videoId: video._id,
      videoUserId: video.userId,
    }).save();
  } catch (error) {
    console.error("Error in addWatchHistory:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};
