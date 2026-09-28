const History = require("../../models/history.model");

//import model
const User = require("../../models/user.model");
const Agency = require("../../models/agency.model");
const GameAdminCoin = require("../../models/gameadminCoin.model");
const TeenPattiHistory = require("../../gamemodels/teenpattiHistory.model");
const RouletteHistory = require("../../gamemodels/rouletteHistory.model");
const FerryWheelHistory = require("../../gamemodels/ferrywheelHistory.model");
const Chat = require("../../models/chat.model");
const ChatTopic = require("../../models/chatTopic.model");
const Privatecall = require("../../models/privatecall.model");

//mongoose
const mongoose = require("mongoose");
const moment = require("moment-timezone");

const { HISTORY_TYPE } = require("../../types/constant");
const admin = require("../../util/privateKey");

//get coin history
exports.fetchCoinHistory = async (req, res) => {
  try {
    const { userId: uid, startDate, endDate } = req.query;

    if (!uid || !mongoose.Types.ObjectId.isValid(uid)) {
      return res.status(200).json({ status: false, message: "Invalid userId." });
    }

    const userId = new mongoose.Types.ObjectId(uid);
    const start = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 20;

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const startObj = new Date(startDate);
      const endObj = new Date(endDate);
      endObj.setHours(23, 59, 59, 999);
      dateFilterQuery.createdAt = { $gte: startObj, $lte: endObj };
    }

    const user = await User.findById(userId).select("_id").lean();

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    const [stats, typeWiseStats, total, history] = await Promise.all([
      // totalIncome and totalOutgoing calculation
      History.aggregate([
        {
          $match: {
            ...dateFilterQuery,
            $or: [{ userId }, { otherUserId: userId }],
            type: { $nin: [9, 27, 28, 29] },
            $nor: [{ $and: [{ type: 11 }, { userId }] }],
          },
        },
        {
          $addFields: {
            isIncome: {
              $switch: {
                branches: [
                  { case: { $in: ["$type", [1, 7, 10, 15, 17]] }, then: true },
                  { case: { $in: ["$type", [2, 3, 4, 18, 26]] }, then: false },
                  {
                    case: { $eq: ["$type", 5] },
                    then: {
                      $cond: {
                        if: { $eq: ["$otherUserId", userId] },
                        then: true,
                        else: false,
                      },
                    },
                  },
                  {
                    case: { $eq: ["$type", 6] },
                    then: {
                      $cond: {
                        if: {
                          $and: [{ $eq: ["$otherUserId", userId] }, { $ne: ["$userId", "$otherUserId"] }],
                        },
                        then: true,
                        else: false,
                      },
                    },
                  },
                  {
                    case: { $eq: ["$type", 25] },
                    then: {
                      $cond: {
                        if: {
                          $and: [
                            { $eq: ["$otherUserId", userId] },
                            { $ne: ["$userId", "$otherUserId"] }, // exclude self-gift
                          ],
                        },
                        then: true,
                        else: false,
                      },
                    },
                  },
                  {
                    case: { $eq: ["$type", 8] },
                    then: {
                      $cond: [
                        { $and: [{ $eq: ["$userId", userId] }, { $eq: ["$payoutStatus", 2] }] },
                        false, // payoutStatus = 2 => isIncome false (count outgoing)
                        null, // payoutStatus != 2 => exclude from income/outgoing
                      ],
                    },
                  },
                  {
                    case: { $eq: ["$type", 11] },
                    then: {
                      $cond: {
                        if: { $eq: ["$otherUserId", userId] },
                        then: true,
                        else: false,
                      },
                    },
                  },
                  {
                    case: { $in: ["$type", [12, 13, 14, 19]] },
                    then: {
                      $cond: {
                        if: { $eq: ["$otherUserId", userId] },
                        then: true,
                        else: false,
                      },
                    },
                  },
                ],
                default: false,
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            totalIncome: {
              $sum: {
                $cond: [
                  { $eq: ["$isIncome", true] },
                  {
                    $switch: {
                      branches: [
                        { case: { $in: ["$type", [1, 7, 10, 11, 12, 13, 14, 15, 17, 19]] }, then: "$coin" },
                        { case: { $in: ["$type", [5, 6, 25]] }, then: "$receiverCoin" },
                      ],
                      default: 0,
                    },
                  },
                  0,
                ],
              },
            },
            totalOutgoing: {
              $sum: {
                $cond: [
                  { $eq: ["$isIncome", false] },
                  {
                    $switch: {
                      branches: [
                        {
                          case: {
                            $and: [{ $in: ["$type", [6, 25]] }, { $eq: ["$userId", "$otherUserId"] }],
                          },
                          then: { $subtract: ["$senderCoin", "$receiverCoin"] },
                        },
                        {
                          case: { $in: ["$type", [2, 3, 4, 8, 12, 13, 14, 18, 19, 26]] },
                          then: "$coin",
                        },
                        {
                          case: { $in: ["$type", [5, 6, 25]] },
                          then: "$senderCoin",
                        },
                      ],
                      default: 0,
                    },
                  },
                  0,
                ],
              },
            },
          },
        },
      ]),

      // typeWiseStats
      History.aggregate([
        {
          $match: {
            ...dateFilterQuery,
            $or: [{ userId }, { otherUserId: userId }],
            type: { $ne: 9 },
          },
        },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
          },
        },
        {
          $project: { type: "$_id", count: 1, _id: 0 },
        },
      ]),

      // total count
      History.countDocuments({
        ...dateFilterQuery,
        $or: [{ userId }, { otherUserId: userId }],
        type: { $ne: 9 },
      }),

      // Paginated History with unified coin calculation
      History.aggregate([
        {
          $match: {
            ...dateFilterQuery,
            $or: [{ userId }, { otherUserId: userId }],
            type: { $ne: 9 },
            $nor: [{ $and: [{ type: 11 }, { userId }] }],
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "sender",
          },
        },
        { $unwind: { path: "$sender", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "users",
            localField: "otherUserId",
            foreignField: "_id",
            as: "receiver",
          },
        },
        { $unwind: { path: "$receiver", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            isIncome: {
              $switch: {
                branches: [
                  { case: { $in: ["$type", [1, 7, 10, 15, 17]] }, then: true },
                  { case: { $in: ["$type", [2, 3, 4, 18, 26]] }, then: false },
                  {
                    case: { $eq: ["$type", 5] },
                    then: {
                      $cond: {
                        if: { $eq: ["$otherUserId", userId] },
                        then: true,
                        else: false,
                      },
                    },
                  },
                  {
                    case: { $eq: ["$type", 16] },
                    then: {
                      $cond: {
                        if: { $eq: ["$otherUserId", userId] },
                        then: true,
                        else: false,
                      },
                    },
                  },
                  {
                    case: { $eq: ["$type", 6] },
                    then: {
                      $cond: {
                        if: {
                          $and: [{ $eq: ["$otherUserId", userId] }, { $ne: ["$userId", "$otherUserId"] }],
                        },
                        then: true,
                        else: false,
                      },
                    },
                  },
                  {
                    case: { $eq: ["$type", 25] },
                    then: {
                      $cond: {
                        if: {
                          $and: [
                            { $eq: ["$otherUserId", userId] },
                            { $ne: ["$userId", "$otherUserId"] }, // exclude self-gift
                          ],
                        },
                        then: true,
                        else: false,
                      },
                    },
                  },
                  {
                    case: { $eq: ["$type", 8] },
                    then: {
                      $cond: [
                        { $and: [{ $eq: ["$userId", userId] }, { $eq: ["$payoutStatus", 2] }] },
                        false, // payoutStatus=2 => isIncome false (count as outgoing)
                        null, // payoutStatus!=2 => exclude from income/outgoing
                      ],
                    },
                  },
                  {
                    case: { $eq: ["$type", 11] },
                    then: {
                      $cond: {
                        if: { $eq: ["$otherUserId", userId] },
                        then: true,
                        else: false,
                      },
                    },
                  },
                  {
                    case: { $in: ["$type", [12, 13, 14, 19]] },
                    then: {
                      $cond: {
                        if: { $eq: ["$otherUserId", userId] },
                        then: true,
                        else: false,
                      },
                    },
                  },
                ],
                default: false,
              },
            },
            coin: {
              $switch: {
                branches: [
                  {
                    case: {
                      $and: [{ $in: ["$type", [6, 25]] }, { $eq: ["$userId", "$otherUserId"] }],
                    },
                    then: { $subtract: ["$senderCoin", "$receiverCoin"] },
                  },
                  {
                    case: { $in: ["$type", [1, 2, 3, 4, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18, 19, 26]] },
                    then: "$coin",
                  },
                  {
                    case: { $in: ["$type", [5, 6, 16, 25]] },
                    then: {
                      $cond: [
                        { $eq: ["$userId", userId] },
                        "$senderCoin",
                        {
                          $cond: [{ $eq: ["$otherUserId", userId] }, "$receiverCoin", 0],
                        },
                      ],
                    },
                  },
                ],
                default: 0,
              },
            },
          },
        },
        {
          $match: {
            coin: { $gt: 0 },
          },
        },
        {
          $project: {
            uniqueId: 1,
            type: 1,
            coin: 1,
            senderCoin: 1,
            receiverCoin: 1,
            adminCoin: 1,
            createdAt: 1,
            liveType: 1,
            giftCoin: 1,
            giftImage: 1,
            giftTitle: 1,
            giftReceivedCount: 1,
            isPrivate: 1,
            isRandom: 1,
            themeName: 1,
            themeValidity: 1,
            themeValidityType: 1,
            avtarFrameName: 1,
            avtarFrameValidity: 1,
            avtarFrameValidityType: 1,
            rideName: 1,
            rideValidity: 1,
            rideValidityType: 1,
            callStartTime: 1,
            callEndTime: 1,
            duration: 1,
            amount: 1,
            payoutStatus: 1,
            paymentGateway: 1,
            senderName: { $ifNull: ["$sender.name", ""] },
            receiverName: { $ifNull: ["$receiver.name", ""] },
            isIncome: 1,
            callType: 1,
            thirdPartyGameId: 1,
            thirdPartyGameName: 1,
          },
        },
      ]),
    ]);

    const totalIncome = stats.length ? stats[0].totalIncome : 0;
    const totalOutgoing = stats.length ? stats[0].totalOutgoing : 0;

    return res.status(200).json({
      status: true,
      message: "Transaction history fetched successfully.",
      totalIncome,
      totalOutgoing,
      typeWiseStats,
      total,
      data: history,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};

//get type wise coin history
exports.fetchTypeFilteredCoinHistory = async (req, res) => {
  try {
    if (!req.query.type) {
      return res.status(200).json({ status: false, message: "Invalid details." });
    }

    let userId = null;
    if (req.query.userId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
        return res.status(200).json({ status: false, message: "Invalid userId." });
      }

      userId = new mongoose.Types.ObjectId(req.query.userId);
    }

    const historyType = Number(req.query.type);
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

    let matchQuery = {
      ...dateFilterQuery,
      type: historyType,
    };

    if (userId) {
      matchQuery.$or = [{ userId }, { otherUserId: userId }];
    }

    const result = await History.aggregate([
      { $match: matchQuery },
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
                      _id: 1,
                      name: 1,
                      userName: 1,
                      uniqueId: 1,
                      image: 1,
                    },
                  },
                ],
                as: "sender",
              },
            },
            {
              $unwind: {
                path: "$sender",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "otherUserId",
                foreignField: "_id",
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      userName: 1,
                      uniqueId: 1,
                      image: 1,
                    },
                  },
                ],
                as: "receiver",
              },
            },
            {
              $unwind: {
                path: "$receiver",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $addFields: {
                coin: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $and: [{ $eq: ["$type", 6] }, { $eq: ["$userId", "$otherUserId"] }],
                        },
                        then: {
                          $subtract: ["$senderCoin", "$receiverCoin"],
                        },
                      },
                      {
                        case: {
                          $in: ["$type", [1, 2, 3, 4, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18, 19]],
                        },
                        then: "$coin",
                      },
                      {
                        case: { $in: ["$type", [5, 6, 16]] },
                        then: userId
                          ? {
                              $cond: [
                                { $eq: ["$userId", userId] },
                                "$senderCoin",
                                {
                                  $cond: [{ $eq: ["$otherUserId", userId] }, "$receiverCoin", 0],
                                },
                              ],
                            }
                          : "$coin",
                      },
                    ],
                    default: 0,
                  },
                },
                isIncome: userId
                  ? {
                      $cond: [{ $eq: ["$otherUserId", userId] }, true, false],
                    }
                  : false,
              },
            },
            { $match: { coin: { $gt: 0 } } },
            {
              $project: {
                _id: 1,
                uniqueId: 1,
                type: 1,
                coin: 1,
                senderCoin: 1,
                receiverCoin: 1,
                adminCoin: 1,
                liveType: 1,
                giftReceivedCount: 1,
                giftTitle: 1,
                giftCoin: 1,
                giftImage: 1,
                themeName: 1,
                themeValidity: 1,
                themeValidityType: 1,
                avtarFrameName: 1,
                avtarFrameValidity: 1,
                avtarFrameValidityType: 1,
                rideName: 1,
                rideValidity: 1,
                rideValidityType: 1,
                isRandom: 1,
                isPrivate: 1,
                callStartTime: 1,
                callEndTime: 1,
                duration: 1,
                validity: 1,
                validityType: 1,
                amount: 1,
                payoutStatus: 1,
                paymentGateway: 1,
                createdAt: 1,
                senderName: { $ifNull: ["$sender.name", ""] },
                receiverName: { $ifNull: ["$receiver.name", ""] },
                senderUserName: { $ifNull: ["$sender.userName", ""] },
                receiverUserName: { $ifNull: ["$receiver.userName", ""] },
                senderImage: { $ifNull: ["$sender.image", ""] },
                receiverImage: { $ifNull: ["$receiver.image", ""] },
                isIncome: 1,
                thirdPartyGameId: 1,
                thirdPartyGameName: 1,
              },
            },
          ],
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Transaction history fetched successfully.",
      total: result[0]?.totalCount[0]?.count || 0,
      data: result[0]?.data || [],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Something went wrong. Please try again later." });
  }
};

