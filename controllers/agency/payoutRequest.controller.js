const PayoutRequest = require("../../models/payoutRequest.model");

//import model
const Agency = require("../../models/agency.model");
const User = require("../../models/user.model");
const History = require("../../models/history.model");

//mongoose
const mongoose = require("mongoose");

//private key
const admin = require("../../util/privateKey");

//generateHistoryUniqueId
const generateHistoryUniqueId = require("../../util/generateHistoryUniqueId");

//submit payout request
exports.requestAgencyPayout = async (req, res) => {
  try {
    const { paymentGateway, paymentDetails, coin } = req.body || {};
    const agencyId = req.query.agencyId || {};

    if (!settingJSON) {
      return res.status(200).json({ status: false, message: "Withdrawal settings not configured." });
    }

    if (!agencyId || !mongoose.Types.ObjectId.isValid(agencyId)) {
      return res.status(200).json({ status: false, message: "Invalid or missing agencyId." });
    }

    if (!paymentGateway || !paymentDetails || !coin) {
      return res.status(200).json({ status: false, message: "All required fields must be provided." });
    }

    const objectId = new mongoose.Types.ObjectId(agencyId);
    const formattedGateway = paymentGateway.trim();
    const requestedCoins = Number(coin);
    const requestAmount = parseFloat(requestedCoins / settingJSON.minCoinsToCashOut).toFixed(2);

    const agency = await Agency.findOne({ _id: objectId }).select("_id").lean();
    if (!agency) {
      return res.status(200).json({ status: false, message: "Account not found." });
    }

    const [uniqueId, agencyOwnerUser, agencyEarning] = await Promise.all([
      generateHistoryUniqueId(),
      User.findOne({ agencyOwnerId: objectId }).select("fcmToken isPushNotificationEnabled isBlock").lean(),
      Agency.findOne({ _id: objectId }).select("netAvailableEarnings").lean(),
      // Agency.aggregate([
      //   { $match: { _id: objectId } },
      //   {
      //     $lookup: {
      //       from: "histories",
      //       localField: "_id",
      //       foreignField: "agencyId",
      //       pipeline: [
      //         {
      //           $match: {
      //             type: 9,
      //           },
      //         },
      //         {
      //           $group: {
      //             _id: null,
      //             totalAgencyCoins: { $sum: "$coin" },
      //           },
      //         },
      //       ],
      //       as: "agencyEarnings",
      //     },
      //   },
      //   {
      //     $project: {
      //       totalEarnings: { $ifNull: [{ $arrayElemAt: ["$agencyEarnings.totalAgencyCoins", 0] }, 0] },
      //       netEarnings: { $subtract: [{ $ifNull: [{ $arrayElemAt: ["$agencyEarnings.totalAgencyCoins", 0] }, 0] }, { $ifNull: ["$totalWithdrawn", 0] }] },
      //     },
      //   },
      // ]),
    ]);

    // const netEarnings = agencyEarning[0]?.netEarnings || 0;
    const netEarnings = agencyEarning?.netAvailableEarnings || 0;

    if (requestedCoins > netEarnings) {
      return res.status(200).json({ status: false, message: "Insufficient balance." });
    }

    if (requestedCoins < settingJSON.agencyMinPayout) {
      return res.status(200).json({ status: false, message: `Minimum withdrawal is ${settingJSON.agencyMinPayout} coins.` });
    }

    let pendingFilter = { person: 1, agencyId: objectId, status: 1 };
    let declinedFilter = { person: 1, agencyId: objectId, status: 3 };

    const [pendingRequest, declinedRequest] = await Promise.all([PayoutRequest.findOne(pendingFilter).select("_id").lean(), PayoutRequest.findOne(declinedFilter).select("_id").lean()]);

    if (pendingRequest) {
      return res.status(200).json({
        status: false,
        message: "You already have a pending payout request under review.",
      });
    }

    let payoutData = {
      uniqueId,
      person: 1,
      agencyId: objectId,
      coin: requestedCoins,
      amount: requestAmount,
      paymentGateway: formattedGateway,
      paymentDetails: typeof paymentDetails === "object" ? paymentDetails : { value: String(paymentDetails) },
      requestDate: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    };

    if (declinedRequest) {
      res.status(200).json({
        status: true,
        message: "Declined request removed. New payout request submitted successfully.",
      });

      await Promise.all([PayoutRequest.deleteOne({ _id: declinedRequest._id }), PayoutRequest.create(payoutData)]);
    } else {
      res.status(200).json({
        status: true,
        message: "Your payout request has been submitted successfully.",
      });

      await Promise.all([PayoutRequest.create(payoutData)]);
    }

    if (agencyOwnerUser.isPushNotificationEnabled && !agencyOwnerUser.isBlock && agencyOwnerUser?.fcmToken) {
      const notificationPayload = {
        token: agencyOwnerUser?.fcmToken,
        notification: {
          title: "🔒 Payout Request In Progress",
          body: "We've received your request and it's securely under review.",
        },
        data: { type: "PAYOUT_REQUEST" },
      };

      const adminApp = await admin;
      adminApp
        .messaging()
        .send(notificationPayload)
        .then((response) => console.log("FCM sent:", response))
        .catch((error) => console.error("FCM error:", error));
    }
  } catch (err) {
    console.error("requestAgencyPayout error:", err);
    return res.status(500).json({ status: false, message: "Server error. Please try again later." });
  }
};

