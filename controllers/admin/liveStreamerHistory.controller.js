const LiveStreamerHistory = require("../../models/liveStreamerHistory.model");
const User = require("../../models/user.model");

//mongoose
const mongoose = require("mongoose");

//get livehistory
exports.getLiveSessionHistory = async (req, res) => {
  try {
    if (!req.query.userId) {
      return res.status(200).json({ status: false, message: "Missing required parameter: userId." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId format. Please provide a valid ObjectId." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let matchQuery = { userId };

    if (startDate !== "All" && endDate !== "All") {
      const startObj = new Date(startDate);
      const endObj = new Date(endDate);
      endObj.setHours(23, 59, 59, 999);

      matchQuery.createdAt = {
        $gte: startObj,
        $lte: endObj,
      };
    }

    const userExists = await mongoose.model("User").exists({ _id: userId });
    if (!userExists) {
      return res.status(200).json({ status: false, message: "No user found with the provided userId." });
    }

    const result = await LiveStreamerHistory.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                role: 1,
              },
            },
          ],
          as: "user",
        },
      },
      {
        $unwind: { path: "$user", preserveNullAndEmptyArrays: true },
      },
      {
        $facet: {
          total: [{ $count: "count" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $project: {
                sessionId: 1,
                liveType: 1,
                isAudio: 1,
                earnedCoins: 1,
                receivedGifts: 1,
                viewerCount: 1,
                commentCount: 1,
                increasedFans: 1,
                startTime: 1,
                endTime: 1,
                duration: 1,
                userId: "$user",
              },
            },
          ],
        },
      },
    ]);

    const total = result[0]?.total[0]?.count || 0;
    const data = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Live session history fetched successfully.",
      total,
      data,
    });
  } catch (error) {
    console.error("Error in getUserLiveSessionHistory:", error);
    return res.status(500).json({ status: false, message: "Something went wrong while fetching live session history." });
  }
};
