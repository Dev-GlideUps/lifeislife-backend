const HostApplication = require("../../models/hostApplication.model");

//import model
const User = require("../../models/user.model");
const Agency = require("../../models/agency.model");

//mongoose
const mongoose = require("mongoose");

//private key
const admin = require("../../util/privateKey");

//get agency's host applications
exports.listHostApplications = async (req, res) => {
  try {
    if (!req.query.status || !req.query.agencyId) {
      return res.status(200).json({ status: false, message: "status and agencyId parameter is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.agencyId)) {
      return res.status(200).json({ status: false, message: "Invalid agencyId. Please provide a valid ObjectId." });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const agencyId = new mongoose.Types.ObjectId(req.query.agencyId);

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      dateFilterQuery.createdAt = {
        $gte: startDateObj,
        $lte: endDateObj,
      };
    }

    const filter = {
      status: parseInt(req.query.status),
      agencyId: agencyId,
      ...dateFilterQuery,
    };

    const [agency, result] = await Promise.all([
      Agency.findOne({ _id: agencyId }).select("_id isActive").lean(),
      HostApplication.aggregate([
        { $match: filter },
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
                        countryFlagImage: 1,
                        country: 1,
                      },
                    },
                  ],
                  as: "userId",
                },
              },
              {
                $unwind: { path: "$userId", preserveNullAndEmptyArrays: false },
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
      ]),
    ]);

    if (!agency) {
      return res.status(200).json({ status: false, message: "Agency not found." });
    }

    if (!agency.isActive) {
      return res.status(200).json({ status: false, message: "Agency is currently inactive." });
    }

    const total = result[0]?.total || 0;
    const applications = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Host applications fetched successfully.",
      total,
      data: applications,
    });
  } catch (error) {
    console.error("Error fetching host applications:", error);
    return res.status(500).json({ status: false, message: "An error occurred while fetching host applications.", error: error.message || "Internal Server Error" });
  }
};

//accept or decline agency's host application
exports.manageHostRequest = async (req, res) => {
  try {
    if (!settingJSON) {
      return res.status(200).json({ status: false, message: "App settings not found." });
    }

    const { agencyId, requestId, userId, status, reason } = req.query;

    if (!requestId || !userId || !status) {
      return res.status(200).json({ status: false, message: "Missing required parameters." });
    }

    const agencyObjectId = new mongoose.Types.ObjectId(agencyId);
    const requestObjectId = new mongoose.Types.ObjectId(requestId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const statusNumber = Number(status);

    const [agency, request, user] = await Promise.all([
      Agency.findOne({ _id: agencyObjectId }).select("_id isActive userId").lean(),
      HostApplication.findOne({ _id: requestObjectId, agencyId: agencyObjectId }).select("_id status reason reviewedAt").lean(),
      User.findOne({ _id: userObjectId }).select("role agencyId fcmToken isBlock isPushNotificationEnabled").lean(),
    ]);

    if (!agency) {
      return res.status(200).json({ status: false, message: "Agency not found." });
    }

    if (!agency.isActive) {
      return res.status(200).json({ status: false, message: "Agency is currently inactive." });
    }

    if (!request) {
      return res.status(200).json({ status: false, message: "Host request does not exist." });
    }

    if (request.status === 2) {
      return res.status(200).json({ status: false, message: "This host request is already approved." });
    }

    if (request.status === 3) {
      return res.status(200).json({ status: false, message: "This host request has already been rejected." });
    }

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user.role.includes(2) && user.agencyId !== null) {
      return res.status(200).json({ status: false, message: "This user is already assigned the Host role." });
    }

    if (user.role.some((role) => [2, 3, 4].includes(role))) {
      return res.status(200).json({
        status: false,
        message: "User already holds a special role and is not eligible to become a host.",
      });
    }

    if (statusNumber === 2) {
      // Accept request
      res.status(200).json({
        status: true,
        message: "Host request approved successfully.",
      });

      await Promise.all([
        HostApplication.updateOne(
          {
            _id: requestObjectId,
          },
          {
            $set: {
              status: 2,
              reviewedAt: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
            },
          },
        ),
        User.updateOne(
          { _id: userObjectId },
          {
            $addToSet: { role: 2 },
            $set: { agencyId: agencyId },
          },
        ),
      ]);

      if (user.isPushNotificationEnabled && !user.isBlock && user.fcmToken) {
        const payload = {
          token: user.fcmToken,
          notification: {
            title: "🎉 You're Now a Verified Host!",
            body: "Your host application has been approved. Go live now!",
          },
          data: {
            type: "HOST_REQUEST_APPROVED",
          },
        };

        try {
          const adminInstance = await admin;
          await adminInstance.messaging().send(payload);
          console.log("Approval notification sent.");
        } catch (err) {
          console.error("FCM error:", err.message);
        }
      }

      // const agencyUser = await User.findById(agency.userId).select("fcmToken isBlock isPushNotificationEnabled").lean();
      // if (agencyUser?.isPushNotificationEnabled && !agencyUser?.isBlock && agencyUser?.fcmToken) {
      //   const payload = {
      //     token: agencyUser.fcmToken,
      //     notification: {
      //       title: "Host Request Approved",
      //       body: "A host application has been approved under your agency.",
      //     },
      //     data: {
      //       type: "HOST_REQUEST_APPROVED",
      //       userId: agency.userId.toString(),
      //     },
      //   };

      //   try {
      //     const adminInstance = await admin;
      //     await adminInstance.messaging().send(payload);
      //   } catch (err) {
      //     console.error("Agency FCM error:", err.message);
      //   }
      // }
    } else if (statusNumber === 3) {
      // Reject request
      if (!reason || reason.trim() === "") {
        return res.status(200).json({ status: false, message: "Rejection reason is required." });
      }

      res.status(200).json({
        status: true,
        message: "Host request rejected successfully.",
      });

      await HostApplication.updateOne(
        { _id: requestObjectId },
        {
          $set: {
            status: 3,
            reason: reason.trim(),
            reviewedAt: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
          },
        },
      );

      if (user.isPushNotificationEnabled && !user.isBlock && user.fcmToken) {
        const payload = {
          token: user.fcmToken,
          notification: {
            title: "❌ Host Request Rejected",
            body: "Sorry, your request was declined. Please contact support if needed.",
          },
          data: {
            type: "HOST_REQUEST_REJECTED",
          },
        };

        try {
          const adminInstance = await admin;
          await adminInstance.messaging().send(payload);
          console.log("Rejection notification sent.");
        } catch (err) {
          console.error("FCM error:", err.message);
        }
      }

      // const agencyUser = await User.findById(agency.userId).select("fcmToken isBlock isPushNotificationEnabled").lean();
      // if (agencyUser?.isPushNotificationEnabled && !agencyUser?.isBlock && agencyUser?.fcmToken) {
      //   const payload = {
      //     token: agencyUser.fcmToken,
      //     notification: {
      //       title: "Host Request Rejected",
      //       body: "A host application has been rejected under your agency.",
      //     },
      //     data: {
      //       type: "HOST_REQUEST_REJECTED",
      //       userId: agency.userId.toString(),
      //     },
      //   };

      //   try {
      //     const adminInstance = await admin;
      //     await adminInstance.messaging().send(payload);
      //   } catch (err) {
      //     console.error("Agency FCM error:", err.message);
      //   }
      // }
    } else {
      return res.status(200).json({ status: false, message: "Invalid status value. Use 2 (accept) or 3 (reject)." });
    }
  } catch (err) {
    console.error("manageHostRequest error:", err);
    return res.status(500).json({ status: false, message: "Server error occurred.", error: err.message });
  }
};
