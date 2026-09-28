const CoinTrader = require("../../models/cointrader.model");

//import model
const User = require("../../models/user.model");
const CoinTraderHistory = require("../../models/coinTraderHistory.model");

//mongoose
const mongoose = require("mongoose");

//private key
const admin = require("../../util/privateKey");

//create coinTrader
exports.registerCoinTrader = async (req, res) => {
  try {
    const { uniqueId, coin, mobileNumber, countryCode } = req.query;

    if (!uniqueId || !mobileNumber || !countryCode || !coin || parseInt(coin) < 0) {
      return res.status(200).json({ status: false, message: "Invalid input. Please check the details." });
    }

    const [user, existingTrader] = await Promise.all([
      User.findOne({ uniqueId }).select("_id name userName image role uniqueId fcmToken isPushNotificationEnabled isBlock").lean(),
      CoinTrader.findOne({ uniqueId }).select("_id").lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (Array.isArray(user.role) && user.role.includes(4)) {
      return res.status(200).json({ status: false, message: "User is already a CoinTrader." });
    }

    if (existingTrader) {
      return res.status(200).json({ status: false, message: "CoinTrader already registered with this uniqueId." });
    }

    const createdTrader = await CoinTrader.create({
      userId: user._id,
      uniqueId: user.uniqueId,
      coin: parseInt(coin),
      countryCode,
      mobileNumber,
    });

    const traderData = createdTrader.toObject();

    res.status(200).json({
      status: true,
      message: "CoinTrader registration initiated successfully.",
      data: {
        ...traderData,
        userId: user,
      },
    });

    if (user?.fcmToken && !user?.isBlock && user?.isPushNotificationEnabled) {
      const payload = {
        token: user.fcmToken,
        notification: {
          title: "💰 CoinTrader Registration Successful!",
          body: `🎉 Congratulations ${user?.name}, you are now registered as a CoinTrader with ${coin} coins!`,
        },
        data: {
          type: "COIN_TRADER_REGISTER",
          coinTraderId: String(createdTrader._id),
          userId: String(user._id),
          coin: String(coin),
        },
      };

      const adminInstance = await admin;
      adminInstance
        .messaging()
        .send(payload)
        .then((response) => {
          console.log("CoinTrader notification sent:", response);
        })
        .catch((error) => {
          console.log("CoinTrader notification error:", error);
        });
    }

    await Promise.all([
      CoinTraderHistory.create({
        coinTraderId: createdTrader._id,
        coin: parseInt(coin),
        isIncome: true,
        date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      }),
      User.updateOne(
        { _id: user._id },
        { $addToSet: { role: 4 } }, // add role if not already present
      ),
    ]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Something went wrong. Please try again later.",
    });
  }
};

//coin add or coin less
exports.updateCoinForTraderByAdmin = async (req, res) => {
  try {
    const { coinTraderId, coin, type } = req.query;

    if (!coinTraderId || !coin || !["add", "subtract"].includes(type)) {
      return res.status(200).json({ status: false, message: "Oops! Invalid details." });
    }

    const coinTraderObjectId = new mongoose.Types.ObjectId(coinTraderId);
    const coinAmount = Math.abs(Number(coin));
    const incrementValue = type === "add" ? coinAmount : -coinAmount;
    const isIncome = type === "add";

    if (coinAmount <= 0) {
      return res.status(200).json({ status: false, message: "Coin value must be greater than 0." });
    }

    const [coinTrader, updatedCoinTrader, historyEntry] = await Promise.all([
      CoinTrader.findById(coinTraderObjectId).select("userId uniqueId coin spendCoin").lean(),
      CoinTrader.findOneAndUpdate({ _id: coinTraderObjectId }, { $inc: { coin: incrementValue } }, { new: true })
        .select("userId uniqueId coin spendCoin")
        .lean(),
      CoinTraderHistory.create({
        coinTraderId: coinTraderObjectId,
        coin: coinAmount,
        isIncome: isIncome,
        userId: null,
        date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      }),
    ]);

    if (!coinTrader) {
      return res.status(200).json({ status: false, message: "CoinTrader not found." });
    }

    res.status(200).json({
      status: true,
      message: `Coins ${isIncome ? "added to" : "deducted from"} trader successfully.`,
      data: updatedCoinTrader,
    });

    const user = await User.findById(coinTrader.userId).select("name fcmToken isBlock isPushNotificationEnabled").lean();

    if (user?.fcmToken && !user?.isBlock && user?.isPushNotificationEnabled) {
      const payload = {
        token: user.fcmToken,
        notification: {
          title: isIncome ? "💰 Coins Added Successfully!" : "⚠️ Coins Deducted",
          body: isIncome
            ? `🎉 Hello ${user.name}, ${coinAmount} coins have been added to your CoinTrader account.`
            : `⚠️ Hello ${user.name}, ${coinAmount} coins have been deducted from your CoinTrader account.`,
        },
        data: {
          type: "COIN_TRADER_UPDATE",
          coinTraderId: String(updatedCoinTrader._id),
          userId: String(user._id),
          coin: String(coinAmount),
          action: type,
        },
      };

      const adminInstance = await admin;
      adminInstance
        .messaging()
        .send(payload)
        .then((response) => {
          console.log("CoinTrader update notification sent:", response);
        })
        .catch((error) => {
          console.log("CoinTrader update notification error:", error);
        });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//manage coinTrader's active or inactive status
exports.updateCoinTraderActiveStatus = async (req, res) => {
  try {
    const { coinTraderId, userId } = req.query;

    if (!coinTraderId || !userId) {
      return res.status(200).json({ status: false, message: "coinTraderId and userId must be provided." });
    }

    const coinTraderObjectId = new mongoose.Types.ObjectId(coinTraderId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const coinTrader = await CoinTrader.findById(coinTraderObjectId).select("isActive userId").lean();

    if (!coinTrader) {
      return res.status(200).json({ status: false, message: "CoinTrader not found." });
    }

    const newIsActive = !coinTrader.isActive;
    const [updatedCoinTrader, _] = await Promise.all([
      CoinTrader.findOneAndUpdate({ _id: coinTraderObjectId }, { isActive: newIsActive }, { new: true }).select("userId uniqueId coin spendCoin isActive").lean(),
      User.updateOne(
        { _id: userObjectId },
        newIsActive
          ? { $addToSet: { role: 4 } } // add 4 only if not present
          : { $pull: { role: 4 } }, // remove 4 if exists
      ),
    ]);

    return res.status(200).json({
      status: true,
      message: "Trader active status updated successfully.",
      coinTrader: updatedCoinTrader,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update coinTrader's profile
exports.updateCoinTraderProfile = async (req, res) => {
  try {
    const { coinTraderId, mobileNumber, countryCode } = req.query;

    if (!coinTraderId) {
      return res.status(200).json({ status: false, message: "coinTraderId must be provided." });
    }

    const coinTraderObjectId = new mongoose.Types.ObjectId(coinTraderId);

    const coinTrader = await CoinTrader.findById(coinTraderObjectId).select("userId mobileNumber countryCode uniqueId coin spendCoin isActive").lean();

    if (!coinTrader) {
      return res.status(200).json({ status: false, message: "CoinTrader not found." });
    }

    const updateData = {
      mobileNumber: mobileNumber !== undefined ? mobileNumber : coinTrader.mobileNumber,
      countryCode: countryCode !== undefined ? countryCode : coinTrader.countryCode,
    };

    const updatedCoinTrader = await CoinTrader.findOneAndUpdate({ _id: coinTraderObjectId }, updateData, { new: true })
      .select("userId mobileNumber countryCode uniqueId coin spendCoin isActive")
      .lean();

    return res.status(200).json({
      status: true,
      message: "CoinTrader profile updated successfully.",
      data: updatedCoinTrader,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get coinTrader statistics (total / active / inactive / totalCoins)
exports.fetchCoinTraderStatistics = async (req, res) => {
  try {
    const result = await CoinTrader.aggregate([
      {
        $group: {
          _id: null,
          totalTraders: { $sum: 1 },
          active: {
            $sum: {
              $cond: [{ $eq: ["$isActive", true] }, 1, 0],
            },
          },
          inactive: {
            $sum: {
              $cond: [{ $eq: ["$isActive", false] }, 1, 0],
            },
          },
          totalCoins: { $sum: { $ifNull: ["$coin", 0] } },
          totalSpendCoins: { $sum: { $ifNull: ["$spendCoin", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          totalTraders: 1,
          active: 1,
          inactive: 1,
          totalCoins: 1,
          totalSpendCoins: 1,
        },
      },
    ]);

    const data = result[0] || {
      totalTraders: 0,
      active: 0,
      inactive: 0,
      totalCoins: 0,
      totalSpendCoins: 0,
    };

    return res.status(200).json({
      status: true,
      message: "Coin trader statistics fetched successfully.",
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get coinTraders
exports.getAllCoinTraders = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const searchString = req.query.search || "";
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";
    const country = req.query.country || "All";
    const isActiveParam = req.query.isActive ?? "All";

    let matchStage = {};

    if (startDate !== "All" && endDate !== "All") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      matchStage.createdAt = {
        $gte: startDateObj,
        $lte: endDateObj,
      };
    }

    if (isActiveParam !== "All" && isActiveParam !== "") {
      matchStage.isActive = isActiveParam === "true";
    }

    const result = await CoinTrader.aggregate([
      { $match: matchStage },
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
                uniqueId: 1,
                image: 1,
                country: 1,
              },
            },
          ],
          as: "userDetails",
        },
      },
      {
        $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: false },
      },
      ...(country !== "All" && country.trim() !== ""
        ? [
            {
              $match: {
                "userDetails.country": { $regex: `^${country}$`, $options: "i" },
              },
            },
          ]
        : []),
      ...(searchString !== "All" && searchString.trim() !== ""
        ? [
            {
              $match: {
                $or: [
                  { uniqueId: { $regex: searchString, $options: "i" } },
                  { "userDetails.name": { $regex: searchString, $options: "i" } },
                  { "userDetails.userName": { $regex: searchString, $options: "i" } },
                  { "userDetails.uniqueId": { $regex: searchString, $options: "i" } },
                ],
              },
            },
          ]
        : []),

      {
        $facet: {
          totalCount: [{ $count: "total" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                uniqueId: 1,
                countryCode: 1,
                mobileNumber: 1,
                coin: 1,
                spendCoin: 1,
                isActive: 1,
                userId: 1,
                createdAt: 1,
                userDetails: {
                  name: "$userDetails.name",
                  userName: "$userDetails.userName",
                  uniqueId: "$userDetails.uniqueId",
                  image: "$userDetails.image",
                  country: "$userDetails.country",
                },
              },
            },
          ],
        },
      },
    ]);

    const total = result[0]?.totalCount[0]?.total || 0;
    const data = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "CoinTraders fetched successfully.",
      total,
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
