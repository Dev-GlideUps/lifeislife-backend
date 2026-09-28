const GameAdminCoin = require("../../models/gameadminCoin.model");

//reset game admin's coin
exports.resetGameAdminCoins = async (req, res) => {
  try {
    const gameAdminCoin = await GameAdminCoin.findOneAndUpdate(
      {},
      [
        {
          $set: {
            totalCoin: {
              $cond: {
                if: { $gt: ["$totalCoin", 0] },
                then: { $add: ["$totalCoin", "$coin"] },
                else: "$totalCoin",
              },
            },
            coin: 0,
          },
        },
      ],
      { new: true },
    ).lean();

    if (!gameAdminCoin) {
      return res.status(200).json({ status: false, message: "GameAdminCoin data not found" });
    }

    return res.status(200).json({ status: true, message: "Reset Successfully!", gameAdminCoin });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Server Error" });
  }
};
