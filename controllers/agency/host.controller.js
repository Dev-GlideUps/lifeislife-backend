//import model
const User = require("../../models/user.model");
const Agency = require("../../models/agency.model");
const HostApplication = require("../../models/hostApplication.model");
const WealthLevel = require("../../models/wealthLevel.model");
const FollowerFollowing = require("../../models/followerFollowing.model");

//mongoose
const mongoose = require("mongoose");

//private key
const admin = require("../../util/privateKey");

//validate either an agencyCode or a uniqueId
exports.validateIdentifier = async (req, res) => {
  try {
    const { agencyCode, uniqueId } = req.query;

    if (!agencyCode && !uniqueId) {
      return res.status(200).json({ status: false, message: "Agency code or unique ID is required." });
    }

    if (agencyCode) {
      const agencyExists = await Agency.exists({ agencyCode: agencyCode });

      if (agencyExists) {
        return res.status(200).json({ status: true, message: "Valid agency code.", isValid: true });
      } else {
        return res.status(200).json({ status: false, message: "Invalid agency code.", isValid: false });
      }
    }

    if (uniqueId) {
      const userExists = await User.exists({ uniqueId: uniqueId });

      if (userExists) {
        return res.status(200).json({ status: true, message: "Valid unique ID.", isValid: true });
      } else {
        return res.status(200).json({ status: false, message: "Invalid unique ID.", isValid: false });
      }
    }
  } catch (error) {
    console.error("Error validating identifier:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};

//add host
exports.addHost = async (req, res) => {
  try {
    const { uniqueId, agencyCode } = req.query;

    if (!uniqueId || !agencyCode) {
      return res.status(200).json({ status: false, message: "Both uniqueId and agencyCode are required." });
    }

    const [user, agency] = await Promise.all([
      User.findOne({ uniqueId })
        .select(
          "_id fcmToken role agencyId image name userName uniqueId email gender country countryFlagImage wealthLevel coin earnedHostCoins isBlock isOnline isPushNotificationEnabled isHostBlocked",
        )
        .lean(),
      Agency.findOne({ agencyCode }).select("_id isActive").lean(),
    ]);

    if (!agency) {
      return res.status(200).json({ status: false, message: "Agency not found." });
    }

    if (!agency.isActive) {
      return res.status(200).json({ status: false, message: "The specified agency is currently inactive." });
    }

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (Array.isArray(user.role) && user.role.includes(2) && user.agencyId !== null) {
      return res.status(200).json({ status: false, message: "This user is already assigned the Host role." });
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

    const [wealthLevel, followers, followings, friends, existingPending, existingDeclined] = await Promise.all([
      user.wealthLevel ? WealthLevel.findById(user.wealthLevel).lean() : null,
      FollowerFollowing.find({ toUserId: user._id }).lean(),
      FollowerFollowing.find({ fromUserId: user._id }).lean(),
      FollowerFollowing.find({
        $or: [{ fromUserId: user._id }, { toUserId: user._id }],
      }).lean(),
      HostApplication.findOne({
        userId: user._id,
        // agencyId: agency._id,
        status: 1,
      }).lean(),
      HostApplication.findOne({
        userId: user._id,
        // agencyId: agency._id,
        status: 3,
      }).lean(),
    ]);

    if (existingPending) {
      return res.status(200).json({ status: false, message: "A pending host application already exists." });
    }
    F;

    if (existingDeclined) {
      await HostApplication.deleteOne({ _id: existingDeclined._id });
    }

    const updatedUser = {
      image: user.image,
      name: user.name,
      userName: user.userName,
      uniqueId: user.uniqueId,
      email: user.email,
      gender: user.gender,
      country: user.country,
      countryFlagImage: user.countryFlagImage,
      wealthLevelName: wealthLevel?.levelName || "",
      wealthLevelImage: wealthLevel?.levelImage || "",
      totalFollowers: followers.length,
      totalFollowings: followings.length,
      totalFriends: friends.length,
      coin: user.coin,
      earnedHostCoins: user.earnedHostCoins,
      isBlock: user.isBlock,
      isOnline: user.isOnline,
    };

    res.status(200).json({
      status: true,
      message: "User successfully promoted to Host.",
      host: updatedUser,
    });

    await User.updateOne(
      { _id: user._id },
      {
        $addToSet: { role: 2 },
        $set: { agencyId: agency._id },
      },
    );

    if (user.isPushNotificationEnabled && !user.isBlock && user.fcmToken) {
      try {
        const payload = {
          token: user.fcmToken,
          notification: {
            title: "✅ Host Role Granted",
            body: "Congratulations! You have been granted host access. Start your live session now!",
          },
          data: {
            type: "HOST_GRANTED",
          },
        };

        const adminInstance = await admin;
        await adminInstance.messaging().send(payload);
        console.log("Host role notification sent to user.");
      } catch (err) {
        console.error("Error sending FCM notification:", err.message);
      }
    }
  } catch (err) {
    console.error("addHost error:", err);
    return res.status(500).json({ status: false, message: "An internal server error occurred while assigning the host role.", error: err.message });
  }
};

//get agency's hosts
exports.listAgencyHosts = async (req, res) => {
  try {
    if (!req.query.agencyId) {
      return res.status(200).json({ status: false, message: "Agency ID is required." });
    }

    const searchString = req.query.search || "";
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const agencyId = new mongoose.Types.ObjectId(req.query.agencyId);

    const agency = await Agency.findOne({ _id: agencyId }).select("_id isActive").lean();
    if (!agency) {
      return res.status(200).json({ status: false, message: "No agency found with the provided ID." });
    }

    if (!agency.isActive) {
      return res.status(200).json({ status: false, message: "Agency is currently inactive." });
    }

    let searchQuery = {};
    if (searchString !== "All" && searchString !== "") {
      searchQuery = {
        $or: [
          { name: { $regex: searchString, $options: "i" } },
          { userName: { $regex: searchString, $options: "i" } },
          { email: { $regex: searchString, $options: "i" } },
          { uniqueId: { $regex: searchString, $options: "i" } },
        ],
      };
    }

    const matchQuery = {
      ...searchQuery,
      isFake: false,
      agencyId: agencyId,
      role: { $in: [2] },
    };

    const result = await User.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          hosts: [
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "followerfollowings",
                localField: "_id",
                foreignField: "toUserId",
                pipeline: [{ $project: { fromUserId: 1, _id: 0 } }],
                as: "followers",
              },
            },
            {
              $lookup: {
                from: "followerfollowings",
                localField: "_id",
                foreignField: "fromUserId",
                pipeline: [{ $project: { toUserId: 1, _id: 0 } }],
                as: "followings",
              },
            },
            {
              $lookup: {
                from: "wealthlevels",
                localField: "wealthLevel",
                foreignField: "_id",
                pipeline: [
                  {
                    $project: {
                      levelImage: 1,
                      levelName: 1,
                    },
                  },
                ],
                as: "wealthDetails",
              },
            },
            {
              $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true },
            },
            {
              $project: {
                _id: 1,
                uniqueId: 1,
                name: 1,
                userName: 1,
                image: 1,
                countryFlagImage: 1,
                country: 1,
                gender: 1,
                //coin: 1,
                earnedHostCoins: 1,
                email: 1,
                isBlock: 1,
                isHostBlocked: 1,
                isOnline: 1,
                createdAt: 1,
                wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
                wealthLevelName: { $ifNull: ["$wealthDetails.levelName", ""] },
                totalFollowers: { $size: "$followers" },
                totalFollowings: { $size: "$followings" },
                totalFriends: { $size: { $setIntersection: ["$followers.fromUserId", "$followings.toUserId"] } },
              },
            },
          ],
        },
      },
      {
        $project: {
          total: { $ifNull: [{ $arrayElemAt: ["$metadata.total", 0] }, 0] },
          hosts: 1,
        },
      },
    ]);

    const totalRecords = result[0]?.total || 0;
    const hosts = result[0]?.hosts || [];

    return res.status(200).json({
      status: true,
      message: "Host list retrieved successfully for the specified agency.",
      total: totalRecords,
      hosts: hosts,
    });
  } catch (error) {
    console.error("Error fetching agency wise hosts:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//toggle host's block status
exports.toggleHostBlockStatus = async (req, res, next) => {
  try {
    if (!req.query.agencyId) {
      return res.status(200).json({ status: false, message: "Agency ID is required." });
    }

    if (req.query.agencyId && !mongoose.Types.ObjectId.isValid(req.query.agencyId)) {
      return res.status(200).json({ status: false, message: "Invalid agencyId. Please provide a valid ObjectId." });
    }

    const { userId } = req.query;

    if (!userId) {
      return res.status(200).json({ status: false, message: "User ID is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(200).json({ status: false, message: "Invalid user ID. Please provide a valid ObjectId." });
    }

    const agencyObjectId = new mongoose.Types.ObjectId(req.query.agencyId);

    const host = await User.findOne({ _id: userId, role: { $in: [2] }, agencyId: agencyObjectId }).select("_id isHostBlocked");
    if (!host) {
      return res.status(200).json({ status: false, message: "Host not found." });
    }

    host.isHostBlocked = !host.isHostBlocked;
    await host.save();

    res.status(200).json({
      status: true,
      message: `Host has been ${host.isHostBlocked ? "blocked" : "unblocked"} successfully.`,
      data: host,
    });

    const isBlocked = host.isHostBlocked;

    const eventData = {
      isHostBlocked: isBlocked,
      message: isBlocked ? "Your host account has been blocked by agency/admin." : "Your host account has been unblocked by agency/admin.",
    };

    if (global.io) {
      const room = `globalRoom:${host._id}`;
      const eventName = isBlocked ? "hostBlocked" : "hostUnblocked";
      global.io.to(room).emit(eventName, eventData);
    }
  } catch (error) {
    console.error("Error toggling host block status:", error);
    return res.status(500).json({ status: false, message: "An error occurred while updating host block status." });
  }
};
