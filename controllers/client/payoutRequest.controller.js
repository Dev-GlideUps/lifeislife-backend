const PayoutRequest = require("../../models/payoutRequest.model");

//import model
const User = require("../../models/user.model");
const History = require("../../models/history.model");

//mongoose
const mongoose = require("mongoose");

//private key
const admin = require("../../util/privateKey");

//generateHistoryUniqueId
const generateHistoryUniqueId = require("../../util/generateHistoryUniqueId");

//submit payout request
exports.submitPayoutRequest = async (req, res) => {
  try {
    if (!settingJSON) {
      return res.status(200).json({ status: false, message: "Withdrawal settings not configured." });
    }

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const { paymentGateway, paymentDetails, coin } = req.body || {};

    if (!paymentGateway || !paymentDetails || !coin) {
      return res.status(200).json({ status: false, message: "All required fields must be provided." });
    }

    const objectId = new mongoose.Types.ObjectId(req.user.userId);
    const formattedGateway = paymentGateway.trim();
    const requestedCoins = Number(coin);
    // Use silverToCashOutRate for silver to money conversion
    const silverRate = settingJSON.silverToCashOutRate || settingJSON.minCoinsToCashOut || 1000;
    const requestAmount = parseFloat(requestedCoins / silverRate).toFixed(2);

    if (isNaN(requestedCoins) || requestedCoins <= 0) {
      return res.status(200).json({ status: false, message: "Please enter a valid coin amount." });
    }

    const [user, uniqueId] = await Promise.all([
      User.findOne({ _id: objectId }).select("_id silverCoin role fcmToken isPushNotificationEnabled").lean(),
      generateHistoryUniqueId(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "Account not found." });
    }

    let person;
    if (user.role.includes(2)) {
      person = 2;
    } else if (user.role.includes(1)) {
      person = 3;
    } else {
      return res.status(200).json({ status: false, message: "Invalid user role." });
    }

    // Withdraw from silverCoin (earnings) only
    const silverBalance = Number(user.silverCoin || 0);

    if (requestedCoins > silverBalance) {
      console.log("Insufficient silver balance.");
      return res.status(200).json({ status: false, message: "Insufficient silver balance." });
    }

    const minSilverPayout = settingJSON.minSilverForPayout || settingJSON.minCoinsForPayout || 0;
    if (requestedCoins < minSilverPayout) {
      return res.status(200).json({ status: false, message: `Minimum withdrawal is ${minSilverPayout} silver coins.` });
    }

    let pendingFilter = { person, status: 1, userId: objectId };
    let declinedFilter = { person, status: 3, userId: objectId };

    const [pendingRequest, declinedRequest] = await Promise.all([PayoutRequest.findOne(pendingFilter).select("_id").lean(), PayoutRequest.findOne(declinedFilter).select("_id").lean()]);

    if (pendingRequest) {
      return res.status(200).json({
        status: false,
        message: "You already have a pending payout request under review.",
      });
    }

    const payoutData = {
      uniqueId,
      person,
      coin: requestedCoins,
      amount: requestAmount,
      paymentGateway: formattedGateway,
      paymentDetails: typeof paymentDetails === "object" ? paymentDetails : { value: String(paymentDetails) },
      requestDate: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      userId: objectId,
    };

    const historyData = {
      uniqueId,
      userId: objectId,
      coin: requestedCoins,
      paymentGateway: formattedGateway,
      payoutStatus: 1,
      type: 8,
      date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    };

    if (declinedRequest) {
      res.status(200).json({
        status: true,
        message: "Declined request removed. New payout request submitted successfully.",
      });

      await PayoutRequest.deleteOne({ _id: declinedRequest._id });
      await Promise.all([PayoutRequest.create(payoutData), History.create(historyData)]);
    } else {
      res.status(200).json({
        status: true,
        message: "Your payout request has been submitted successfully.",
      });

      await Promise.all([PayoutRequest.create(payoutData), History.create(historyData)]);
    }

    if (user?.fcmToken && user?.isPushNotificationEnabled) {
      const notificationPayload = {
        token: user.fcmToken,
        notification: {
          title: "🔔 Payout Request Submitted",
          body: "Your payout request is under review. You'll be notified shortly.",
        },
        data: {
          type: "PAYOUT_REQUEST",
        },
      };

      const adminApp = await admin;
      adminApp
        .messaging()
        .send(notificationPayload)
        .then((response) => console.log("FCM sent:", response))
        .catch((error) => console.error("FCM error:", error));
    }
  } catch (err) {
    console.error("submitPayoutRequest error:", err);
    return res.status(500).json({ status: false, message: "Server error. Please try again later." });
  }
};

//retrieve all payout requests for a user
exports.retrieveUserPayouts = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized request. User identity missing." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    let dateFilter = {};
    if (startDate !== "All" && endDate !== "All") {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      dateFilter.createdAt = { $gte: start, $lte: end };
    }

    const requests = await PayoutRequest.find({
      ...dateFilter,
      userId,
      person: { $in: [2, 3] },
    })
      .select("uniqueId status coin amount paymentGateway paymentDetails reason requestDate acceptOrDeclineDate createdAt")
      .sort({ createdAt: -1 })
      .skip((start - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      status: true,
      message: "Payout history retrieved successfully.",
      payoutRequests: requests,
    });
  } catch (error) {
    console.error("retrieveUserPayouts error:", error);
    return res.status(500).json({ status: false, message: "Unable to retrieve payout history. Please try again later." });
  }
};