//get earnings report for each agency ( agency earnings and host earnings and number of hosts under each agency )
exports.fetchAgencyEarningsReport = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const skip = (start - 1) * limit;

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";
    const search = req.query.search ? String(req.query.search).trim() : "";

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const startD = new Date(startDate);
      const endD = new Date(endDate);
      endD.setHours(23, 59, 59, 999);

      dateFilterQuery = {
        createdAt: { $gte: startD, $lte: endD },
      };
    }

    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let agencySearchQuery = {};
    if (search) {
      const safeSearch = escapeRegex(search);
      agencySearchQuery = {
        $or: [{ agencyName: { $regex: safeSearch, $options: "i" } }, { agencyCode: { $regex: safeSearch, $options: "i" } }],
      };
    }

    const result = await Agency.aggregate([
      ...(search ? [{ $match: agencySearchQuery }] : []),
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          paginatedData: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: "histories",
                localField: "_id",
                foreignField: "agencyId",
                pipeline: [
                  {
                    $match: {
                      type: 9,
                      coin: { $ne: 0 },
                      ...dateFilterQuery,
                    },
                  },
                  {
                    $project: { coin: 1 },
                  },
                ],
                as: "agencyEarnings",
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "agencyId",
                pipeline: [
                  {
                    $match: { role: 2 }, // hosts
                  },
                  {
                    $lookup: {
                      from: "livestreamerhistories",
                      localField: "_id",
                      foreignField: "userId",
                      let: { hostAgencyId: "$agencyId" },
                      pipeline: [
                        {
                          $match: {
                            ...dateFilterQuery,
                          },
                        },
                        {
                          $addFields: {
                            isSameAgency: { $eq: ["$agencyId", "$$hostAgencyId"] },
                          },
                        },
                        {
                          $match: { isSameAgency: true },
                        },
                        {
                          $addFields: {
                            durationParts: { $split: ["$duration", ":"] },
                          },
                        },
                        {
                          $addFields: {
                            durationSeconds: {
                              $add: [
                                { $multiply: [{ $toInt: { $arrayElemAt: ["$durationParts", 0] } }, 3600] },
                                { $multiply: [{ $toInt: { $arrayElemAt: ["$durationParts", 1] } }, 60] },
                                { $toInt: { $arrayElemAt: ["$durationParts", 2] } },
                              ],
                            },
                          },
                        },
                        {
                          $group: {
                            _id: null,
                            liveSeconds: { $sum: "$durationSeconds" },
                          },
                        },
                      ],
                      as: "liveSessions",
                    },
                  },
                  {
                    $lookup: {
                      from: "histories",
                      localField: "_id",
                      foreignField: "otherUserId",
                      pipeline: [
                        {
                          $match: {
                            receiverCoin: { $ne: 0 },
                            type: { $in: [5, 6] },
                            liveHistoryId: { $ne: null },
                            ...dateFilterQuery,
                          },
                        },
                        {
                          $project: { receiverCoin: 1, hostAgencyId: 1 },
                        },
                      ],
                      as: "liveGiftHistories",
                    },
                  },
                  {
                    $lookup: {
                      from: "histories",
                      localField: "_id",
                      foreignField: "otherUserId",
                      pipeline: [
                        {
                          $match: {
                            receiverCoin: { $ne: 0 },
                            type: { $in: [5, 6] },
                            ...dateFilterQuery,
                          },
                        },
                        {
                          $project: {
                            coin: 1,
                            hostAgencyId: 1,
                          },
                        },
                      ],
                      as: "hostHistories",
                    },
                  },
                  {
                    $addFields: {
                      hostHistories: {
                        $filter: {
                          input: "$hostHistories",
                          as: "history",
                          cond: {
                            $eq: ["$$history.hostAgencyId", "$agencyId"],
                          },
                        },
                      },
                    },
                  },
                  {
                    $addFields: {
                      liveGiftHistories: {
                        $filter: {
                          input: "$liveGiftHistories",
                          as: "history",
                          cond: {
                            $eq: ["$$history.hostAgencyId", "$agencyId"],
                          },
                        },
                      },
                    },
                  },
                  {
                    $project: {
                      hostEarning: { $sum: "$hostHistories.coin" },
                      liveSeconds: { $ifNull: [{ $arrayElemAt: ["$liveSessions.liveSeconds", 0] }, 0] },
                      liveGiftEarning: { $sum: "$liveGiftHistories.receiverCoin" },
                    },
                  },
                ],
                as: "hosts",
              },
            },
            {
              $project: {
                agencyName: 1,
                agencyCode: 1,
                agencyEarning: { $sum: "$agencyEarnings.coin" },
                hostEarning: { $sum: "$hosts.hostEarning" },
                hostCount: { $size: "$hosts" },
                totalLiveSeconds: { $sum: "$hosts.liveSeconds" },
                liveGiftEarning: { $sum: "$hosts.liveGiftEarning" },
              },
            },
            {
              $addFields: {
                totalLiveHours: { $divide: ["$totalLiveSeconds", 3600] },
              },
            },
            {
              $sort: { agencyEarning: -1 },
            },
          ],
        },
      },
    ]);

    const totalCount = result[0].totalCount[0]?.count || 0;
    const paginatedData = result[0].paginatedData;

    return res.status(200).json({
      status: true,
      message: "Agency earnings report fetched successfully.",
      total: totalCount,
      data: paginatedData,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Something went wrong. Please try again later." });
  }
};

