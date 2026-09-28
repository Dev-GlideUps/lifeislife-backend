const History = require("../../models/history.model");
const User = require("../../models/user.model");

//mongoose
const mongoose = require("mongoose");

//get user's coin history
exports.getUserTransactionHistory = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Invalid authentication token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";
    const start = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 20;

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

    const transactionHistory = await History.aggregate([
      {
        $match: {
          ...dateFilterQuery,
          $or: [{ userId: userId }, { otherUserId: userId }],
          type: { $nin: [9, 27, 28, 29] },
          $nor: [
            {
              $and: [{ type: 11 }, { userId: userId }],
            },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (start - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "otherUserId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1 } }],
          as: "receiver",
        },
      },
      { $unwind: { path: "$receiver", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1 } }],
          as: "sender",
        },
      },
      { $unwind: { path: "$sender", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          uniqueId: 1,
          type: 1,
          callType: 1,
          coin: {
            $switch: {
              branches: [
                {
                  case: { $in: ["$type", [1, 2, 3, 4, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18, 19, 26]] },
                  then: "$coin",
                },
                {
                  case: {
                    $and: [{ $in: ["$type", [6, 25]] }, { $eq: ["$userId", userId] }, { $eq: ["$otherUserId", userId] }],
                  },
                  then: { $subtract: ["$senderCoin", "$receiverCoin"] }, // self-gift net coin
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
          payoutStatus: 1,
          reason: 1,
          createdAt: 1,
          thirdPartyGameId: 1,
          thirdPartyGameName: 1,
          senderName: { $ifNull: ["$sender.name", ""] },
          receiverName: { $ifNull: ["$receiver.name", ""] },
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
                    $cond: {
                      if: {
                        $and: [{ $eq: ["$userId", userId] }, { $eq: ["$payoutStatus", 2] }],
                      },
                      then: false,
                      else: true,
                    },
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
        $match: {
          coin: { $gt: 0 },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Transaction history retrieved successfully.",
      data: transactionHistory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Something went wrong. Please try again later." });
  }
};

//get user's gift received history
exports.getUserReceivedGiftHistory = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Invalid authentication token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const pageStart = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const [giftReceivedHistory] = await Promise.all([
      History.aggregate([
        {
          $match: {
            type: 6,
            otherUserId: userId,
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$giftId",
            totalGiftCount: { $sum: "$giftReceivedCount" },
            latestDate: { $first: "$createdAt" },
            giftTitle: { $first: "$giftTitle" },
            giftImage: { $first: "$giftImage" },
            giftCoin: { $first: "$giftCoin" },
          },
        },
        { $sort: { latestDate: -1 } },
        { $skip: (pageStart - 1) * limit },
        { $limit: limit },

        {
          $lookup: {
            from: "gifts",
            localField: "_id",
            foreignField: "_id",
            pipeline: [{ $project: { svgaImage: 1, type: 1 } }],
            as: "giftDetails",
          },
        },
        {
          $unwind: {
            path: "$giftDetails",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $project: {
            _id: 0,
            giftId: "$_id",
            totalGiftCount: 1,
            latestDate: 1,
            giftTitle: 1,
            giftImage: 1,
            giftCoin: 1,
            giftsvgaImage: "$giftDetails.svgaImage",
            giftType: "$giftDetails.type",
          },
        },
      ]),
    ]);

    return res.status(200).json({
      status: true,
      message: "Gift history received by user retrieved successfully.",
      data: giftReceivedHistory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Something went wrong. Please try again later." });
  }
};

//get toUser's gift received history
exports.retrieveUserGiftHistory = async (req, res) => {
  try {
    if (!req.query.userId) {
      return res.status(200).json({ status: false, message: "userId must be requried." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);
    const pageStart = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const skip = (pageStart - 1) * limit;

    const [user, giftReceivedHistory] = await Promise.all([
      User.findOne({ _id: userId, isBlock: false }).select("_id").lean(),
      History.aggregate([
        {
          $match: {
            type: 6,
            otherUserId: userId,
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$giftId",
            totalGiftCount: { $sum: "$giftReceivedCount" },
            latestDate: { $first: "$createdAt" },
            giftTitle: { $first: "$giftTitle" },
            giftImage: { $first: "$giftImage" },
            giftCoin: { $first: "$giftCoin" },
          },
        },
        { $sort: { latestDate: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "gifts",
            localField: "_id",
            foreignField: "_id",
            pipeline: [{ $project: { svgaImage: 1, type: 1 } }],
            as: "giftDetails",
          },
        },
        {
          $unwind: {
            path: "$giftDetails",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $project: {
            _id: 0,
            giftId: "$_id",
            totalGiftCount: 1,
            latestDate: 1,
            giftTitle: 1,
            giftImage: 1,
            giftsvgaImage: "$giftDetails.svgaImage",
            giftCoin: 1,
            giftType: "$giftDetails.type",
          },
        },
      ]),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User does not found." });
    }

    return res.status(200).json({
      status: true,
      message: "Received gift history retrieved successfully.",
      data: giftReceivedHistory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong. Please try again later.",
    });
  }
};

//get users who consumed coins ( rich )
exports.fetchTopCoinConsumers = async (req, res) => {
  try {
    const pageStart = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const skip = (pageStart - 1) * limit;

    const getDateRange = (type) => {
      let startDate, endDate;

      if (type === "daily") {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
      } else if (type === "weekly") {
        const today = new Date();
        const offset = today.getDay() === 0 ? 6 : today.getDay() - 1;
        startDate = new Date(today.setDate(today.getDate() - offset));
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
      } else if (type === "monthly") {
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
      }

      return { startDate, endDate };
    };

    const getTopConsumers = async (type) => {
      const { startDate, endDate } = getDateRange(type);

      const matchCondition = {
        userId: { $ne: null },
        senderCoin: { $gt: 0 },
        $or: [{ type: 5 }, { type: 16 }, { type: 6, giftId: { $ne: null }, giftReceivedCount: { $ne: 0 } }],
        createdAt: { $gte: startDate, $lte: endDate },
      };

      return History.aggregate([
        { $match: matchCondition },
        {
          $group: {
            _id: "$userId",
            totalCoinsSpent: { $sum: "$senderCoin" },
          },
        },
        { $sort: { totalCoinsSpent: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                  image: 1,
                  isProfilePicBanned: 1,
                  gender: 1,
                  age: 1,
                  isVerified: 1,
                  wealthLevel: 1,
                  activeAvtarFrame: 1,
                },
              },
            ],
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "user.wealthLevel",
            foreignField: "_id",
            pipeline: [{ $project: { levelImage: 1 } }],
            as: "wealthDetails",
          },
        },
        { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "avtarframes",
            localField: "user.activeAvtarFrame",
            foreignField: "_id",
            pipeline: [{ $project: { image: 1, type: 1 } }],
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            userId: "$user._id",
            name: "$user.name",
            image: "$user.image",
            isProfilePicBanned: "$user.isProfilePicBanned",
            gender: "$user.gender",
            age: "$user.age",
            isVerified: "$user.isVerified",
            wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
            avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
            avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
            coin: "$totalCoinsSpent",
          },
        },
      ]);
    };

    const [daily, weekly, monthly] = await Promise.all([getTopConsumers("daily"), getTopConsumers("weekly"), getTopConsumers("monthly")]);

    return res.status(200).json({
      status: true,
      message: "Top coin consumers fetched successfully",
      data: {
        daily,
        weekly,
        monthly,
      },
    });
  } catch (error) {
    console.error("Error in fetchTopCoinConsumers:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get top gift senders and top gift receivers ( gifts )
exports.fetchTopGiftStats = async (req, res) => {
  try {
    const pageStart = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const skip = (pageStart - 1) * limit;

    const getRange = (type) => {
      const now = new Date();
      let start, end;

      if (type === "daily") {
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(now.setHours(23, 59, 59, 999));
      } else if (type === "weekly") {
        const offset = now.getDay() === 0 ? 6 : now.getDay() - 1;
        start = new Date(now.setDate(now.getDate() - offset));
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
      } else if (type === "monthly") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
      }

      return { start, end };
    };

    const buildAggregation = (field, startDate, endDate, coinField) => [
      {
        $match: {
          type: 6,
          [coinField]: { $gt: 0 },
          giftId: { $ne: null },
          giftReceivedCount: { $gt: 0 },
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: `$${field}`,
          totalCoins: { $sum: `$${coinField}` },
        },
      },
      { $sort: { totalCoins: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                image: 1,
                isProfilePicBanned: 1,
                gender: 1,
                age: 1,
                isVerified: 1,
                wealthLevel: 1,
                activeAvtarFrame: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "user.wealthLevel",
          foreignField: "_id",
          pipeline: [{ $project: { levelImage: 1 } }],
          as: "wealthDetails",
        },
      },
      { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "avtarframes",
          localField: "user.activeAvtarFrame",
          foreignField: "_id",
          pipeline: [{ $project: { image: 1, type: 1 } }],
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: "$user._id",
          name: "$user.name",
          image: "$user.image",
          isProfilePicBanned: "$user.isProfilePicBanned",
          gender: "$user.gender",
          age: "$user.age",
          isVerified: "$user.isVerified",
          wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          coin: "$totalCoins",
        },
      },
    ];

    const dailyRange = getRange("daily");
    const weeklyRange = getRange("weekly");
    const monthlyRange = getRange("monthly");

    const getRanking = async (start, end) => {
      const [topSenders, topReceivers] = await Promise.all([
        History.aggregate(buildAggregation("userId", start, end, "senderCoin")),
        History.aggregate(buildAggregation("otherUserId", start, end, "receiverCoin")),
      ]);

      return { topSenders, topReceivers };
    };

    const [daily, weekly, monthly] = await Promise.all([
      getRanking(dailyRange.start, dailyRange.end),
      getRanking(weeklyRange.start, weeklyRange.end),
      getRanking(monthlyRange.start, monthlyRange.end),
    ]);

    return res.status(200).json({
      status: true,
      message: "Top gift stats fetched successfully",
      data: { daily, weekly, monthly },
    });
  } catch (error) {
    console.error("Error in fetchTopGiftStats:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get coin consumed by gifting in liveRoom ( fansRanking )
exports.getFansRanking = async (req, res) => {
  try {
    const pageStart = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const skip = (pageStart - 1) * limit;

    const getRange = (type) => {
      const now = new Date();
      let start, end;

      if (type === "daily") {
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(now.setHours(23, 59, 59, 999));
      } else if (type === "weekly") {
        const offset = now.getDay() === 0 ? 6 : now.getDay() - 1;
        start = new Date(now.setDate(now.getDate() - offset));
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
      } else if (type === "monthly") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
      }

      return { start, end };
    };

    const getRanking = async (start, end) => {
      return History.aggregate([
        {
          $match: {
            type: 6,
            senderCoin: { $gt: 0 },
            liveHistoryId: { $ne: null },
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: "$userId",
            totalCoinsSpent: { $sum: "$senderCoin" },
          },
        },
        { $sort: { totalCoinsSpent: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                  image: 1,
                  isProfilePicBanned: 1,
                  gender: 1,
                  age: 1,
                  isVerified: 1,
                  wealthLevel: 1,
                  activeAvtarFrame: 1,
                },
              },
            ],
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "user.wealthLevel",
            foreignField: "_id",
            pipeline: [{ $project: { levelImage: 1 } }],
            as: "wealthDetails",
          },
        },
        { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "avtarframes",
            localField: "user.activeAvtarFrame",
            foreignField: "_id",
            pipeline: [{ $project: { image: 1, type: 1 } }],
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            userId: "$userDetails._id",
            name: "$userDetails.name",
            image: "$userDetails.image",
            isProfilePicBanned: "$userDetails.isProfilePicBanned",
            gender: "$userDetails.gender",
            age: "$userDetails.age",
            isVerified: "$userDetails.isVerified",
            wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
            avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
            avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
            coin: "$totalCoinsSpent",
          },
        },
      ]);
    };

    const dailyRange = getRange("daily");
    const weeklyRange = getRange("weekly");
    const monthlyRange = getRange("monthly");

    const [daily, weekly, monthly] = await Promise.all([
      getRanking(dailyRange.start, dailyRange.end),
      getRanking(weeklyRange.start, weeklyRange.end),
      getRanking(monthlyRange.start, monthlyRange.end),
    ]);

    return res.status(200).json({
      status: true,
      message: "Fans Rankings fetched successfully",
      data: {
        daily,
        weekly,
        monthly,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, error: err.message || "Internal Server Error" });
  }
};
