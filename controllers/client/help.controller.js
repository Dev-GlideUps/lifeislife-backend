const Help = require("../../models/help.model");

//import model
const User = require("../../models/user.model");

//private key
const admin = require("../../util/privateKey");

const mongoose = require("mongoose");

//submit help
exports.submitUserHelp = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "⛔ Unauthorized access. Invalid token." });
    }

    const { help, contact } = req.body || {};
    if (!help || !contact) {
      return res.status(200).json({ status: false, message: "⚠️ Oops! Please provide valid help details." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const [user, existingHelpRequest] = await Promise.all([
      User.findOne({ _id: userId, isBlock: false }).select("_id fcmToken isBlock isPushNotificationEnabled").lean(),
      Help.findOne({ userId, status: 1 }).select("_id").lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "❌ User not found." });
    }

    if (existingHelpRequest) {
      return res.status(200).json({
        status: false,
        message: "⚠️ You have already submitted a help request. Please wait for a response.",
      });
    }

    res.status(200).json({
      status: true,
      message: "✅ Thank you for reaching out! Your help request has been submitted successfully.",
    });

    await Help.create({
      userId: user._id,
      help: help,
      contact: contact,
      image: req.file ? req.file.path : "",
      date: new Date().toLocaleString(),
    });

    if (user.isPushNotificationEnabled && !user.isBlock && user.fcmToken !== null) {
      const payload = {
        token: user.fcmToken,
        notification: {
          title: "📩 Help Request Submitted!",
          body: "🙏 We've received your request. Our team will get back to you soon. Thank you for your patience! 💙",
        },
        data: {
          type: "HELP_SUBMITTED",
        },
      };

      try {
        const adminInstance = await admin;
        await adminInstance.messaging().send(payload);
        console.log("🔔 Notification sent successfully!");
      } catch (error) {
        console.error("⚠️ Error sending notification:", error);
      }
    }
  } catch (error) {
    console.error("❌ Server Error:", error);
    return res.status(500).json({ status: false, message: error.message || "🚨 Internal Server Error." });
  }
};

//get helps
exports.fetchHelpData = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "⛔ Unauthorized access. Invalid token." });
    }

    if (!req.query.status) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      dateFilterQuery = {
        createdAt: {
          $gte: startDateObj,
          $lte: endDateObj,
        },
      };
    }

    let statusQuery = {};
    if (req.query.status !== "All") {
      statusQuery.status = parseInt(req.query.status);
    }

    const helps = await Help.find({ userId, ...statusQuery, ...dateFilterQuery })
      .sort({ createdAt: -1 })
      .skip((start - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({
      status: true,
      message: "Help requests retrieved successfully!",
      data: helps.length > 0 ? helps : [],
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