//get agency's wallet history
exports.fetchAgencyCommissionRecords = async (req, res) => {
  try {
    const { agencyId } = req.query || {};

    if (!agencyId || !mongoose.Types.ObjectId.isValid(agencyId)) {
      return res.status(200).json({ status: false, message: "Invalid agencyId. Please provide a valid ObjectId." });
    }

    const agencyObjectId = new mongoose.Types.ObjectId(agencyId);
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

    const result = await History.aggregate([
      {
        $match: {
          ...dateFilterQuery,
          type: { $in: [9, 30, 31] },
          agencyId: agencyObjectId,
          coin: { $gt: 0 },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (start - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "sender",
        },
      },
      {
        $unwind: {
          path: "$sender",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "otherUserId",
          foreignField: "_id",
          as: "receiver",
        },
      },
      {
        $unwind: {
          path: "$receiver",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          data: [
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
                receiverName: { $ifNull: ["$receiver.name", ""] },
              },
            },
          ],
        },
      },
    ]);

    const total = result[0]?.totalCount[0]?.count || 0;
    const data = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Transaction history fetch successfully.",
      total,
      data,
    });
  } catch (error) {
    console.error("fetchAgencyCommissionRecords Error:", error);
    return res.status(500).json({ status: false, message: "Something went wrong. Please try again later." });
  }
};

