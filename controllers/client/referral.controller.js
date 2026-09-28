//mongoose
const mongoose = require("mongoose");

//import model
const User = require("../../models/user.model");
const Referral = require("../../models/referral.model");
const ReferralSystem = require("../../models/referralSystem.model");
const History = require("../../models/history.model");

//generateHistoryUniqueId
const generateHistoryUniqueId = require("../../util/generateHistoryUniqueId");

//private key
const admin = require("../../util/privateKey");

//apply referral code
exports.submitReferralCode = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const { referralCode } = req.query;

    if (!referralCode) {
      return res.status(200).json({ status: false, message: "Invalid input details." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const [uniqueId, user, referralCodeUser, referralSettings] = await Promise.all([
      generateHistoryUniqueId(),
      User.findById(userId).select("_id referralCode isBlock").lean(),
      User.findOne({ referralCode: referralCode.trim() }).select("_id referralCode isBlock isPushNotificationEnabled fcmToken").lean(),
      ReferralSystem.find({ isActive: true }).sort({ targetReferrals: 1 }).lean(),
    ]);

    if (!referralCodeUser) {
      return res.status(200).json({
        status: false,
        message: "Invalid referral code. The referred user does not exist.",
      });
    }

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found!" });
    }

    if (user.isBlock) {
      return res.status(200).json({ status: false, message: "Your account has been blocked by the administrator." });
    }

    if (user.referralCode === referralCode.trim()) {
      return res.status(200).json({ status: false, message: "You cannot use your own referral code." });
    }

    if (!referralSettings.length) {
      return res.status(200).json({ status: false, message: "Referral system is not active at the moment." });
    }

    let referralData = await Referral.findOne({
      referralCodeUser: referralCodeUser._id,
    }).lean();

    if (referralData) {
      // Check if the user is already referred
      if (referralData.referees.some((ref) => ref.userId.toString() === user._id.toString())) {
        return res.status(200).json({ status: false, message: "You have already been referred." });
      }
    }

    if (!referralData) {
      referralData = {
        referralCodeUser: referralCodeUser._id,
        referees: [],
        totalReferrals: 0,
        earnedCoins: 0,
      };
    }

    referralData.referees.push({
      userId: user._id,
      date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    });
    referralData.totalReferrals += 1;

    let earnedCoins = 0;
    let nextTarget = null;

    for (const setting of referralSettings) {
      if (referralData.totalReferrals === setting.targetReferrals) {
        earnedCoins = setting.rewardCoins;
        break;
      } else if (referralData.totalReferrals < setting.targetReferrals) {
        nextTarget = setting.targetReferrals;
        break;
      }
    }

    await Promise.all([
      Referral.findOneAndUpdate(
        { referralCodeUser: referralCodeUser._id },
        {
          $set: { earnedCoins: referralData.earnedCoins + earnedCoins },
          $addToSet: {
            referees: {
              userId: user._id,
              date: new Date().toLocaleString("en-US", {
                timeZone: "Asia/Kolkata",
              }),
            },
          },
          $inc: { totalReferrals: 1 },
        },
        { upsert: true, new: true },
      ),
    ]);

    if (earnedCoins > 0) {
      res.status(200).json({
        status: true,
        message: `Referral bonus of ${earnedCoins} coins applied successfully!`,
      });

      await Promise.all([
        User.findByIdAndUpdate(
          referralCodeUser._id,
          {
            $inc: {
              coin: earnedCoins,
              receivedCoins: earnedCoins,
            },
          },
          { new: true },
        ).lean(),
        History.create({
          uniqueId: uniqueId,
          type: 10,
          otherUserId: referralCodeUser._id,
          coin: earnedCoins,
          date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        }),
      ]);

      if (!referralCodeUser.isBlock && referralCodeUser.isPushNotificationEnabled && referralCodeUser.fcmToken) {
        const payload = {
          token: referralCodeUser.fcmToken,
          notification: {
            title: "🎉 New Referral Bonus Earned! 💰",
            body: `💎 Congrats! You've earned ${earnedCoins} coins for referring a new user. Keep inviting and keep earning! 🚀✨`,
          },
          data: { type: "REFERRAL_REWARD" },
        };

        try {
          const adminPromise = await admin;
          adminPromise.messaging().send(payload);
          console.log("Successfully sent notification.");
        } catch (error) {
          console.log("Error sending notification: ", error);
        }
      }
    } else {
      return res.status(200).json({
        status: true,
        message: nextTarget ? `Referral recorded, but reward is given at ${nextTarget} referrals.` : "Referral recorded, but no further rewards available.",
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get user's referral history
exports.fetchReferralHistory = async (req, res) => {
  try {
    if (!req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const page = Math.max(parseInt(req.query.start) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const [user, referralHistory] = await Promise.all([
      User.findOne({ _id: userId }),
      Referral.findOne({ referralCodeUser: userId })
        .select("referees createdAt")
        .populate({
          path: "referees.userId",
          select: "name userName image isProfilePicBanned uniqueId activeAvtarFrame isVerified",
          populate: {
            path: "activeAvtarFrame",
            select: "type image",
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User does not found." });
    }

    return res.status(200).json({
      status: true,
      message: "Referral history retrieved successfully.",
      data: referralHistory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
