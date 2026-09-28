const CoinTrader = require("../../models/cointrader.model");

//import model
const User = require("../../models/user.model");
const CoinTraderHistory = require("../../models/coinTraderHistory.model");
const History = require("../../models/history.model");

//mongoose
const mongoose = require("mongoose");

//generateHistoryUniqueId
const generateHistoryUniqueId = require("../../util/generateHistoryUniqueId");

//private key
const admin = require("../../util/privateKey");

//coin purchased from coinTrader
exports.purchaseCoinFromCoinTrader = async (req, res) => {
  try {
    const { uniqueId, coinTraderId, coin } = req.query;

    if (!uniqueId || !coinTraderId || !coin || parseInt(coin) <= 0) {
      return res.status(200).json({ status: false, message: "Oops! Invalid details provided." });
    }

    const traderObjectId = new mongoose.Types.ObjectId(coinTraderId);
    const coinValue = Number(coin);

    const [historyUniqueId, coinTrader, user] = await Promise.all([
      generateHistoryUniqueId(),
      CoinTrader.findOne({ _id: traderObjectId, isActive: true }).select("coin spendCoin userId isActive").lean(),
      User.findOne({ uniqueId }).select("_id name fcmToken isBlock isPushNotificationEnabled").lean(), //who purchase the coin from coinTrader
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (!coinTrader) {
      return res.status(200).json({ status: false, message: "CoinTrader not found or inactive." });
    }

    if (coinTrader.coin < coinValue) {
      return res.status(200).json({ status: false, message: "Insufficient coins available with the trader." });
    }

    res.status(200).json({
      status: true,
      message: `Coins transferred to ${user?.name}`,
    });

    await Promise.all([
      CoinTrader.updateOne(
        { _id: traderObjectId, coin: { $gt: 0 } },
        {
          $inc: {
            spendCoin: coinValue,
            coin: -coinValue,
          },
        },
      ),
      User.updateOne(
        { _id: user._id },
        {
          $inc: {
            coin: coinValue,
            topUpCoins: coinValue,
          },
        },
      ),
      CoinTraderHistory.create({
        coinTraderId: traderObjectId,
        userId: user._id,
        coin: coinValue,
        isIncome: false,
        date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      }),
      History.create({
        uniqueId: historyUniqueId,
        type: 11,
        userId: coinTrader?.userId,
        otherUserId: user._id,
        coin: coinValue,
        date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      }),
    ]);

    if (user.isPushNotificationEnabled && !user.isBlock && user.fcmToken) {
      const payload = {
        token: user.fcmToken,
        notification: {
          title: "Hoo Hoo! Coins Received 🎉",
          body: `You have received ${coinValue} coin through offline recharge.`,
        },
        data: {
          type: "offlineRecharge",
        },
      };

      const adminApp = await admin;
      adminApp
        .messaging()
        .send(payload)
        .then((response) => {
          console.log("Successfully sent notification:", response);
        })
        .catch((error) => {
          console.error("Error sending notification:", error);
        });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get coinseller's profile
exports.fetchCoinTraderProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const coinTrader = await CoinTrader.aggregate([
      {
        $match: {
          userId: userId,
          isActive: true,
        },
      },
      {
        $lookup: {
          from: "blocks",
          localField: "userId", // CoinTrader.userId
          foreignField: "toUserId", // Block.toUserId
          pipeline: [
            { $match: { userId: userId } }, // Block.userId = current user
          ],
          as: "isBlocked",
        },
      },
      {
        $match: {
          isBlocked: { $eq: [] }, // Exclude blocked users
        },
      },
      {
        $project: {
          _id: 1,
          uniqueId: 1,
          coin: 1,
          spendCoin: 1,
          countryCode: 1,
          mobileNumber: 1,
          userId: 1,
          createdAt: 1,
        },
      },
      { $limit: 1 },
    ]);

    if (coinTrader.length === 0) {
      return res.status(200).json({ status: false, message: "Coin trader not found or is blocked." });
    }

    return res.status(200).json({
      status: true,
      message: "Coin trader fetched successfully.",
      data: coinTrader.length > 0 ? coinTrader[0] : null,
    });
  } catch (error) {
    console.error("Error in getActiveCoinTrader:", error);
    return res.status(500).json({ status: false, message: "Failed to fetch coin trader.", error: error.message });
  }
};

//get active coinTrader list
exports.fetchActiveCoinTraderList = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const start = parseInt(req.query.start);
    const limit = parseInt(req.query.limit);

    const safeStart = Number.isFinite(start) && start > 0 ? start : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 20;

    const skip = (safeStart - 1) * safeLimit;

    const search = req.query.search?.trim();
    const countryNorm = req.query.country?.trim().toLowerCase();

    let searchMatch = {};
    if (search) {
      searchMatch = {
        $or: [
          { mobileNumber: { $regex: search, $options: "i" } },
          { uniqueId: { $regex: search, $options: "i" } },
          { "userDetails.name": { $regex: search, $options: "i" } },
          { "userDetails.userName": { $regex: search, $options: "i" } },
          { "userDetails.uniqueId": { $regex: search, $options: "i" } },
        ],
      };
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const aggResult = await CoinTrader.aggregate([
      {
        $match: {
          isActive: true,
          userId: { $ne: null },
        },
      },
      {
        $lookup: {
          from: "blocks",
          localField: "userId",
          foreignField: "toUserId",
          pipeline: [
            {
              $match: {
                userId: userId, // logged-in user
              },
            },
            { $limit: 1 },
          ],
          as: "isBlocked",
        },
      },
      {
        $match: {
          isBlocked: { $eq: [] },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                uniqueId: 1,
                name: 1,
                userName: 1,
                image: 1,
                isProfilePicBanned: 1,
                gender: 1,
                countryFlagImage: 1,
                country: 1,
                isVerified: 1,
                activeAvtarFrame: 1,
              },
            },
          ],
          as: "userDetails",
        },
      },
      {
        $unwind: {
          path: "$userDetails",
          preserveNullAndEmptyArrays: false,
        },
      },
      ...(search ? [{ $match: searchMatch }] : []),
      ...(countryNorm
        ? [
            {
              $match: {
                "userDetails.country": {
                  $regex: `^${countryNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
                  $options: "i",
                },
              },
            },
          ]
        : []),
      // {
      //   $lookup: {
      //     from: "avtarframes",
      //     localField: "userDetails.activeAvtarFrame",
      //     foreignField: "_id",
      //     pipeline: [
      //       {
      //         $project: {
      //           type: 1,
      //           image: 1,
      //         },
      //       },
      //     ],
      //     as: "avtarframeDetails",
      //   },
      // },
      // {
      //   $unwind: {
      //     path: "$avtarframeDetails",
      //     preserveNullAndEmptyArrays: true,
      //   },
      // },
      {
        $facet: {
          total: [{ $count: "total" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: safeLimit },
            {
              $project: {
                _id: 1,
                uniqueId: 1,
                countryCode: 1,
                mobileNumber: 1,
                coin: 1,
                spendCoin: 1,
                sellerType: 1,
                isActive: 1,
                createdAt: 1,
                userId: {
                  _id: "$userDetails._id",
                  uniqueId: "$userDetails.uniqueId",
                  name: "$userDetails.name",
                  userName: "$userDetails.userName",
                  image: "$userDetails.image",
                  isProfilePicBanned: "$userDetails.isProfilePicBanned",
                  gender: "$userDetails.gender",
                  countryFlagImage: "$userDetails.countryFlagImage",
                  country: "$userDetails.country",
                  isVerified: "$userDetails.isVerified",
                  // activeAvtarFrame: {
                  //   type: { $ifNull: ["$avtarframeDetails.type", 0] },
                  //   image: { $ifNull: ["$avtarframeDetails.image", ""] },
                  // },
                },
              },
            },
          ],
        },
      },
    ]);

    // const total = aggResult?.[0]?.total?.[0]?.total || 0;
    const coinTraders = aggResult?.[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: coinTraders.length > 0 ? "Active coin traders fetched successfully." : "No active coin traders found.",
      // total,
      data: coinTraders,
    });
  } catch (error) {
    console.error("Error in fetchActiveCoinTraderList:", error);
    return res.status(500).json({ status: false, message: "Failed to fetch active coin traders.", error: error.message });
  }
};
