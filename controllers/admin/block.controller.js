const Block = require("../../models/block.model");

//mongoose
const mongoose = require("mongoose");

//get blocked user
exports.fetchBlockedUserList = async (req, res) => {
  try {
    if (!req.query.userId) {
      return res.status(200).json({ status: false, message: "User ID is required." });
    }

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const userId = new mongoose.Types.ObjectId(req.query.userId);

    let matchQuery = { userId };

    if (startDate !== "All" && endDate !== "All") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      matchQuery.createdAt = {
        $gte: startDateObj,
        $lte: endDateObj,
      };
    }

    const result = await Block.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          blockedUsers: [
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "users",
                localField: "toUserId",
                foreignField: "_id",
                pipeline: [
                  {
                    $project: {
                      name: 1,
                      userName: 1,
                      image: 1,
                      uniqueId: 1,
                      countryFlagImage: 1,
                      country: 1,
                      wealthLevel: 1,
                    },
                  },
                ],
                as: "toUserId",
              },
            },
            {
              $unwind: { path: "$toUserId", preserveNullAndEmptyArrays: false },
            },
            {
              $lookup: {
                from: "wealthlevels",
                localField: "toUserId.wealthLevel",
                foreignField: "_id",
                pipeline: [
                  {
                    $project: {
                      levelImage: 1,
                      levelName: 1,
                    },
                  },
                ],
                as: "toUserId.wealthLevel",
              },
            },
            {
              $unwind: { path: "$toUserId.wealthLevel", preserveNullAndEmptyArrays: true },
            },
            {
              $project: {
                _id: 0,
                toUserId: 1,
              },
            },
          ],
        },
      },
    ]);

    const totalBlockedUsers = result[0]?.totalCount[0]?.count || 0;
    const blockedUsersList = result[0]?.blockedUsers || [];

    return res.status(200).json({
      status: true,
      message: blockedUsersList.length > 0 ? "Blocked users fetched successfully." : "No blocked users found.",
      total: totalBlockedUsers,
      blockedUsers: blockedUsersList,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An unexpected error occurred while fetching the blocked users." });
  }
};
