const Agency = require("../../models/agency.model");

//mongoose
const mongoose = require("mongoose");

//moment-timezone
const moment = require("moment-timezone");

//import model
const History = require("../../models/history.model");

//get agency profile
exports.fetchAgencyInfo = async (req, res) => {
  try {
    if (!req.query.agencyId) {
      return res.status(200).json({ status: false, message: "Agency ID is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.agencyId)) {
      return res.status(200).json({ status: false, message: "Invalid agencyId. Please provide a valid ObjectId." });
    }

    const agencyObjectId = new mongoose.Types.ObjectId(req.query.agencyId);

    const agencyExists = await Agency.findById(agencyObjectId).select("_id isActive").lean();

    if (!agencyExists) {
      return res.status(200).json({ status: false, message: "Agency not found." });
    }

    if (!agencyExists.isActive) {
      return res.status(200).json({ status: false, message: "Agency is currently inactive." });
    }

    const todayStart = moment().tz("Asia/Kolkata").startOf("day").toDate();
    const now = moment().tz("Asia/Kolkata").toDate();
    const weekStart = moment().tz("Asia/Kolkata").startOf("week").toDate();

    const agencyPipeline = [
      { $match: { _id: agencyObjectId } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "agencyId",
          pipeline: [{ $project: { _id: 1 } }],
          as: "hosts",
        },
      },
      // {
      //   $lookup: {
      //     from: "histories",
      //     localField: "_id",
      //     foreignField: "hostAgencyId",
      //     pipeline: [
      //       { $match: { otherUserId: { $ne: null } } },
      //       {
      //         $group: {
      //           _id: null,
      //           totalHostCoins: { $sum: "$receiverCoin" },
      //         },
      //       },
      //     ],
      //     as: "hostEarnings",
      //   },
      // },
      // {
      //   $lookup: {
      //     from: "histories",
      //     localField: "_id",
      //     foreignField: "agencyId",
      //     pipeline: [
      //       { $match: { type: 9 } },
      //       {
      //         $group: {
      //           _id: null,
      //           totalAgencyCoins: { $sum: "$coin" },
      //         },
      //       },
      //     ],
      //     as: "agencyEarnings",
      //   },
      // },
    ];

    agencyPipeline.push({
      $project: {
        _id: 1,
        agencyCode: 1,
        agencyName: 1,
        image: 1,
        countryFlagImage: 1,
        country: 1,
        mobileNumber: 1,
        contactEmail: 1,
        description: 1,
        commissionRate: 1,
        totalWithdrawn: 1,
        totalWithdrawnAmount: 1,
        isActive: 1,
        createdAt: 1,
        updatedAt: 1,
        hostCount: { $size: "$hosts" },
        // hostCoins: { $ifNull: [{ $arrayElemAt: ["$hostEarnings.totalHostCoins", 0] }, 0] },
        // totalEarnings: { $ifNull: [{ $arrayElemAt: ["$agencyEarnings.totalAgencyCoins", 0] }, 0] },
        // netEarnings: { $subtract: [{ $ifNull: [{ $arrayElemAt: ["$agencyEarnings.totalAgencyCoins", 0] }, 0] }, { $ifNull: ["$totalWithdrawn", 0] }] },
        hostCoins: { $ifNull: ["$hostCoins", 0] },
        totalEarnings: { $ifNull: ["$totalEarnings", 0] },
        netEarnings: { $ifNull: ["$netAvailableEarnings", 0] },
      },
    });

    const [agencyResult, incomeResult] = await Promise.all([
      Agency.aggregate(agencyPipeline),
      History.aggregate([
        {
          $match: {
            agencyId: agencyObjectId,
            type: 9,
            createdAt: { $lte: now },
          },
        },
        {
          $facet: {
            todayIncome: [{ $match: { createdAt: { $gte: todayStart } } }, { $group: { _id: null, total: { $sum: "$coin" } } }],
            thisWeekIncome: [{ $match: { createdAt: { $gte: weekStart } } }, { $group: { _id: null, total: { $sum: "$coin" } } }],
          },
        },
      ]),
    ]);

    const agency = agencyResult[0];

    const todayIncome = incomeResult[0]?.todayIncome?.[0]?.total || 0;
    const thisWeekIncome = incomeResult[0]?.thisWeekIncome?.[0]?.total || 0;

    return res.status(200).json({
      status: true,
      message: "Agency profile retrieved successfully!",
      data: {
        ...agency,
        todayIncome,
        thisWeekIncome,
      },
    });
  } catch (error) {
    console.error("Error fetching agency profile:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};
