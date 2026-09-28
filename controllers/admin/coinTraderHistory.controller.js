const CoinTraderHistory = require("../../models/coinTraderHistory.model");

//import model
const CoinTrader = require("../../models/cointrader.model");

//mongoose
const mongoose = require("mongoose");

//get coinTrader's history
exports.getCoinTraderHistory = async (req, res) => {
  try {
    const { coinTraderId } = req.query;
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    if (!coinTraderId) {
      return res.status(200).json({ status: false, message: "coinTraderId is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(coinTraderId)) {
      return res.status(200).json({ status: false, message: "Invalid CoinTrader ID." });
    }

    const traderObjectId = new mongoose.Types.ObjectId(coinTraderId);

    const matchStage = {
      coinTraderId: traderObjectId,
    };

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    if (startDate !== "All" && endDate !== "All" && startDate && endDate) {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);

      endDateObj.setHours(23, 59, 59, 999);

      matchStage.createdAt = {
        $gte: startDateObj,
        $lte: endDateObj,
      };
    }

    const trader = await CoinTrader.findById(traderObjectId).select("coin").lean();

    if (!trader) {
      return res.status(200).json({ status: false, message: "Coin Trader not found or inactive." });
    }

    const result = await CoinTraderHistory.aggregate([
      {
        $match: matchStage,
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
                gender: 1,
                countryFlagImage: 1,
                country: 1,
              },
            },
          ],
          as: "userId",
        },
      },
      {
        $unwind: { path: "$userId", preserveNullAndEmptyArrays: true },
      },
      {
        $addFields: {
          userId: { $ifNull: ["$userId", null] },
        },
      },
      {
        $facet: {
          totalRecords: [{ $count: "count" }],
          history: [{ $sort: { createdAt: -1 } }, { $skip: (start - 1) * limit }, { $limit: limit }],
        },
      },
    ]);

    const totalRecords = result[0]?.totalRecords[0]?.count || 0;
    const history = result[0]?.history || [];

    return res.status(200).json({
      status: true,
      message: "Coin Trader history retrieved successfully.",
      totalCoin: trader.coin,
      totalRecords,
      history,
    });
  } catch (error) {
    console.error("Error in getCoinTraderHistory:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal server error" });
  }
};