//get game history
exports.fetchgameRecords = async (req, res) => {
  try {
    const { gameType } = req.query;
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;

    if (!gameType) {
      return res.status(200).json({ status: false, message: "gameType is required" });
    }

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

    let aggregationPipeline = [{ $match: dateFilterQuery }, { $sort: { _id: -1 } }];

    let projectFields = {};

    let historyModel;
    const gameTypeNum = Number(gameType);

    if (gameTypeNum === 12) {
      // TeenPatti
      historyModel = TeenPattiHistory;
      projectFields = {
        updatedAdminCoin: 1,
        totalAdd: 1,
        winnerCoinMinus: 1,
        cardCoin: 1,
        date: 1,
        _id: 1,
      };
    } else if (gameTypeNum === 13) {
      // Ferry Wheel
      historyModel = FerryWheelHistory;
      projectFields = {
        updatedAdminCoin: 1,
        totalAdd: 1,
        winnerCoinMinus: 1,
        cardCoin: 1,
        winnerNumber: 1,
        winnerNumberTimes: 1,
        date: 1,
        _id: 1,
      };
    } else if (gameTypeNum === 14) {
      // Casino (Roulette)
      historyModel = RouletteHistory;
      projectFields = {
        updatedAdminCoin: 1,
        totalAdd: 1,
        winnerCoinMinus: 1,
        winnerObj: 1,
        date: 1,
        _id: 1,
      };
    } else {
      return res.status(200).json({
        status: false,
        message: "Invalid gameType. Must be 12 (TeenPatti), 13 (FerryWheel), or 14 (Roulette).",
      });
    }

    aggregationPipeline.push(
      { $project: projectFields },
      {
        $facet: {
          history: [{ $skip: (start - 1) * limit }, { $limit: limit }],
          pageInfo: [{ $count: "count" }],
        },
      },
    );

    const [historyData, adminCoin] = await Promise.all([historyModel.aggregate(aggregationPipeline), GameAdminCoin.findOne()]);

    return res.status(200).json({
      status: true,
      message: "History fetched successfully!",
      adminCoin: adminCoin?.coin ?? 0,
      total: historyData[0]?.pageInfo[0]?.count || 0,
      gameHistories: historyData[0]?.history || [],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Server Error" });
  }
};

//calls management (call history summary)
exports.fetchCallsSummary = async (req, res) => {
  try {
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    const match = {
      type: { $in: [5, 16] },
      isPrivate: true,
    };

    if (startDate !== "All" && endDate !== "All") {
      const startObj = new Date(startDate);
      const endObj = new Date(endDate);

      endObj.setHours(23, 59, 59, 999);

      match.createdAt = {
        $gte: startObj,
        $lte: endObj,
      };
    }

    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const result = await History.aggregate([
      {
        $match: match,
      },

      // convert duration HH:mm:ss => seconds
      {
        $addFields: {
          durationParts: {
            $split: ["$duration", ":"],
          },
        },
      },
      {
        $addFields: {
          durationSeconds: {
            $cond: [
              {
                $eq: [{ $size: "$durationParts" }, 3],
              },
              {
                $add: [
                  {
                    $multiply: [
                      {
                        $toInt: {
                          $arrayElemAt: ["$durationParts", 0],
                        },
                      },
                      3600,
                    ],
                  },
                  {
                    $multiply: [
                      {
                        $toInt: {
                          $arrayElemAt: ["$durationParts", 1],
                        },
                      },
                      60,
                    ],
                  },
                  {
                    $toInt: {
                      $arrayElemAt: ["$durationParts", 2],
                    },
                  },
                ],
              },
              0,
            ],
          },
        },
      },

      {
        $group: {
          _id: null,

          totalCalls: {
            $sum: 1,
          },

          ongoingCalls: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$callConnect", true] },
                    {
                      $or: [{ $eq: ["$callEndTime", ""] }, { $eq: ["$callEndTime", null] }],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },

          completedCalls: {
            $sum: {
              $cond: [
                {
                  $and: [{ $ne: ["$callEndTime", ""] }, { $ne: ["$callEndTime", null] }],
                },
                1,
                0,
              ],
            },
          },

          missedCalls: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$callConnect", false] },
                    {
                      $or: [{ $eq: ["$callStartTime", ""] }, { $eq: ["$callStartTime", null] }],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },

          totalRevenue: {
            $sum: {
              $ifNull: ["$senderCoin", 0],
            },
          },

          totalAdminRevenue: {
            $sum: {
              $ifNull: ["$adminCoin", 0],
            },
          },

          totalReceiverRevenue: {
            $sum: {
              $ifNull: ["$receiverCoin", 0],
            },
          },

          avgDurationSeconds: {
            $avg: {
              $cond: [
                {
                  $and: [{ $ne: ["$callEndTime", ""] }, { $ne: ["$callEndTime", null] }],
                },
                "$durationSeconds",
                "$$REMOVE",
              ],
            },
          },

          todayCalls: {
            $sum: {
              $cond: [
                {
                  $and: [{ $gte: ["$createdAt", todayStart] }, { $lte: ["$createdAt", todayEnd] }],
                },
                1,
                0,
              ],
            },
          },

          todayRevenue: {
            $sum: {
              $cond: [
                {
                  $and: [{ $gte: ["$createdAt", todayStart] }, { $lte: ["$createdAt", todayEnd] }],
                },
                {
                  $ifNull: ["$senderCoin", 0],
                },
                0,
              ],
            },
          },
        },
      },

      {
        $project: {
          _id: 0,

          totalCalls: 1,
          ongoingCalls: 1,
          completedCalls: 1,
          missedCalls: 1,

          totalRevenue: 1,
          totalAdminRevenue: 1,
          totalReceiverRevenue: 1,

          todayCalls: 1,
          todayRevenue: 1,

          avgDurationSeconds: {
            $round: [
              {
                $ifNull: ["$avgDurationSeconds", 0],
              },
              0,
            ],
          },

          avgDurationMinutes: {
            $round: [
              {
                $divide: [
                  {
                    $ifNull: ["$avgDurationSeconds", 0],
                  },
                  60,
                ],
              },
              1,
            ],
          },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Calls summary fetched successfully.",
      summary: result[0] || {
        totalCalls: 0,
        ongoingCalls: 0,
        completedCalls: 0,
        missedCalls: 0,
        totalRevenue: 0,
        totalAdminRevenue: 0,
        totalReceiverRevenue: 0,
        todayCalls: 0,
        todayRevenue: 0,
        avgDurationSeconds: 0,
        avgDurationMinutes: 0,
      },
    });
  } catch (error) {
    console.error("fetchCallsSummary Error:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//calls management (call history list)
exports.fetchCallsManagement = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const statusFilter = req.query.status?.trim()?.toLowerCase() || "all"; // all | ongoing | completed | missed
    const callTypeFilter = req.query.callType?.trim()?.toLowerCase(); // audio | video
    const search = req.query.search?.trim();
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    if (isNaN(start) || start < 1) {
      return res.status(200).json({ status: false, message: "Invalid 'start' value." });
    }

    const skip = (start - 1) * limit;

    const mock = String(req.query.mock || "")
      .trim()
      .toLowerCase();
    const shouldMock = mock === "1" || mock === "true";
    if (shouldMock && statusFilter === "ongoing") {
      const firstNames = ["Aarav", "Vivaan", "Aditya", "Arjun", "Ishaan", "Reyansh", "Anaya", "Diya", "Ira", "Aadhya", "Myra", "Kiara"];
      const lastNames = ["Sharma", "Patel", "Singh", "Gupta", "Khan", "Mehta", "Jain", "Verma", "Iyer", "Reddy"];

      const toDuration = (seconds) => {
        const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
        const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
        const s = String(seconds % 60).padStart(2, "0");
        return `${h}:${m}:${s}`;
      };

      const now = Date.now();
      const calls = Array.from({ length: 20 }).map((_, i) => {
        const callerF = firstNames[Math.floor(Math.random() * firstNames.length)];
        const callerL = lastNames[Math.floor(Math.random() * lastNames.length)];
        const receiverF = firstNames[Math.floor(Math.random() * firstNames.length)];
        const receiverL = lastNames[Math.floor(Math.random() * lastNames.length)];

        const callerName = `${callerF} ${callerL}`;
        const receiverName = `${receiverF} ${receiverL}`;
        const callerBase = `${callerF}${callerL}`.toLowerCase();
        const receiverBase = `${receiverF}${receiverL}`.toLowerCase();

        const callerSuffix = Math.floor(Math.random() * 9999);
        const receiverSuffix = Math.floor(Math.random() * 9999);

        const caller = {
          _id: new mongoose.Types.ObjectId(),
          name: callerName,
          userName: `@${callerBase}${callerSuffix || ""}`,
          uniqueId: String(100000 + Math.floor(Math.random() * 900000)),
          image: "",
        };

        const receiver = {
          _id: new mongoose.Types.ObjectId(),
          name: receiverName,
          userName: `@${receiverBase}${receiverSuffix || ""}`,
          uniqueId: String(100000 + Math.floor(Math.random() * 900000)),
          image: "",
        };

        const callType = callTypeFilter === "audio" || callTypeFilter === "video" ? callTypeFilter : Math.random() < 0.5 ? "audio" : "video";
        const createdAt = new Date(now - Math.floor(Math.random() * 6 * 60 * 60 * 1000));
        const callStartTime = new Date(createdAt.getTime() - Math.floor(Math.random() * 10 * 60 * 1000)).toISOString();
        const durationSec = 30 + Math.floor(Math.random() * 25 * 60);

        return {
          _id: new mongoose.Types.ObjectId(),
          uniqueId: String(100000 + Math.floor(Math.random() * 900000)),
          callType,
          duration: toDuration(durationSec),
          senderCoin: Math.floor(Math.random() * 500),
          receiverCoin: Math.floor(Math.random() * 500),
          adminCoin: Math.floor(Math.random() * 100),
          status: "ongoing",
          callStartTime,
          callEndTime: null,
          createdAt,
          caller,
          receiver,
        };
      });

      return res.status(200).json({
        status: true,
        message: "Calls management fetched successfully.",
        total: 20,
        data: calls,
      });
    }

    const baseMatch = {
      type: { $in: [5, 16] }, // private video/audio call history types
      isPrivate: true,
    };

    if (startDate !== "All" && endDate !== "All") {
      const startObj = new Date(startDate);
      const endObj = new Date(endDate);
      endObj.setHours(23, 59, 59, 999);
      baseMatch.createdAt = { $gte: startObj, $lte: endObj };
    }

    const statusFieldExpr = {
      $switch: {
        branches: [
          {
            case: {
              $and: [{ $eq: ["$callConnect", true] }, { $or: [{ $eq: ["$callEndTime", ""] }, { $eq: ["$callEndTime", null] }] }],
            },
            then: "ongoing",
          },
          {
            case: {
              $and: [{ $ne: ["$callEndTime", ""] }, { $ne: ["$callEndTime", null] }],
            },
            then: "completed",
          },
          {
            case: {
              $and: [{ $eq: ["$callConnect", false] }, { $or: [{ $eq: ["$callStartTime", ""] }, { $eq: ["$callStartTime", null] }] }],
            },
            then: "missed",
          },
        ],
        default: "missed",
      },
    };

    const pipeline = [
      { $match: baseMatch },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, name: 1, userName: 1, uniqueId: 1, image: 1 } }],
          as: "caller",
        },
      },
      { $unwind: { path: "$caller", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "otherUserId",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, name: 1, userName: 1, uniqueId: 1, image: 1 } }],
          as: "receiver",
        },
      },
      { $unwind: { path: "$receiver", preserveNullAndEmptyArrays: true } },
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { uniqueId: { $regex: search, $options: "i" } },
                  { "caller.name": { $regex: search, $options: "i" } },
                  { "caller.userName": { $regex: search, $options: "i" } },
                  { "caller.uniqueId": { $regex: search, $options: "i" } },
                  { "receiver.name": { $regex: search, $options: "i" } },
                  { "receiver.userName": { $regex: search, $options: "i" } },
                  { "receiver.uniqueId": { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
        : []),
      {
        $addFields: {
          status: statusFieldExpr,
          callType: {
            $cond: [{ $in: ["$callType", ["audio", "video"]] }, "$callType", { $cond: [{ $eq: ["$type", 16] }, "audio", "video"] }],
          },
        },
      },
      ...(statusFilter !== "all" && ["ongoing", "completed", "missed"].includes(statusFilter) ? [{ $match: { status: statusFilter } }] : []),
      ...(callTypeFilter === "audio" || callTypeFilter === "video" ? [{ $match: { callType: callTypeFilter } }] : []),
      {
        $addFields: {
          durationParts: { $split: ["$duration", ":"] },
        },
      },
      // {
      //   $addFields: {
      //     durationSeconds: {
      //       $add: [
      //         { $multiply: [{ $toInt: { $arrayElemAt: ["$durationParts", 0] } }, 3600] },
      //         { $multiply: [{ $toInt: { $arrayElemAt: ["$durationParts", 1] } }, 60] },
      //         { $toInt: { $arrayElemAt: ["$durationParts", 2] } },
      //       ],
      //     },
      //   },
      // },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          total: [{ $count: "count" }],
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $addFields: {
                senderCoin: { $ifNull: ["$senderCoin", 0] },
                receiverCoin: { $ifNull: ["$receiverCoin", 0] },
                adminCoin: { $ifNull: ["$adminCoin", 0] },
              },
            },
            {
              $project: {
                _id: 1,
                uniqueId: 1,
                callType: 1,
                duration: 1,
                // durationSeconds: 1,
                senderCoin: 1,
                receiverCoin: 1,
                adminCoin: 1,
                status: 1,
                callStartTime: 1,
                callEndTime: 1,
                createdAt: 1,
                caller: 1,
                receiver: 1,
              },
            },
          ],
        },
      },
    ];

    const result = await History.aggregate(pipeline);
    const total = result[0]?.total?.[0]?.count || 0;
    const calls = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Calls management fetched successfully.",
      total,
      data: calls,
    });
  } catch (error) {
    console.error("fetchCallsManagement Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//end private call by admin (mirrors socket "callEnded")
exports.terminateCallByAdmin = async (req, res) => {
  try {
    const { callerId, receiverId, callId, callType } = req.body || {};

    if (!callerId || !receiverId || !callId || !callType) {
      return res.status(400).json({
        status: false,
        message: "callerId, receiverId, callId and callType are required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(callerId) || !mongoose.Types.ObjectId.isValid(receiverId) || !mongoose.Types.ObjectId.isValid(callId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid callerId, receiverId or callId.",
      });
    }

    const ioRef = global.io;

    const [caller, receiver, callHistory] = await Promise.all([
      User.findById(callerId).select("_id name userName image isProfilePicBanned isOnline isVerified fcmToken isBlock isPushNotificationEnabled").lean(),
      User.findById(receiverId).select("_id name userName image isProfilePicBanned isOnline isVerified fcmToken isBlock isPushNotificationEnabled").lean(),
      History.findById(callId).select("_id callStartTime callEndTime callConnect duration").lean(),
    ]);

    if (!caller || !receiver || !callHistory) {
      return res.status(404).json({
        status: false,
        message: "Caller, receiver or call history not found.",
      });
    }

    const payload = JSON.stringify({
      callerId,
      receiverId,
      callId,
      callType,
      endedBy: "admin",
    });

    if (ioRef) {
      ioRef.to(callId.toString()).emit("callEnded", payload);
      ioRef.to("globalRoom:" + callerId.toString()).emit("callEnded", payload);
      ioRef.to("globalRoom:" + receiverId.toString()).emit("callEnded", payload);
      ioRef.socketsLeave(callId.toString());
    }

    await Promise.all([
      User.updateOne({ _id: callerId }, { $set: { isBusy: false, callId: null } }),
      User.updateOne({ _id: receiverId }, { $set: { isBusy: false, callId: null } }),
      Privatecall.deleteOne({ caller: callerId, receiver: receiverId }),
    ]);

    const callEndTime = moment().tz("Asia/Kolkata").format();
    let duration = "00:00:00";
    if (callHistory.callStartTime) {
      const start = moment.tz(callHistory.callStartTime, "Asia/Kolkata");
      const end = moment.tz(callEndTime, "Asia/Kolkata");
      duration = moment.utc(end.diff(start)).format("HH:mm:ss");
    }

    await Promise.all([
      Chat.findOneAndUpdate(
        { callId: callHistory._id },
        {
          $set: {
            callDuration: duration,
            messageType: callType.trim().toLowerCase() === "audio" ? 5 : 3,
            message: callType.trim().toLowerCase() === "audio" ? "📞 Audio Call" : "📽 Video Call",
            callType: 1,
            isRead: true,
          },
        },
        { new: true },
      ),
      History.updateOne(
        { _id: callHistory._id },
        {
          $set: {
            callEndTime,
            duration,
          },
        },
      ),
    ]);

    res.status(200).json({
      status: true,
      message: "Call ended successfully by admin.",
    });

    const normalizedCallType = callType.trim().toLowerCase();
    const isAudio = normalizedCallType === "audio";

    // const chatTopic = await ChatTopic.findOne({
    //   $or: [
    //     { $and: [{ senderId: caller._id }, { receiverId: receiver._id }] },
    //     { $and: [{ senderId: receiver._id }, { receiverId: caller._id }] },
    //   ],
    // })
    //   .select("_id")
    //   .lean();

    const sendCallEndedNotification = async (targetUser, otherUser) => {
      if (!targetUser?.isPushNotificationEnabled || targetUser?.isBlock || !targetUser?.fcmToken) return;

      const otherName = otherUser?.name?.trim() || otherUser?.userName?.trim() || "the other user";
      const notificationTitle = isAudio ? "🛑📞 Audio Call Ended" : "🛑🎥 Video Call Ended";
      const notificationBody = isAudio
        ? `👮 An administrator ended your private audio call with ${otherName}. Tap to reopen the app! 🔊`
        : `👮 An administrator ended your private video call with ${otherName}. Tap to reopen the app! 📱`;

      const payload = {
        token: targetUser.fcmToken,
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        data: {
          type: "CALL_ENDED_BY_ADMIN",
          callId: String(callId),
          callerId: String(callerId),
          receiverId: String(receiverId),
          callType: normalizedCallType,
          endedBy: "admin",
          // chatTopicId: chatTopic?._id ? String(chatTopic._id) : "",
          name: String(otherUser?.name || ""),
          image: String(otherUser?.image || ""),
          isProfilePicBanned: String(otherUser?.isProfilePicBanned ?? ""),
          isVerified: String(otherUser?.isVerified ?? ""),
          isOnline: String(otherUser?.isOnline ?? ""),
        },
      };

      const adminPromise = await admin;
      adminPromise
        .messaging()
        .send(payload)
        .then((response) => {
          console.log("[terminateCallByAdmin] notification sent:", response);
        })
        .catch((error) => {
          console.log("[terminateCallByAdmin] notification error:", error);
        });
    };

    await Promise.all([sendCallEndedNotification(caller, receiver), sendCallEndedNotification(receiver, caller)]);
  } catch (error) {
    console.error("terminateCallByAdmin Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get lucky gift history
exports.retrieveLuckyGiftHistory = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let userId = null;
    if (req.query.userId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
        return res.status(200).json({ status: false, message: "Invalid userId." });
      }
      userId = new mongoose.Types.ObjectId(req.query.userId);
    }

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

    const matchQuery = {
      ...dateFilterQuery,
      luckyGiftReserve: { $gt: 0 },
    };

    if (userId) {
      matchQuery.$or = [{ userId }, { otherUserId: userId }];
    }

    const userProject = {
      _id: 1,
      name: 1,
      userName: 1,
      uniqueId: 1,
      image: 1,
    };

    const result = await History.aggregate([
      { $match: matchQuery },
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
                pipeline: [{ $project: userProject }],
                as: "sender",
              },
            },
            { $unwind: { path: "$sender", preserveNullAndEmptyArrays: false } },
            {
              $lookup: {
                from: "users",
                localField: "otherUserId",
                foreignField: "_id",
                pipeline: [{ $project: userProject }],
                as: "receiver",
              },
            },
            { $unwind: { path: "$receiver", preserveNullAndEmptyArrays: false } },
            {
              $lookup: {
                from: "histories",
                localField: "luckyGiftEventId",
                foreignField: "luckyGiftEventId",
                pipeline: [
                  {
                    $match: {
                      type: 15,
                    },
                  },
                  { $sort: { createdAt: -1 } },
                  {
                    $project: {
                      _id: 1,
                      coin: 1,
                      luckyGiftMultiplier: 1,
                    },
                  },
                ],
                as: "luckyRewards",
              },
            },
            {
              $project: {
                _id: 1,
                uniqueId: 1,
                type: 1,
                liveType: 1,
                liveHistoryId: 1,
                userId: 1,
                otherUserId: 1,
                senderCoin: 1,
                receiverCoin: 1,
                adminCoin: 1,
                luckyGiftReserve: 1,
                luckyGiftMultiplier: 1,
                coin: 1,
                giftId: 1,
                giftTitle: 1,
                giftCoin: 1,
                giftImage: 1,
                giftReceivedCount: 1,
                date: 1,
                createdAt: 1,
                sender: 1,
                receiver: 1,
                luckyRewards: 1,
                luckyGiftWon: { $gt: [{ $size: { $ifNull: ["$luckyRewards", []] } }, 0] },
                luckyGiftWinCoin: { $arrayElemAt: ["$luckyRewards.coin", 0] },
                luckyGiftMultiplierWon: { $arrayElemAt: ["$luckyRewards.luckyGiftMultiplier", 0] },
              },
            },
          ],
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Lucky gift history retrieved successfully.",
      total: result[0]?.totalCount[0]?.count || 0,
      data: result[0]?.data || [],
    });
  } catch (error) {
    console.error("retrieveLuckyGiftHistory error:", error);
    return res.status(500).json({ status: false, message: "Something went wrong. Please try again later." });
  }
};
