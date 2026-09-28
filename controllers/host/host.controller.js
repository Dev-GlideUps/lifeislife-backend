const User = require("../../models/user.model");

//mongoose
const mongoose = require("mongoose");

//moment-timezone
const moment = require("moment-timezone");

//import model
const History = require("../../models/history.model");

//updateHostLevel
const updateHostLevel = require("../../util/updateHostLevel");

//get host's profile
exports.fetchHostProfile = async (req, res) => {
  try {
    const { hostId } = req.query;

    if (!hostId) {
      return res.status(200).json({ status: false, message: "Missing required parameters: hostId." });
    }

    if (!mongoose.Types.ObjectId.isValid(hostId)) {
      return res.status(200).json({ status: false, message: "Invalid hostId." });
    }

    const hostObjectId = new mongoose.Types.ObjectId(hostId);
    const todayStart = moment().tz("Asia/Kolkata").startOf("day").toDate();
    const now = moment().tz("Asia/Kolkata").toDate();
    const weekStart = moment().tz("Asia/Kolkata").startOf("week").toDate();

    const [host] = await Promise.all([
      User.findOne({
        _id: hostObjectId,
        role: { $in: [2] },
        agencyId: { $ne: null },
      })
        .select("name userName image gender countryFlagImage country earnedHostCoins receivedGifts isHostBlocked")
        .populate("agencyId", "agencyCode agencyName image commissionRate isActive")
        .populate("hostLevel")
        .lean(),
    ]);

    if (!host) {
      return res.status(200).json({ status: false, message: "No host found under the specified agency." });
    }

    if (!host?.agencyId?.isActive) {
      return res.status(200).json({ status: false, message: "Host's associated agency is currently inactive." });
    }

    if (host.isHostBlocked) {
      return res.status(200).json({ status: false, message: "Host is currently inactive." });
    }

    const [stats] = await Promise.all([
      History.aggregate([
        {
          $match: {
            hostAgencyId: { $ne: null },
            otherUserId: hostObjectId,
          },
        },
        {
          $group: {
            _id: null,
            todayIncome: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $in: ["$type", [5, 6]] }, { $gte: ["$createdAt", todayStart] }, { $lte: ["$createdAt", now] }],
                  },
                  "$receiverCoin",
                  0,
                ],
              },
            },
            weekIncome: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $in: ["$type", [5, 6]] }, { $gte: ["$createdAt", weekStart] }, { $lte: ["$createdAt", now] }],
                  },
                  "$receiverCoin",
                  0,
                ],
              },
            },
            todayCall: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ["$type", 5] }, { $eq: ["$callConnect", true] }, { $gte: ["$createdAt", todayStart] }, { $lte: ["$createdAt", now] }],
                  },
                  1,
                  0,
                ],
              },
            },
            totalCall: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ["$type", 5] }, { $eq: ["$callConnect", true] }],
                  },
                  1,
                  0,
                ],
              },
            },
            todayReceivedGift: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ["$type", 6] }, { $ne: ["$giftId", null] }, { $gte: ["$createdAt", todayStart] }, { $lte: ["$createdAt", now] }],
                  },
                  "$giftReceivedCount",
                  0,
                ],
              },
            },
            totalReceivedGift: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ["$type", 6] }, { $ne: ["$giftId", null] }],
                  },
                  "$giftReceivedCount",
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    // const levelResult = await updateHostLevel(hostObjectId);
    // if (levelResult.status) {
    //   console.log("Update host level on the fly to ensure it's accurate");
    //   host.hostLevel = levelResult.hostLevel;
    // }

    const stat = stats[0] || {};

    return res.status(200).json({
      status: true,
      message: "Host profile retrieved successfully.",
      data: {
        ...host,
        todayIncome: stat.todayIncome || 0,
        thisWeekIncome: stat.weekIncome || 0,
        todayCall: stat.todayCall || 0,
        totalCall: stat.totalCall || 0,
        todayReceivedGift: stat.todayReceivedGift || 0,
        totalReceivedGift: stat.totalReceivedGift || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching host profile:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};
