const History = require("../../models/history.model");

//mongoose
const mongoose = require("mongoose");

//import model
const User = require("../../models/user.model");
const LiveStreamerHistory = require("../../models/liveStreamerHistory.model");

//get host's coin history
exports.getHostEarningsHistory = async (req, res) => {
  try {
    if (!req.query.userId) {
      return res.status(200).json({ status: false, message: "Missing userId parameter." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      dateFilterQuery = {
        createdAt: {
          $gte: startDateObj,
          $lte: endDateObj,
        },
      };
    }

    const [host, result] = await Promise.all([
      User.findOne({ _id: userId, agencyId: { $ne: null }, role: { $in: [2] } })
        .select("_id")
        .lean(),
      History.aggregate([
        {
          $match: {
            ...dateFilterQuery,
            hostAgencyId: { $ne: null },
            otherUserId: userId,
            type: { $in: [5, 6, 32, 33, 34] },
            $or: [
              {
                type: { $in: [32, 33, 34] },
                coin: { $gt: 0 },
              },
              {
                type: { $in: [5, 6] },
                receiverCoin: { $gt: 0 },
              },
            ],
          },
        },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [
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
                  as: "sender",
                },
              },
              {
                $unwind: { path: "$sender", preserveNullAndEmptyArrays: true },
              },
              {
                $project: {
                  _id: 1,
                  uniqueId: 1,
                  type: 1,
                  liveType: 1,
                  giftReceivedCount: 1,
                  giftTitle: 1,
                  giftImage: 1,
                  coin: { $cond: [{ $in: ["$type", [32, 33, 34]] }, "$coin", "$receiverCoin"] },
                  isRandom: 1,
                  isPrivate: 1,
                  callStartTime: 1,
                  callEndTime: 1,
                  duration: 1,
                  createdAt: 1,
                  senderName: { $ifNull: ["$sender.name", ""] },
                  senderImage: { $ifNull: ["$sender.image", ""] },
                },
              },
            ],
          },
        },

        {
          $project: {
            total: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] },
            data: "$data",
          },
        },
      ]),
    ]);

    if (!host) {
      return res.status(200).json({
        status: false,
        message: "No host found with the provided userId under agency.",
      });
    }

    const total = result[0]?.total || 0;
    const transactionHistory = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Host coin transaction history fetched successfully.",
      total,
      data: transactionHistory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal server error. Please try again later." });
  }
};

//get host's coin history ( call, gift )
exports.retrieveHostEarningStats = async (req, res) => {
  try {
    if (!req.query.type) {
      return res.status(200).json({ status: false, message: "Invalid details." });
    }

    if (!req.query.userId) {
      return res.status(200).json({ status: false, message: "Missing userId and agencyId parameter." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    }

    const historyType = Number(req.query.type);
    const userId = new mongoose.Types.ObjectId(req.query.userId);

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      dateFilterQuery.createdAt = {
        $gte: startDateObj,
        $lte: endDateObj,
      };
    }

    const host = User.findOne({ _id: userId, agencyId: { $ne: null }, role: { $in: [2] } })
      .select("_id")
      .lean();

    if (!host) {
      return res.status(200).json({
        status: false,
        message: "No host found with the provided userId under agency.",
      });
    }

    const result = await History.aggregate([
      {
        $match: {
          ...dateFilterQuery,
          type: historyType,
          hostAgencyId: { $ne: null },
          otherUserId: userId,
          receiverCoin: { $gt: 0 },
        },
      },
      {
        $facet: {
          total: [{ $count: "count" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },

            {
              $lookup: {
                from: "users",
                localField: "userId",
                foreignField: "_id",
                pipeline: [{ $project: { name: 1, image: 1 } }],
                as: "sender",
              },
            },
            {
              $unwind: { path: "$sender", preserveNullAndEmptyArrays: true },
            },
            {
              $project: {
                _id: 1,
                uniqueId: 1,
                type: 1,
                liveType: 1,
                giftReceivedCount: 1,
                giftTitle: 1,
                giftImage: 1,
                coin: "$receiverCoin",
                isRandom: 1,
                isPrivate: 1,
                callStartTime: 1,
                callEndTime: 1,
                duration: 1,
                createdAt: 1,
                senderName: { $ifNull: ["$sender.name", ""] },
                senderImage: { $ifNull: ["$sender.image", ""] },
              },
            },
          ],
        },
      },
      {
        $project: {
          total: { $ifNull: [{ $arrayElemAt: ["$total.count", 0] }, 0] },
          data: "$data",
        },
      },
    ]);

    const final = result[0] || { total: 0, data: [] };

    return res.status(200).json({
      status: true,
      message: "Transaction history fetch successfully.",
      total: final.total,
      data: final.data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Something went wrong. Please try again later." });
  }
};

//get host's livehistory
exports.getHostLiveStreamSummary = async (req, res) => {
  try {
    if (!req.query.userId) {
      return res.status(200).json({ status: false, message: "Missing userId and agencyId parameter." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilter = {};
    if (startDate !== "All" && endDate !== "All") {
      const startObj = new Date(startDate);
      const endObj = new Date(endDate);
      endObj.setHours(23, 59, 59, 999);

      dateFilter.createdAt = {
        $gte: startObj,
        $lte: endObj,
      };
    }

    const host = User.findOne({ _id: userId, agencyId: { $ne: null }, role: { $in: [2] } })
      .select("_id")
      .lean();

    if (!host) {
      return res.status(200).json({ status: false, message: "No host found with the provided userId under agency." });
    }

    const result = await LiveStreamerHistory.aggregate([
      {
        $match: {
          userId,
          agencyId: { $ne: null },
          ...dateFilter,
        },
      },
      {
        $facet: {
          total: [{ $count: "count" }],
          data: [
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
                    },
                  },
                ],
                as: "user",
              },
            },
            { $unwind: "$user" },
            {
              $project: {
                sessionId: 1,
                liveType: 1,
                isAudio: 1,
                earnedCoins: 1,
                receivedGifts: 1,
                viewerCount: 1,
                commentCount: 1,
                startTime: 1,
                endTime: 1,
                duration: 1,
                createdAt: 1,
                userId: "$user",
              },
            },
          ],
        },
      },
      {
        $project: {
          total: { $ifNull: [{ $arrayElemAt: ["$total.count", 0] }, 0] },
          data: "$data",
        },
      },
    ]);

    const final = result[0] || { total: 0, data: [] };

    return res.status(200).json({
      status: true,
      message: "Live session history fetched successfully.",
      total: final.total,
      data: final.data,
    });
  } catch (error) {
    console.error("Error in getUserLiveSessionHistory:", error);
    return res.status(500).json({ status: false, message: "Something went wrong while fetching live session history." });
  }
};