//get payout requests
exports.getAgencyWisePayoutRequests = async (req, res) => {
  try {
    const { status, person, agencyId, startDate = "All", endDate = "All" } = req.query;

    if (!status || !person) {
      return res.status(200).json({ status: false, message: "Missing required query parameters." });
    }

    if (!agencyId || !mongoose.Types.ObjectId.isValid(agencyId)) {
      return res.status(200).json({ status: false, message: "Invalid or missing agencyId." });
    }

    const objectId = new mongoose.Types.ObjectId(agencyId);
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

    let personQuery = {};
    if (parseInt(person) === 1) {
      personQuery.agencyId = objectId;
      personQuery.person = 1;
    } else if (parseInt(person) === 2) {
      const hostUserIds = await User.distinct("_id", { agencyId: objectId });
      personQuery.userId = { $in: hostUserIds };
      personQuery.person = 2;
    }

    const finalQuery = { ...personQuery, ...statusQuery, ...dateFilterQuery };

    const result = await PayoutRequest.aggregate([
      { $match: finalQuery },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          data: [
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
          total: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] },
          data: "$data",
        },
      },
    ]);

    const totalRecords = result[0]?.total || 0;
    const records = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Agency-wise payout requests retrieved successfully.",
      total: totalRecords,
      data: records.length > 0 ? records : [],
    });
  } catch (error) {
    console.error("Error in getAgencyWisePayoutRequests:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//manage host's payout request
exports.modifyWithdrawalStatus = async (req, res) => {
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

    if (request.status === 2) {
      return res.status(200).json({ status: false, message: "Request already approved." });
    }

    if (request.status === 3) {
      return res.status(200).json({ status: false, message: "Request already declined." });
    }

    let userData = null;
    let fcmReceiver = null;

    if (request.person === 2 && request.userId) {
      userData = await User.findById(request.userId).select("isBlock isPushNotificationEnabled fcmToken").lean();
      fcmReceiver = userData;
    }

    if (!userData) {
      return res.status(200).json({ status: false, message: "Associated user not found." });
    }

    if (fcmReceiver?.isBlock) {
      return res.status(200).json({ status: false, message: "User is blocked by admin." });
    }

    if (actionType === "approve") {
      if (request.person === 2 && request.userId) {
        const user = await User.findById(request.userId).select("coin loginRewardCoins").lean();

        if (!user) {
          return res.status(200).json({ status: false, message: "User not found." });
        }

        const totalCoins = Number(user.coin || 0);
        const loginRewardCoins = Number(user.loginRewardCoins || 0);
        const withdrawableCoins = totalCoins - loginRewardCoins; // only non-login-reward coins can be withdrawn

        if (request.coin > withdrawableCoins) {
          return res.status(200).json({
            status: false,
            message: "Login bonus coins cannot be withdrawn. Only earned coins are eligible for payout.",
          });
        }

        const userUpdate = await User.updateOne(
          { _id: request.userId, coin: { $gt: 0 } },
          {
            $inc: {
              coin: -request.coin,
              withdrawnCoins: request.coin,
              withdrawnAmount: request.amount,
            },
          },
        );

        if (userUpdate.matchedCount === 0) {
          return res.status(200).json({ status: false, message: "Insufficient coin balance." });
        }
      }

      res.status(200).json({
        status: true,
        message: "Withdrawal request approved successfully.",
      });

      await Promise.all([
        PayoutRequest.updateOne(
          { _id: requestId },
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

      if (fcmReceiver.isPushNotificationEnabled && !fcmReceiver.isBlock && fcmReceiver?.fcmToken) {
        const payload = {
          token: fcmReceiver.fcmToken,
          notification: {
            title: "✅ Withdrawal Approved!",
            body: "🎉 Your withdrawal has been approved.",
          },
          data: { type: "WITHDRAWREQUEST" },
        };

        const adminInstance = await admin;
        adminInstance
          .messaging()
          .send(payload)
          .catch((err) => {
            console.error("FCM error:", err.message);
          });
      }
      return;
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

      if (fcmReceiver.isPushNotificationEnabled && !fcmReceiver.isBlock && fcmReceiver?.fcmToken) {
        const payload = {
          token: fcmReceiver.fcmToken,
          notification: {
            title: "❌ Withdrawal Declined",
            body: `⚠️ Your withdrawal was declined. Reason: ${reason}`,
          },
          data: { type: "WITHDRAWREQUEST" },
        };

        const adminInstance = await admin;
        adminInstance
          .messaging()
          .send(payload)
          .catch((err) => {
            console.error("FCM error:", err.message);
          });
      }
      return;
    } else {
      return res.status(200).json({ status: false, message: "Invalid type. Must be 'approve' or 'reject'." });
    }
  } catch (error) {
    console.error("Error in updateWithdrawalStatus:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
