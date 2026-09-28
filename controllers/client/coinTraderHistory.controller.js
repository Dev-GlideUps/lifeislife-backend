const CoinTraderHistory = require("../../models/coinTraderHistory.model");

//import model
const CoinTrader = require("../../models/cointrader.model");

//mongoose
const mongoose = require("mongoose");

//retrieves the coin spending history of a coinTrader user
exports.historyOfCoinTraderToUser = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const coinTraderId = req.query.coinTraderId || {};
    if (!mongoose.Types.ObjectId.isValid(coinTraderId)) {
      return res.status(200).json({ status: false, message: "Invalid CoinTrader ID." });
    }

    const [coinTrader, history] = await Promise.all([
      CoinTrader.findOne({ _id: coinTraderId, isActive: true }).select("_id").lean(),
      CoinTraderHistory.find({ coinTraderId: coinTraderId })
        .select("_id isIncome coin date createdAt")
        .populate({
          path: "userId",
          select: "uniqueId name userName image isProfilePicBanned gender countryFlagImage country isVerified",
          populate: {
            path: "activeAvtarFrame",
            select: "type image",
          },
        })
        .sort({ _id: -1 })
        .skip((start - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    if (!coinTrader) {
      return res.status(200).json({ status: false, message: "CoinTrader not found or not active." });
    }

    return res.status(200).json({
      status: true,
      message: "CoinTrader history fetched successfully.",
      history: history,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
