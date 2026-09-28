const History = require("../../models/history.model");
const User = require("../../models/user.model");
const Agency = require("../../models/agency.model");
const LiveStreamerHistory = require("../../models/liveStreamerHistory.model");

//mongoose
const mongoose = require("mongoose");

//get host's coin history
exports.getHostCoinHistory = async (req, res) => {
  try {
    if (!req.query.userId || !req.query.agencyId) {
      return res.status(200).json({ status: false, message: "Missing userId and agencyId parameter." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.agencyId)) {
      return res.status(200).json({ status: false, message: "Invalid agencyId. Please provide a valid ObjectId." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);
    const agencyId = new mongoose.Types.ObjectId(req.query.agencyId);

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

    const [agency, host] = await Promise.all([
      Agency.findOne({ _id: agencyId }).select("_id isActive").lean(),
      User.findOne({ _id: userId, agencyId: agencyId, role: { $in: [2] } })
        .select("_id")
        .lean(),
    ]);

    if (!agency) {
      return res.status(200).json({ status: false, message: "No agency found with the provided agencyId." });
    }

    if (!agency.isActive) {
      return res.status(200).json({ status: false, message: "Agency is currently inactive." });
    }

    if (!host) {
      return res.status(200).json({ status: false, message: "No host found with the provided userId under this agency." });
    }

    const result = await History.aggregate([
      {
        $match: {
          ...dateFilterQuery,
          hostAgencyId: agencyId,
          otherUserId: userId,
          receiverCoin: { $gt: 0 },
          type: { $in: [5, 6, 16, 32, 33, 34] },
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
                      uniqueId: 1,
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
                coin: "$receiverCoin",
                isRandom: 1,
                isPrivate: 1,
                callStartTime: 1,
                callEndTime: 1,
                duration: 1,
                createdAt: 1,
                senderName: { $ifNull: ["$sender.name", ""] },
                senderuniqueId: { $ifNull: ["$sender.uniqueId", ""] },
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
    ]);

    const total = result[0]?.total || 0;
    const transactionHistory = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Host coin transaction history fetched successfully.",
      total: total,
      data: transactionHistory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal server error. Please try again later." });
  }
};

//get host's coin history ( call, gift )
exports.retrieveHostCoinHistory = async (req, res) => {
  try {
    if (!req.query.type) {
      return res.status(200).json({ status: false, message: "Invalid details." });
    }

    if (!req.query.userId || !req.query.agencyId) {
      return res.status(200).json({ status: false, message: "Missing userId and agencyId parameter." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.agencyId)) {
      return res.status(200).json({ status: false, message: "Invalid agencyId. Please provide a valid ObjectId." });
    }

    const historyType = Number(req.query.type);
    if (isNaN(historyType)) {
      return res.status(200).json({ status: false, message: "Invalid 'type' parameter. Must be a number." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);
    const agencyId = new mongoose.Types.ObjectId(req.query.agencyId);

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

    const [agency, host] = await Promise.all([
      Agency.findOne({ _id: agencyId }).select("_id isActive").lean(),
      User.findOne({ _id: userId, agencyId: agencyId, role: { $in: [2] } })
        .select("_id")
        .lean(),
    ]);

    if (!agency) {
      return res.status(200).json({ status: false, message: "No agency found with the provided agencyId." });
    }

    if (!agency.isActive) {
      return res.status(200).json({ status: false, message: "Agency is currently inactive." });
    }

    if (!host) {
      return res.status(200).json({ status: false, message: "No host found with the provided userId under this agency." });
    }

    const result = await History.aggregate([
      {
        $match: {
          ...dateFilterQuery,
          type: historyType,
          hostAgencyId: agencyId,
          otherUserId: userId,
          receiverCoin: { $gt: 0 },
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
          total: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] },
          data: "$data",
        },
      },
    ]);

    const total = result[0]?.total || 0;
    const transactionHistory = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Transaction history fetch successfully.",
      total: total,
      data: transactionHistory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Something went wrong. Please try again later." });
  }
};

//get host's livehistory
exports.fetchLiveSessionHistory = async (req, res) => {
  try {
    if (!req.query.userId || !req.query.agencyId) {
      return res.status(200).json({ status: false, message: "Missing userId and agencyId parameter." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.agencyId)) {
      return res.status(200).json({ status: false, message: "Invalid agencyId. Please provide a valid ObjectId." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);
    const agencyId = new mongoose.Types.ObjectId(req.query.agencyId);

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilter = {};
    if (startDate !== "All" && endDate !== "All") {
      const startObj = new Date(startDate);
      const endObj = new Date(endDate);
      endObj.setHours(23, 59, 59, 999);

      dateFilter = {
        createdAt: {
          $gte: startObj,
          $lte: endObj,
        },
      };
    }

    const [agency, host, totalSessions, sessionHistory] = await Promise.all([
      Agency.findOne({ _id: agencyId }).select("_id isActive").lean(),
      User.findOne({ _id: userId, agencyId: agencyId, role: { $in: [2] } })
        .select("_id")
        .lean(),
      LiveStreamerHistory.countDocuments({
        userId,
        ...dateFilter,
        agencyId,
      }),
      LiveStreamerHistory.find({
        userId,
        ...dateFilter,
        agencyId,
      })
        .populate("userId", "name userName image countryFlagImage country")
        .select("sessionId liveType isAudio earnedCoins receivedGifts viewerCount commentCount startTime endTime duration createdAt")
        .sort({ createdAt: -1 })
        .skip((start - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    if (!agency) {
      return res.status(200).json({ status: false, message: "No agency found with the provided agencyId." });
    }

    if (!agency.isActive) {
      return res.status(200).json({ status: false, message: "Agency is currently inactive." });
    }

    if (!host) {
      return res.status(200).json({ status: false, message: "No host found with the provided userId under this agency." });
    }

    return res.status(200).json({
      status: true,
      message: "Live session history fetched successfully.",
      total: totalSessions,
      data: sessionHistory,
    });
  } catch (error) {
    console.error("Error in getUserLiveSessionHistory:", error);
    return res.status(500).json({ status: false, message: "Something went wrong while fetching live session history." });
  }
};

//get agency's earnings
exports.getEarningsByAgency = async (req, res) => {
  try {
    if (!req.query.agencyId) {
      return res.status(200).json({ status: false, message: "Invalid details." });
    }

    if (req.query.agencyId && !mongoose.Types.ObjectId.isValid(req.query.agencyId)) {
      return res.status(200).json({ status: false, message: "Invalid agencyId. Please provide a valid ObjectId." });
    }

    const agencyId = new mongoose.Types.ObjectId(req.query.agencyId);
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

    const agencyExists = await Agency.findById({ _id: agencyId }).select("_id isActive").lean();
    if (!agencyExists) {
      return res.status(200).json({ status: false, message: "Agency not found." });
    }

    if (!agencyExists.isActive) {
      return res.status(200).json({ status: false, message: "Agency is currently inactive." });
    }

    const [result] = await Promise.all([
      History.aggregate([
        {
          $match: {
            ...dateFilterQuery,
            type: { $in: [9, 30, 31] },
            agencyId: agencyId,
            coin: { $gt: 0 },
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
                  pipeline: [{ $project: { name: 1, image: 1 } }],
                  as: "sender",
                },
              },
              {
                $unwind: { path: "$sender", preserveNullAndEmptyArrays: true },
              },
              {
                $lookup: {
                  from: "users",
                  localField: "otherUserId",
                  foreignField: "_id",
                  pipeline: [{ $project: { name: 1, image: 1 } }],
                  as: "receiver",
                },
              },
              {
                $unwind: { path: "$receiver", preserveNullAndEmptyArrays: true },
              },
              {
                $project: {
                  _id: 1,
                  uniqueId: 1,
                  type: 1,
                  baseType: 1,
                  coin: 1,
                  baseCoins: 1,
                  commissionRate: 1,
                  createdAt: 1,
                  senderName: { $ifNull: ["$sender.name", ""] },
                  senderImage: { $ifNull: ["$sender.image", ""] },
                  receiverName: { $ifNull: ["$receiver.name", ""] },
                  receiverImage: { $ifNull: ["$receiver.image", ""] },
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

    const total = result[0]?.total || 0;
    const transactionHistory = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Transaction history fetch successfully.",
      total: total,
      data: transactionHistory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Something went wrong. Please try again later." });
  }
};
