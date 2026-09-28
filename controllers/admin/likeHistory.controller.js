const LikeHistory = require("../../models/likeHistory.model");
const Post = require("../../models/post.model");
const Video = require("../../models/video.model");

const mongoose = require("mongoose");

//fetch like history ( post / video )
exports.fetchUserLikeHistoryByType = async (req, res) => {
  try {
    const { type, itemId } = req.query;

    if (!["post", "video"].includes(type)) {
      return res.status(200).json({ status: false, message: "Type must be either 'post' or 'video'." });
    }

    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(200).json({
        status: false,
        message: "Valid itemId is required.",
      });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const matchStage = type === "video" ? { videoId: new mongoose.Types.ObjectId(itemId) } : { postId: new mongoose.Types.ObjectId(itemId) };

    const result = await LikeHistory.aggregate([
      { $match: matchStage },
      {
        $facet: {
          total: [{ $count: "count" }],
          history: [
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
                      image: 1,
                      countryFlagImage: 1,
                      country: 1,
                      uniqueId: 1,
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
              $project: {
                likedAt: "$createdAt",
                "user._id": 1,
                "user.name": 1,
                "user.userName": 1,
                "user.image": 1,
                "user.countryFlagImage": 1,
                "user.country": 1,
                "user.uniqueId": 1,
              },
            },
          ],
        },
      },
    ]);

    const total = result[0]?.total[0]?.count || 0;
    const history = result[0]?.history || [];

    return res.status(200).json({
      status: true,
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} like history retrieved successfully.`,
      total,
      history,
    });
  } catch (error) {
    console.error("Error fetching user like history by type:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};
