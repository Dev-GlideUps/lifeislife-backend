const PayoutRequest = require("../../models/payoutRequest.model");

//import model
const User = require("../../models/user.model");

//mongoose
const mongoose = require("mongoose");

//get host's payout requests
exports.retrieveHostPayouts = async (req, res) => {
  try {
    const { status, userId, startDate = "All", endDate = "All" } = req.query;

    if (!status) {
      return res.status(200).json({ status: false, message: "Missing required query parameters." });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(200).json({ status: false, message: "Invalid or missing userId." });
    }

    const objectId = new mongoose.Types.ObjectId(userId);
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const formattedStartDate = new Date(startDate);
      const formattedEndDate = new Date(endDate);
      formattedEndDate.setHours(23, 59, 59, 999);
      dateFilterQuery.createdAt = { $gte: formattedStartDate, $lte: formattedEndDate };
    }

    const statusQuery = status !== "All" ? { status: parseInt(status) } : {};
    const finalQuery = { person: 2, userId: objectId, ...statusQuery, ...dateFilterQuery };

    const host = await User.findOne({ _id: objectId, role: { $in: [2] }, agencyId: { $ne: null } })
      .select("_id")
      .lean();

    if (!host) {
      return res.status(200).json({
        status: false,
        message: "Host not found or does not belong to an agency.",
      });
    }

    const result = await PayoutRequest.aggregate([
      {
        $match: finalQuery,
      },
      {
        $facet: {
          total: [{ $count: "count" }],
          records: [
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
                      uniqueId: 1,
                      name: 1,
                      userName: 1,
                      image: 1,
                    },
                  },
                ],
                as: "userId",
              },
            },
            {
              $unwind: { path: "$userId", preserveNullAndEmptyArrays: true },
            },
          ],
        },
      },
      {
        $project: {
          total: { $ifNull: [{ $arrayElemAt: ["$total.count", 0] }, 0] },
          records: 1,
        },
      },
    ]);

    const final = result[0] || { total: 0, records: [] };

    return res.status(200).json({
      status: true,
      message: "Host payout requests retrieved successfully.",
      total: final.total,
      data: final.records.length > 0 ? final.records : [],
    });
  } catch (error) {
    console.error("Error in retrieveHostPayouts:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
