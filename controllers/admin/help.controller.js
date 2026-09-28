const Help = require("../../models/help.model");

const { STATUS_OF_HELP } = require("../../types/constant");

//import model
const User = require("../../models/user.model");

//private key
const admin = require("../../util/privateKey");

const { deleteFile } = require("../../util/deletefile");

//get help statistics (total / pending / solved)
exports.fetchHelpStatistics = async (req, res) => {
  try {
    const result = await Help.aggregate([
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          pending: {
            $sum: {
              $cond: [{ $eq: ["$status", STATUS_OF_HELP.PENDING] }, 1, 0],
            },
          },
          solved: {
            $sum: {
              $cond: [{ $eq: ["$status", STATUS_OF_HELP.SOLVED] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalRequests: 1,
          pending: 1,
          solved: 1,
        },
      },
    ]);

    const data = result[0] || {
      totalRequests: 0,
      pending: 0,
      solved: 0,
    };

    return res.status(200).json({
      status: true,
      message: "Help statistics fetched successfully.",
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get helps
exports.loadHelpContent = async (req, res) => {
  try {
    if (!req.query.status) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details." });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const search = req?.query?.search || "";
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let matchQuery = {
      status: parseInt(req.query.status),
    };

    if (startDate !== "All" && endDate !== "All") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      matchQuery.createdAt = {
        $gte: startDateObj,
        $lte: endDateObj,
      };
    }

    const result = await Help.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [
            { $match: { isBlock: false } },
            {
              $project: {
                name: 1,
                userName: 1,
                image: 1,
                uniqueId: 1,
                isBlock: 1,
              },
            },
          ],
          as: "userId",
        },
      },
      {
        $unwind: { path: "$userId", preserveNullAndEmptyArrays: false },
      },
      ...(search && search.trim() !== ""
        ? [
            {
              $match: {
                $or: [{ "userId.name": { $regex: search, $options: "i" } }, { "userId.userName": { $regex: search, $options: "i" } }, { "userId.uniqueId": { $regex: search, $options: "i" } }],
              },
            },
          ]
        : []),

      {
        $facet: {
          total: [{ $count: "count" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $project: {
                help: 1,
                contact: 1,
                status: 1,
                image: 1,
                date: 1,
                createdAt: 1,
                userId: 1,
              },
            },
          ],
        },
      },
    ]);

    const total = result[0]?.total[0]?.count || 0;
    const data = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "✅ Help requests retrieved successfully!",
      total,
      data,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//help solved
exports.resolveUserHelp = async (req, res) => {
  try {
    const { helpId } = req.query;
    if (!helpId) {
      return res.status(200).json({ status: false, message: "⚠️ helpId is required." });
    }

    const help = await Help.findById(helpId).lean();
    if (!help) {
      return res.status(200).json({ status: false, message: "❌ Help request not found." });
    }

    if (help.status === 2) {
      return res.status(200).json({ status: false, message: "✅ This help request is already resolved by the admin." });
    }

    res.status(200).json({
      status: true,
      message: "🎉 Help request successfully resolved by the admin!",
      data: { ...help, status: 2 },
    });

    const [updatedHelp, user] = await Promise.all([Help.findByIdAndUpdate(helpId, { status: 2 }), User.findById(help.userId).select("isBlock fcmToken isPushNotificationEnabled").lean()]);

    if (user.isPushNotificationEnabled && !user.isBlock && user.fcmToken !== null) {
      const payload = {
        token: user.fcmToken,
        notification: {
          title: "🎯 Help Request Resolved!",
          body: "🚀 Great news! Your help request has been successfully resolved. We're always here for you! 💙",
        },
        data: {
          type: "HELP_RESOLVED",
        },
      };

      try {
        const adminInstance = await admin;
        await adminInstance.messaging().send(payload);
        console.log("📩 Notification sent successfully!");
      } catch (error) {
        console.log("⚠️ Error sending notification:", error);
      }
    }
  } catch (error) {
    console.error("❌ Server Error:", error);
    return res.status(500).json({ status: false, message: error.message || "🚨 Internal Server Error" });
  }
};

//delete help
exports.deleteUserHelp = async (req, res) => {
  try {
    const { helpId } = req.query;
    if (!helpId) {
      return res.status(200).json({ status: false, message: "⚠️ helpId is required." });
    }

    const complaint = await Help.findById(helpId).lean();
    if (!complaint) {
      return res.status(200).json({ status: false, message: "❌ Complaint not found." });
    }

    res.status(200).json({
      status: true,
      message: "✅ Complaint has been successfully deleted by the admin!",
    });

    if (complaint.image) {
      deleteFile(complaint.image);
    }

    const [user, _] = await Promise.all([User.findById(complaint.userId).select("isBlock fcmToken isPushNotificationEnabled").lean(), Help.deleteOne({ _id: helpId })]);

    if (user && user.isPushNotificationEnabled && !user.isBlock && user.fcmToken) {
      const payload = {
        token: user.fcmToken,
        notification: {
          title: "🗑️ Help Request Deleted",
          body: "⚠️ Your help request has been removed by the admin. If you still need assistance, feel free to submit it again.",
        },
        data: {
          type: "HELP_DELETED",
        },
      };

      try {
        const adminInstance = await admin;
        await adminInstance.messaging().send(payload);
        console.log("📩 Delete notification sent successfully!");
      } catch (error) {
        console.log("⚠️ Error sending notification:", error);
      }
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
