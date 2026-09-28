const Notification = require("../../models/notification.model");

//import model
const User = require("../../models/user.model");
const Agency = require("../../models/agency.model");
const CoinTrader = require("../../models/cointrader.model");

const { deleteFile } = require("../../util/deletefile");

//private key
const admin = require("../../util/privateKey");

// Send Notification to Users by Role
exports.sendNotifications = async (req, res) => {
  try {
    let { notificationType, title, message } = req.body || {};

    if (!notificationType?.trim()) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "notificationType is required!" });
    }

    if (!title?.trim() || !message?.trim()) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Notification title and message are required!" });
    }

    notificationType = notificationType.trim().toLowerCase();
    const image = req.file ? req.file.path : "";
    const date = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

    let userQuery = {
      isBlock: false,
      isPushNotificationEnabled: true,
    };

    if (notificationType === "user") {
      userQuery.role = 1;
    } else if (notificationType === "host") {
      userQuery.role = 2;
    } else if (notificationType === "agency") {
      const agencies = await Agency.find({ isActive: true, userId: { $ne: null } }, "userId").lean();

      const agencyUserIds = agencies.map((a) => a.userId);
      if (!agencyUserIds.length) {
        if (req.file) deleteFile(req.file);
        return res.status(200).json({
          status: false,
          message: "No active agency users found to notify.",
        });
      }

      userQuery._id = { $in: agencyUserIds };
    } else if (notificationType === "cointrader") {
      const traders = await CoinTrader.find({ isActive: true, userId: { $ne: null } }, "userId").lean();

      const traderUserIds = traders.map((t) => t.userId);
      if (!traderUserIds.length) {
        if (req.file) deleteFile(req.file);
        return res.status(200).json({
          status: false,
          message: "No active coin traders found to notify.",
        });
      }

      userQuery._id = { $in: traderUserIds };
    } else if (notificationType === "all") {
      // No extra filter needed — base query handles all users
    } else {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({
        status: false,
        message: "Invalid notificationType!",
      });
    }

    const users = await User.find(
      {
        ...userQuery,
        fcmToken: { $ne: null },
      },
      "_id fcmToken",
    ).lean();

    if (!users.length) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({
        status: false,
        message: "No recipients available to receive notifications.",
      });
    }

    res.status(200).json({
      status: true,
      message: "Notifications sent successfully.",
    });

    // const notifications = users.map((user) => ({
    //   userId: user._id,
    //   title,
    //   message,
    //   image,
    //   date,
    // }));

    // await Notification.insertMany(notifications);

    const tokens = users.map((user) => user.fcmToken).filter((token) => typeof token === "string" && token.trim());

    if (tokens.length) {
      const adminInstance = await admin;
      const chunkSize = 500;

      const batches = [];
      for (let i = 0; i < tokens.length; i += chunkSize) {
        batches.push(
          adminInstance.messaging().sendEachForMulticast({
            tokens: tokens.slice(i, i + chunkSize),
            notification: {
              title,
              body: message,
              image: image || "",
            },
          }),
        );
      }

      const results = await Promise.all(batches);

      let totalSuccess = 0;
      let totalFailure = 0;

      results.forEach((batchResult, batchIndex) => {
        totalSuccess += batchResult.successCount;
        totalFailure += batchResult.failureCount;

        batchResult.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error("FCM TOKEN FAILED:", {
              batch: batchIndex,
              error: resp.error?.message,
            });
          }
        });
      });

      console.log("BULK FCM SUMMARY:", {
        totalTokens: tokens.length,
        totalSuccess,
        totalFailure,
      });
    } else {
      if (req.file) deleteFile(req.file);
      console.warn("No valid FCM tokens to send.");
    }
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error("sendNotifications error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

// Send Notification to a Single Role
exports.sendSingleNotification = async (req, res) => {
  try {
    let { notificationType, userId, title, message } = req.body || {};

    if (!notificationType?.trim() || !userId) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({
        status: false,
        message: "notificationType and userId are required!",
      });
    }

    if (!title?.trim() || !message?.trim()) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({
        status: false,
        message: "Notification title and message are required!",
      });
    }

    notificationType = notificationType.trim().toLowerCase();
    const image = req.file ? req.file.path : "";
    const date = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

    let isValidTarget = false;

    if (notificationType === "user") {
      const user = await User.findOne({
        _id: userId,
        role: 1,
        isBlock: false,
      }).lean();

      if (user) isValidTarget = true;
    } else if (notificationType === "host") {
      const host = await User.findOne({
        _id: userId,
        role: 2,
        isBlock: false,
      }).lean();

      if (host) isValidTarget = true;
    } else if (notificationType === "agency") {
      const agency = await Agency.findOne({
        userId,
        isActive: true,
      }).lean();

      if (agency) isValidTarget = true;
    } else if (notificationType === "cointrader") {
      const trader = await CoinTrader.findOne({
        userId,
        isActive: true,
      }).lean();

      if (trader) isValidTarget = true;
    } else {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({
        status: false,
        message: "Invalid notificationType!",
      });
    }

    if (!isValidTarget) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({
        status: false,
        message: "Target entity not found or inactive.",
      });
    }

    const user = await User.findOne(
      {
        _id: userId,
        isBlock: false,
        isPushNotificationEnabled: true,
        fcmToken: { $ne: null },
      },
      "_id fcmToken",
    ).lean();

    if (!user) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({
        status: true,
        message: "User found but push notification not enabled or no FCM token.",
      });
    }

    const adminInstance = await admin;
    adminInstance
      .messaging()
      .send({
        token: user.fcmToken,
        notification: {
          title,
          body: message,
          image: image || "",
        },
      })
      .then(async (response) => {
        console.log("📨 Send Notification to a Single Role:", response);

        // await Notification.create({
        //   userId: user._id,
        //   title,
        //   message,
        //   image,
        //   date,
        // });
      })
      .catch((error) => {
        if (req.file) deleteFile(req.file);
        console.error("⚠️ Failed Send Notification to a Single Role:", error);
      });

    return res.status(200).json({
      status: true,
      message: "Notification sent successfully.",
    });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error("sendSingleNotification error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
