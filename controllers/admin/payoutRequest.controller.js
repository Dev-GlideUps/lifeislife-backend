const PayoutRequest = require("../../models/payoutRequest.model");

//import model
const User = require("../../models/user.model");
const History = require("../../models/history.model");
const Agency = require("../../models/agency.model");

//private key
const admin = require("../../util/privateKey");

const { buildAgencyWithdrawalUpdate } = require("../../util/agencyEarnings");

//get payout requests (user/host/agency)
exports.getPayoutRequests = async (req, res) => {
  try {
    const { status, person, search } = req.query || {};

    if (!status || !person) {
      return res.status(200).json({ status: false, message: "Missing required query parameters." });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let matchQuery = {};

    if (startDate !== "All" && endDate !== "All") {
      const startObj = new Date(startDate);
      const endObj = new Date(endDate);
      endObj.setHours(23, 59, 59, 999);

      matchQuery.createdAt = {
        $gte: startObj,
        $lte: endObj,
      };
    }

    if (status !== "All") {
      matchQuery.status = parseInt(status);
    }

    if (person !== "All") {
      const personValue = parseInt(person);
      matchQuery.person = personValue;

      if (personValue === 1) {
        matchQuery.agencyId = { $ne: null };
      } else if (personValue === 2 || personValue === 3) {
        matchQuery.userId = { $ne: null };
      }
    }

    const result = await PayoutRequest.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "agencies",
          localField: "agencyId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                agencyName: 1,
                image: 1,
                agencyCode: 1,
              },
            },
          ],
          as: "agencyId",
        },
      },
      {
        $unwind: { path: "$agencyId", preserveNullAndEmptyArrays: true },
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
              },
            },
          ],
          as: "userId",
        },
      },
      {
        $unwind: { path: "$userId", preserveNullAndEmptyArrays: true },
      },
      ...(search && search.trim() !== ""
        ? [
            {
              $match: {
                $or: [
                  { uniqueId: { $regex: search, $options: "i" } },
                  { "agencyId.agencyName": { $regex: search, $options: "i" } },
                  { "agencyId.agencyCode": { $regex: search, $options: "i" } },
                  { "userId.name": { $regex: search, $options: "i" } },
                  { "userId.userName": { $regex: search, $options: "i" } },
                  { "userId.uniqueId": { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
        : []),
      {
        $addFields: {
          agencyId: { $ifNull: ["$agencyId", null] },
          userId: { $ifNull: ["$userId", null] },
        },
      },
      {
        $facet: {
          total: [{ $count: "count" }],
          data: [{ $sort: { createdAt: -1 } }, { $skip: (start - 1) * limit }, { $limit: limit }],
        },
      },
    ]);

    const total = result[0]?.total[0]?.count || 0;
    const data = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Payout requests fetched successfully.",
      total,
      data,
    });
  } catch (error) {
    console.error("Error in getPayoutRequests:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get payout overview
exports.getPayoutRequestSummary = async (req, res) => {
  try {
    // Current Date
    const now = new Date();

    // Today Range
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Current Month Range
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    const result = await PayoutRequest.aggregate([
      {
        $group: {
          _id: null,

          // Pending
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", 1] }, { $ifNull: ["$amount", 0] }, 0],
            },
          },

          pendingCount: {
            $sum: {
              $cond: [{ $eq: ["$status", 1] }, 1, 0],
            },
          },

          // Processing
          processingAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", 0] }, { $ifNull: ["$amount", 0] }, 0],
            },
          },

          processingCount: {
            $sum: {
              $cond: [{ $eq: ["$status", 0] }, 1, 0],
            },
          },

          // Completed Today
          completedTodayAmount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$status", 2] }, { $gte: ["$updatedAt", todayStart] }, { $lte: ["$updatedAt", todayEnd] }],
                },
                { $ifNull: ["$amount", 0] },
                0,
              ],
            },
          },

          completedTodayCount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$status", 2] }, { $gte: ["$updatedAt", todayStart] }, { $lte: ["$updatedAt", todayEnd] }],
                },
                1,
                0,
              ],
            },
          },

          // Completed This Month
          completedThisMonthAmount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$status", 2] }, { $gte: ["$updatedAt", monthStart] }, { $lte: ["$updatedAt", monthEnd] }],
                },
                { $ifNull: ["$amount", 0] },
                0,
              ],
            },
          },

          completedThisMonthCount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$status", 2] }, { $gte: ["$updatedAt", monthStart] }, { $lte: ["$updatedAt", monthEnd] }],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          pendingAmount: 1,
          pendingCount: 1,
          processingAmount: 1,
          processingCount: 1,
          completedTodayAmount: 1,
          completedTodayCount: 1,
          completedThisMonthAmount: 1,
          completedThisMonthCount: 1,
        },
      },
    ]);

    const summary = result?.[0] || {
      pendingAmount: 0,
      pendingCount: 0,
      processingAmount: 0,
      processingCount: 0,
      completedTodayAmount: 0,
      completedTodayCount: 0,
      completedThisMonthAmount: 0,
      completedThisMonthCount: 0,
    };

    return res.status(200).json({
      status: true,
      message: "Payout request summary fetched successfully.",
      data: summary,
    });
  } catch (error) {
    console.error("Error in getPayoutRequestSummary:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal server error.",
    });
  }
};

