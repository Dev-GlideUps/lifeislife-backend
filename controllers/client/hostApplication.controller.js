const HostApplication = require("../../models/hostApplication.model");

//import model
const User = require("../../models/user.model");
const Agency = require("../../models/agency.model");

//private key
const admin = require("../../util/privateKey");

//mongoose
const mongoose = require("mongoose");

//validate either agency code or user unique ID
exports.validateAgencyOrUser = async (req, res) => {
  try {
    const { agencyCode, uniqueId } = req.query || {};

    if (!agencyCode && !uniqueId) {
      return res.status(200).json({ status: false, message: "Agency code or unique ID is required." });
    }

    if (agencyCode) {
      const agencyExists = await Agency.exists({ agencyCode: agencyCode });

      if (agencyExists) {
        return res.status(200).json({
          status: true,
          message: "Valid agency code.",
          isValid: true,
        });
      } else {
        return res.status(200).json({
          status: false,
          message: "Invalid agency code.",
          isValid: false,
        });
      }
    }

    if (uniqueId) {
      const userExists = await User.exists({ uniqueId: uniqueId });

      if (userExists) {
        return res.status(200).json({
          status: true,
          message: "Valid unique ID.",
          isValid: true,
        });
      } else {
        return res.status(200).json({
          status: false,
          message: "Invalid unique ID.",
          isValid: false,
        });
      }
    }
  } catch (error) {
    console.error("Error validating identifier:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};

//submit host application
exports.applyHostApplication = async (req, res) => {
  try {
    const { uniqueId, agencyCode } = req.query;

    if (!uniqueId || !agencyCode) {
      return res.status(200).json({ status: false, message: "Both uniqueId and agencyCode are required." });
    }

    const [user, agency] = await Promise.all([
      User.findOne({ uniqueId }).select("_id fcmToken isBlock isPushNotificationEnabled role isHostBlocked").lean(),
      Agency.findOne({ agencyCode }).select("_id userId").lean(),
    ]);

    if (!agency) {
      return res.status(200).json({ status: false, message: "Agency not found." });
    }

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (Array.isArray(user.role) && user.role.includes(2)) {
      return res.status(200).json({ status: false, message: "User is already a host and cannot reapply." });
    }

    if (user.role.some((role) => [2, 3, 4].includes(role))) {
      return res.status(200).json({
        status: false,
        message: "User already holds a special role and is not eligible to become a host.",
      });
    }

    if (user.isHostBlocked) {
      return res.status(200).json({
        status: false,
        message: "This user is currently inactive as a host and cannot be assigned the Host role.",
      });
    }

    const [existingPending, existingDeclined] = await Promise.all([
      HostApplication.findOne({
        userId: user._id,
        // agencyId: agency._id,
        status: 1,
      }),
      HostApplication.findOne({
        userId: user._id,
        // agencyId: agency._id,
        status: 3,
      }),
    ]);

    if (existingPending) {
      return res.status(200).json({
        status: false,
        message: "A pending host application already exists.",
      });
    }

    if (existingDeclined) {
      await HostApplication.deleteOne({ _id: existingDeclined._id });
    }

    res.status(200).json({
      status: true,
      message: "Host application submitted successfully.",
    });

    await HostApplication.create({
      userId: user._id,
      agencyId: agency._id,
      status: 1,
      appliedAt: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    });

    if (user.isPushNotificationEnabled && !user.isBlock && user.fcmToken) {
      const notificationPayload = {
        token: user.fcmToken,
        notification: {
          title: "✨ Host Application Received",
          body: "✅ Thank you for applying to become a host! Our team is reviewing your application and will update you soon.",
        },
        data: {
          type: "HOST_APPLICATION",
        },
      };

      const adminApp = await admin;
      adminApp
        .messaging()
        .send(notificationPayload)
        .then((response) => console.log("FCM sent:", response))
        .catch((error) => console.error("FCM error:", error));
    }

    const agencyUser = await User.findById(agency.userId).select("fcmToken isBlock isPushNotificationEnabled").lean();
    if (agencyUser?.isPushNotificationEnabled && !agencyUser?.isBlock && agencyUser?.fcmToken) {
      const payload = {
        token: agencyUser.fcmToken,
        notification: {
          title: "📩 New Host Application",
          body: "A new user has applied to join your agency as a host.",
        },
        data: {
          type: "NEW_HOST_APPLICATION",
          userId: agency.userId.toString(),
        },
      };

      try {
        const adminInstance = await admin;
        await adminInstance.messaging().send(payload);
        console.log("Agency notification sent.");
      } catch (err) {
        console.error("Agency FCM error:", err.message);
      }
    }
  } catch (error) {
    console.error("Host Application Error:", error);
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get host's request status
exports.checkHostApplicationStatus = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const application = await HostApplication.findOne({ userId: userId }).select("status").lean();
    if (!application) {
      return res.status(200).json({ status: false, message: "Application not found for this user!" });
    }

    return res.status(200).json({
      status: true,
      message: "Application status retrieved successfully",
      data: application.status || 1,
    });
  } catch (error) {
    console.error("Error fetching request status:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
