const Verification = require("../../models/verification.model");
const User = require("../../models/user.model");

const { VERIFICATION_STATUS } = require("../../types/constant");

//private key
const admin = require("../../util/privateKey");

// Update verification request status (accept / decline)
exports.updateVerificationStatus = async (req, res) => {
  try {
    const { userId, verificationId, action, reason } = req.query; // action = "accept" | "decline"

    if (!verificationId) {
      return res.status(200).json({ status: false, message: "verificationId is required!" });
    }

    if (!["accept", "decline"].includes(action)) {
      return res.status(200).json({ status: false, message: "action must be 'accept' or 'decline'." });
    }

    if (action === "decline" && !reason) {
      return res.status(200).json({ status: false, message: "reason must be provided when declining." });
    }

    const [verification, user] = await Promise.all([Verification.findById(verificationId).lean(), User.findById(userId).select("_id fcmToken isBlock isPushNotificationEnabled isVerified").lean()]);

    if (!verification) {
      return res.status(200).json({ status: false, message: "Verification request not found." });
    }

    if (verification.status === 2) {
      return res.status(200).json({ status: false, message: "Verification request already accepted." });
    }

    if (verification.status === 3) {
      return res.status(200).json({ status: false, message: "Verification request already declined." });
    }

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found for this verification request." });
    }

    if (user.isVerified && action === "accept") {
      return res.status(200).json({
        status: false,
        message: "User is already verified. Cannot accept again.",
      });
    }

    let updateData = {
      reviewedAt: new Date(),
    };

    let notificationPayload = null;

    if (action === "accept") {
      updateData.status = 2;
      updateData.reviewerRemarks = "Accepted";

      await User.updateOne({ _id: user._id }, { $set: { isVerified: true } });

      notificationPayload = {
        title: "✅ Verification Request Accepted! ✅",
        body: "Congratulations! Your verification request has been accepted. Thank you for verifying your account.",
      };
    } else {
      updateData.status = 3;
      updateData.reviewerRemarks = reason?.trim();

      notificationPayload = {
        title: "❌ Verification Request Declined! ❌",
        body: "We're sorry, but your verification request has been declined. Please contact support for more information.",
      };
    }

    const updatedVerification = await Verification.findByIdAndUpdate(verificationId, { $set: updateData }, { new: true }).lean();

    res.status(200).json({
      status: true,
      message: `Verification request has been ${action}ed successfully.`,
      data: updatedVerification,
    });

    if (user.isPushNotificationEnabled && !user.isBlock && user.fcmToken) {
      const payload = {
        token: user.fcmToken,
        notification: notificationPayload,
        data: { type: "VERIFICATIONREQUEST" },
      };

      const adminClient = await admin;
      adminClient
        .messaging()
        .send(payload)
        .then((response) => console.log("✅ FCM sent:", response))
        .catch((err) => console.error("❌ FCM error:", err));
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Get verification statistics (total / pending / approved / rejected)
exports.fetchVerificationStatistics = async (req, res) => {
  try {
    const result = await Verification.aggregate([
      {
        $group: {
          _id: null,
          totalApplications: { $sum: 1 },
          pending: {
            $sum: {
              $cond: [{ $eq: ["$status", VERIFICATION_STATUS.PENDING] }, 1, 0],
            },
          },
          approved: {
            $sum: {
              $cond: [{ $eq: ["$status", VERIFICATION_STATUS.ACCEPTED] }, 1, 0],
            },
          },
          rejected: {
            $sum: {
              $cond: [{ $eq: ["$status", VERIFICATION_STATUS.DECLINED] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalApplications: 1,
          pending: 1,
          approved: 1,
          rejected: 1,
        },
      },
    ]);

    const data = result[0] || {
      totalApplications: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    };

    return res.status(200).json({
      status: true,
      message: "Verification statistics fetched successfully.",
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

// Get verification
exports.getVerifications = async (req, res) => {
  try {
    const type = req.query.type ? parseInt(req.query.type) : null;

    if (!type || ![1, 2, 3].includes(type)) {
      return res.status(200).json({ status: false, message: "Invalid or missing 'type' parameter." });
    }

    const search = req.query.search?.trim() || "";
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const matchStage = { status: type };

    const searchStage = search
      ? {
          $or: [
            { "user.name": { $regex: search, $options: "i" } },
            { "user.userName": { $regex: search, $options: "i" } },
            { "user.uniqueId": { $regex: search, $options: "i" } },
            { "user.country": { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const result = await Verification.aggregate([
      { $match: matchStage },

      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
          pipeline: [
            {
              $project: {
                name: 1,
                userName: 1,
                uniqueId: 1,
                image: 1,
                bio: 1,
                age: 1,
                gender: 1,
                email: 1,
                mobileNumber: 1,
                countryFlagImage: 1,
                country: 1,
                role: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      ...(search ? [{ $match: searchStage }] : []),
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
      message: `All verification requests with status ${type} retrieved successfully.`,
      total,
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