//withdrawal trend (pending/approved/rejected)
exports.fetchWithdrawalTrend = async (req, res) => {
  try {
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const startObj = new Date(startDate);
      const endObj = new Date(endDate);
      endObj.setHours(23, 59, 59, 999);

      dateFilterQuery.createdAt = { $gte: startObj, $lte: endObj };
    }

    const trendRows = await PayoutRequest.aggregate([
      {
        $match: {
          ...dateFilterQuery,
          status: { $in: [1, 2, 3] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          pending: { $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ["$status", 2] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", 3] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return res.status(200).json({
      status: true,
      message: "Withdrawal trend fetched successfully.",
      chartWithdrawalTrend: trendRows,
    });
  } catch (error) {
    console.error("Error in fetchWithdrawalTrend:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//manage payout request (user/host/agency)
exports.updateWithdrawalStatus = async (req, res) => {
  try {
    const { requestId, type, reason } = req.query;

    if (!requestId || !type) {
      return res.status(200).json({ status: false, message: "Missing required parameters." });
    }

    const actionType = type.trim().toLowerCase();
    const dateNow = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

    const request = await PayoutRequest.findById(requestId).select("status person agencyId userId coin amount uniqueId").lean();

    if (!request) {
      return res.status(200).json({ status: false, message: "Withdrawal request not found." });
    }

    if (request.coin <= 0 || request.amount <= 0) {
      return res.status(200).json({ status: false, message: "Invalid withdrawal amount." });
    }

    if (request.status === 2) {
      return res.status(200).json({ status: false, message: "Request already approved." });
    }

    if (request.status === 3) {
      return res.status(200).json({ status: false, message: "Request already declined." });
    }

    let userData = null;
    let fcmReceiver = null;

    if (request.person === 1 && request.agencyId) {
      const agency = await Agency.findById(request.agencyId).select("isActive userId").lean();
      if (!agency) {
        return res.status(200).json({ status: false, message: "Agency not found." });
      }

      if (!agency.isActive) {
        return res.status(200).json({ status: false, message: "Agency is currently inactive or blocked by admin." });
      }

      userData = agency;

      if (agency.userId) {
        fcmReceiver = await User.findById(agency.userId).select("fcmToken isBlock isPushNotificationEnabled").lean();
      }
    } else if ((request.person === 2 || request.person === 3) && request.userId) {
      userData = await User.findById(request.userId).select("isBlock isHostBlocked fcmToken isPushNotificationEnabled").lean();
      if (!userData) {
        return res.status(200).json({ status: false, message: "User/Host not found." });
      }

      if (userData.isBlock) {
        return res.status(200).json({ status: false, message: "User/Host is currently inactive or blocked by admin." });
      }

      if (request.person === 2 && userData.isHostBlocked) {
        return res.status(200).json({ status: false, message: "Host is currently blocked by admin." });
      }

      fcmReceiver = userData;
    }

    if (!userData) {
      return res.status(200).json({ status: false, message: "Associated user not found." });
    }

    if (fcmReceiver?.isBlock || (request.person === 2 && fcmReceiver?.isHostBlocked)) {
      return res.status(200).json({ status: false, message: "Person is blocked by admin." });
    }

    if (actionType === "approve") {
      if (request.person === 1 && request.agencyId) {
        const agencyUpdate = await Agency.updateOne(
          {
            _id: request.agencyId,
            netAvailableEarnings: { $gte: request.coin },
          },
          buildAgencyWithdrawalUpdate(request.coin, request.amount),
        );

        if (agencyUpdate.matchedCount === 0) {
          return res.status(200).json({ status: false, message: "Insufficient earnings balance." });
        }
      } else if ((request.person === 2 || request.person === 3) && request.userId) {
        const user = await User.findById(request.userId).select("silverCoin").lean();

        if (!user) {
          return res.status(200).json({ status: false, message: "User not found." });
        }

        const silverBalance = Number(user.silverCoin || 0);

        if (request.coin > silverBalance) {
          return res.status(200).json({
            status: false,
            message: "Insufficient silver balance for payout.",
          });
        }

        const userUpdate = await User.updateOne(
          {
            _id: request.userId,
            silverCoin: { $gte: request.coin },
          },
          {
            $inc: {
              silverCoin: -request.coin,
              withdrawnCoins: request.coin,
              withdrawnAmount: request.amount,
            },
          },
        );

        if (userUpdate.matchedCount === 0) {
          return res.status(200).json({ status: false, message: "Insufficient silver balance." });
        }
      }

      res.status(200).json({
        status: true,
        message: "Withdrawal request approved successfully.",
      });

      await Promise.all([
        PayoutRequest.updateOne(
          { _id: request._id },
          {
            $set: {
              status: 2,
              acceptOrDeclineDate: dateNow,
            },
          },
        ),
        History.updateOne(
          { uniqueId: request.uniqueId, type: 8 },
          {
            $set: {
              payoutStatus: 2,
              date: dateNow,
            },
          },
        ),
      ]);

      if (fcmReceiver?.isPushNotificationEnabled && fcmReceiver?.fcmToken) {
        const p = request.person;
        const notification =
          p === 1
            ? { title: "✅ Agency payout approved", body: "🎉 Your agency withdrawal has been approved." }
            : p === 2
              ? { title: "✅ Host payout approved", body: "🎉 Your host withdrawal has been approved." }
              : { title: "✅ Payout approved", body: "🎉 Your withdrawal has been approved." };

        const payload = {
          token: fcmReceiver.fcmToken,
          notification,
          data: { type: "WITHDRAWREQUEST", person: String(request.person) },
        };

        const adminInstance = await admin;
        adminInstance
          .messaging()
          .send(payload)
          .catch((err) => {
            console.error("FCM error:", err.message);
          });
      }
    } else if (actionType === "reject") {
      if (!reason) {
        return res.status(200).json({ status: false, message: "Rejection reason is required." });
      }

      res.status(200).json({
        status: true,
        message: "Withdrawal request declined.",
      });

      await Promise.all([
        PayoutRequest.updateOne(
          { _id: request._id },
          {
            $set: {
              status: 3,
              reason: reason.trim(),
              acceptOrDeclineDate: dateNow,
            },
          },
        ),
        History.updateOne(
          { uniqueId: request.uniqueId, type: 8 },
          {
            $set: {
              payoutStatus: 3,
              reason: reason.trim(),
              date: dateNow,
            },
          },
        ),
      ]);

      if (fcmReceiver?.isPushNotificationEnabled && fcmReceiver?.fcmToken) {
        const p = Number(request.person);
        const notification =
          p === 1
            ? { title: "❌ Agency payout declined", body: "⚠️ Your agency withdrawal request was not approved." }
            : p === 2
              ? { title: "❌ Host payout declined", body: "⚠️ Your host withdrawal request was not approved." }
              : { title: "❌ Payout declined", body: "⚠️ Your withdrawal request was not approved." };
        const payload = {
          token: fcmReceiver.fcmToken,
          notification,
          data: { type: "WITHDRAWREQUEST", person: String(request.person) },
        };

        const adminInstance = await admin;
        adminInstance
          .messaging()
          .send(payload)
          .catch((err) => {
            console.error("FCM error:", err.message);
          });
      }
    } else {
      return res.status(200).json({ status: false, message: "Invalid type. Must be 'approve' or 'reject'." });
    }
  } catch (error) {
    console.error("Error in updateWithdrawalStatus:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
