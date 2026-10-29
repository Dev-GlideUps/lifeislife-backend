const CoinPlan = require("../../models/coinPlan.model");

//import model
const History = require("../../models/history.model");

const { HISTORY_TYPE } = require("../../types/constant");

//create coinplan
exports.storeCoinPlan = async (req, res) => {
  try {
    if (!req.body.coin || !req.body.amount) {
      return res.status(200).json({ status: false, message: "Oops! Invalid details. coin and amount are required." });
    }

    const { coin, amount, productKey, androidProductKey, iosProductKey } = req.body;

    const coinplan = new CoinPlan({
      coin,
      amount,
      productKey: productKey || "", // Legacy field
      androidProductKey: androidProductKey || productKey || "", // Use productKey as fallback
      iosProductKey: iosProductKey || "",
    });

    await coinplan.save();

    return res.status(200).json({
      status: true,
      message: "Coin plan created successfully",
      data: coinplan,
    });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server error" });
  }
};

//update coinplan
exports.updateCoinPlan = async (req, res) => {
  try {
    const { coinPlanId } = req.body;
    if (!coinPlanId) {
      return res.status(200).json({ status: false, message: "coinPlanId must be needed." });
    }

    const coinplan = await CoinPlan.findById(coinPlanId).lean();
    if (!coinplan) {
      return res.status(200).json({ status: false, message: "CoinPlan not found." });
    }

    const updateFields = {
      coin: req.body.coin ? Number(req.body.coin) : coinplan.coin,
      amount: req.body.amount ? Number(req.body.amount) : coinplan.amount,
      productKey: req.body.productKey !== undefined ? req.body.productKey : coinplan.productKey,
      androidProductKey: req.body.androidProductKey !== undefined ? req.body.androidProductKey : coinplan.androidProductKey,
      iosProductKey: req.body.iosProductKey !== undefined ? req.body.iosProductKey : coinplan.iosProductKey,
    };

    const updatedCoinPlan = await CoinPlan.findByIdAndUpdate(coinPlanId, updateFields, {
      new: true,
      select: "coin amount productKey androidProductKey iosProductKey",
      lean: true,
    });

    return res.status(200).json({
      status: true,
      message: "CoinPlan updated successfully",
      data: updatedCoinPlan,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//update coinplan status
exports.switchCoinPlanStatus = async (req, res) => {
  try {
    const { coinPlanId, field } = req.query;

    if (!coinPlanId || !["isPopular", "isActive"].includes(field)) {
      return res.status(200).json({ status: false, message: "Valid coinPlanId and field (isPopular or isActive) are required." });
    }

    const coinplan = await CoinPlan.findById(coinPlanId).select("isActive isPopular").lean();

    if (!coinplan) {
      return res.status(200).json({ status: false, message: "CoinPlan not found." });
    }

    const updateField = field === "isActive" ? { isActive: !coinplan.isActive } : { isPopular: !coinplan.isPopular };

    const updatedCoinPlan = await CoinPlan.findByIdAndUpdate(coinPlanId, updateField, { new: true, select: "isActive isPopular" }).lean();

    return res.status(200).json({ status: true, message: "Success", data: updatedCoinPlan });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//delete coinplan
exports.deleteCoinPlan = async (req, res) => {
  try {
    const { coinPlanId } = req.query;

    if (!coinPlanId) {
      return res.status(200).json({ status: false, message: "coinPlanId is required." });
    }

    const coinplan = await CoinPlan.findById(coinPlanId).select("_id").lean();

    if (!coinplan) {
      return res.status(200).json({ status: false, message: "CoinPlan not found." });
    }

    res.status(200).json({
      status: true,
      message: "Coinplan deleted Successfully",
    });

    await CoinPlan.deleteOne({ _id: coinPlanId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server error" });
  }
};

//get coinPlan
exports.getCoinPlans = async (req, res) => {
  try {
    const coinPlans = await CoinPlan.find()
      .select("coin amount productKey androidProductKey iosProductKey isActive isPopular")
      .sort({ coin: 1, amount: 1 })
      .lean();

    return res.status(200).json({
      status: true,
      message: "Retrieve CoinPlan Successfully",
      data: coinPlans,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get coin plan statistics (coins sold & admin earnings from plan purchases)
exports.fetchCoinPlanStatistics = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const result = await History.aggregate([
      {
        $match: {
          type: HISTORY_TYPE.COIN_PLAN_PURCHASE,
          amount: { $exists: true, $ne: 0 },
        },
      },
      {
        $group: {
          _id: null,
          totalCoinsSold: { $sum: { $ifNull: ["$coin", 0] } },
          totalEarned: { $sum: { $ifNull: ["$amount", 0] } },
          totalCoinsSoldToday: {
            $sum: {
              $cond: [
                {
                  $and: [{ $gte: ["$createdAt", todayStart] }, { $lte: ["$createdAt", todayEnd] }],
                },
                { $ifNull: ["$coin", 0] },
                0,
              ],
            },
          },
          totalEarningToday: {
            $sum: {
              $cond: [
                {
                  $and: [{ $gte: ["$createdAt", todayStart] }, { $lte: ["$createdAt", todayEnd] }],
                },
                { $ifNull: ["$amount", 0] },
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalCoinsSold: 1,
          totalCoinsSoldToday: 1,
          totalEarned: 1,
          totalEarningToday: 1,
        },
      },
    ]);

    const data = result[0] || {
      totalCoinsSold: 0,
      totalCoinsSoldToday: 0,
      totalEarned: 0,
      totalEarningToday: 0,
    };

    return res.status(200).json({
      status: true,
      message: "Coin plan statistics fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Error fetching coin plan statistics:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal server error" });
  }
};

//get coinplan histories of users (admin earning)
exports.getUserCoinPlanTransactions = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const startDate = req?.query?.startDate || "All";
    const endDate = req?.query?.endDate || "All";
    const search = req?.query?.search || "";

    let matchQuery = {
      type: HISTORY_TYPE.COIN_PLAN_PURCHASE,
      amount: { $exists: true, $ne: 0 },
    };

    if (startDate !== "All" && endDate !== "All") {
      const formatStartDate = new Date(startDate);
      const formatEndDate = new Date(endDate);
      formatEndDate.setHours(23, 59, 59, 999);

      matchQuery.createdAt = {
        $gte: formatStartDate,
        $lte: formatEndDate,
      };
    }

    const result = await History.aggregate([
      { $match: matchQuery },
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
              },
            },
          ],
          as: "userDetails",
        },
      },
      {
        $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true },
      },
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { "userDetails.name": { $regex: search, $options: "i" } },
                  { "userDetails.userName": { $regex: search, $options: "i" } },
                  { "userDetails.uniqueId": { $regex: search, $options: "i" } },
                  { uniqueId: { $regex: search, $options: "i" } }, // history uniqueId
                ],
              },
            },
          ]
        : []),
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          adminEarnings: [
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
              },
            },
          ],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                coin: 1,
                amount: 1,
                paymentGateway: 1,
                date: 1,
                uniqueId: 1,
                userDetails: {
                  _id: "$userDetails._id",
                  name: "$userDetails.name",
                  userName: "$userDetails.userName",
                  uniqueId: "$userDetails.uniqueId",
                  image: "$userDetails.image",
                },
              },
            },
          ],
        },
      },
    ]);

    const total = result[0]?.totalCount[0]?.count || 0;
    const adminEarnings = result[0]?.adminEarnings[0]?.total || 0;
    const data = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "User coin plan transactions retrieved successfully.",
      adminEarnings,
      total,
      data,
    });
  } catch (error) {
    console.error("Error fetching coin plan transactions:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};
