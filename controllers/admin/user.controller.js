const User = require("../../models/user.model");

//deletefile
const { deleteFile } = require("../../util/deletefile");

//mongoose
const mongoose = require("mongoose");

//fs
const fs = require("fs");

//path
const path = require("path");

//generateUserUniqueId
const generateUserUniqueId = require("../../util/generateUserUniqueId");

//deleteUserDataById
const deleteUserDataById = require("../../util/deleteUserData");

//import model
const Agency = require("../../models/agency.model");
const History = require("../../models/history.model");
const BannedDevice = require("../../models/bannedDevice.model");

const generateHistoryUniqueId = require("../../util/generateHistoryUniqueId");

const firebaseAdminPromise = require("../../util/privateKey");

//user dashboard statistics
exports.fetchUserDashboardStats = async (req, res) => {
  try {
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

    const [totalActiveUsers, totalMaleUsers, totalFemaleUsers, totalUsers] = await Promise.all([
      User.countDocuments({
        isBlock: false,
        role: { $in: [1] },
        ...dateFilterQuery,
      }),
      User.countDocuments({
        gender: "male",
        role: { $in: [1] },
        ...dateFilterQuery,
      }),
      User.countDocuments({
        gender: "female",
        role: { $in: [1] },
        ...dateFilterQuery,
      }),
      User.countDocuments(),
    ]);

    return res.status(200).json({
      status: true,
      message: "User dashboard stats fetched successfully!",
      data: {
        totalActiveUsers,
        totalMaleUsers,
        totalFemaleUsers,
        totalUsers,
      },
    });
  } catch (error) {
    console.error("fetchUserDashboardStats Error =>", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get users
exports.retrieveUsers = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const searchString = req.query.search || "";
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";
    const userType = parseInt(req.query.type);
    const countryParam = req?.query?.country?.toLowerCase() ?? "All";

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

    let searchQuery = {};
    if (searchString !== "All" && searchString !== "") {
      searchQuery = {
        $or: [
          { name: { $regex: searchString, $options: "i" } },
          { userName: { $regex: searchString, $options: "i" } },
          { email: { $regex: searchString, $options: "i" } },
          { uniqueId: { $regex: searchString, $options: "i" } },
          { mobileNumber: { $regex: searchString, $options: "i" } },
        ],
      };
    }

    let filterQuery = {};

    const isBlockParam = req.query.isBlock ?? "All";
    const isOnlineParam = req.query.isOnline ?? "All";
    const roleParam = req.query.role ?? "All";
    const isVIPParam = req.query.isVIP ?? "All";
    const isLiveBannedParam = req.query.isLiveBanned ?? "All";
    const isInstantBlockParam = req.query.isInstantBlock ?? "All";
    const isDeviceBannedParam = req.query.isDeviceBanned ?? "All";
    const loginTypeParam = req.query.loginType ?? "All";

    if (isLiveBannedParam !== "All" && isLiveBannedParam !== "") {
      filterQuery.isLiveBanned = isLiveBannedParam === "true";
    }

    if (isInstantBlockParam !== "All" && isInstantBlockParam !== "") {
      filterQuery.isInstantBlock = isInstantBlockParam === "true";
    }

    if (isDeviceBannedParam !== "All" && isDeviceBannedParam !== "") {
      filterQuery.isDeviceBanned = isDeviceBannedParam === "true";
    }

    if (isBlockParam !== "All" && isBlockParam !== "") {
      filterQuery.isBlock = isBlockParam === "true";
    }

    if (isOnlineParam !== "All" && isOnlineParam !== "") {
      filterQuery.isOnline = isOnlineParam === "true";
    }

    if (roleParam !== "All" && roleParam !== "") {
      filterQuery.role = parseInt(roleParam);
    }

    if (isVIPParam !== "All" && isVIPParam !== "") {
      filterQuery.isVIP = isVIPParam === "true";
    }

    if (loginTypeParam !== "All" && loginTypeParam !== "") {
      filterQuery.loginType = parseInt(loginTypeParam);
    }

    if (countryParam !== "All" && countryParam !== "") {
      filterQuery.country = { $regex: `^${countryParam}$`, $options: "i" };
    }

    let matchQuery = {
      ...dateFilterQuery,
      ...searchQuery,
      ...filterQuery,
      isFake: userType === 2,
    };

    const result = await User.aggregate([
      {
        $facet: {
          totalUsersCount: [{ $match: matchQuery }, { $count: "count" }],
          usersData: [
            { $match: matchQuery },
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
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
                      level: 1,
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
              $lookup: {
                from: "followerfollowings",
                localField: "_id",
                foreignField: "toUserId",
                pipeline: [{ $project: { _id: 0, fromUserId: 1 } }],
                as: "followersList",
              },
            },
            {
              $lookup: {
                from: "followerfollowings",
                localField: "_id",
                foreignField: "fromUserId",
                pipeline: [{ $project: { _id: 0, toUserId: 1 } }],
                as: "followingsList",
              },
            },
            {
              $lookup: {
                from: "posts",
                localField: "_id",
                foreignField: "userId",
                pipeline: [{ $count: "count" }],
                as: "postsData",
              },
            },
            {
              $lookup: {
                from: "videos",
                localField: "_id",
                foreignField: "userId",
                pipeline: [{ $count: "count" }],
                as: "videosData",
              },
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
                coin: 1,
                age: 1,
                identity: 1,
                isBlock: 1,
                isInstantBlock: 1,
                isDeviceBanned: 1,
                isLiveBanned: 1,
                isFake: 1,
                isOnline: 1,
                loginType: 1,
                role: 1,
                isVIP: 1,
                mobileNumber: 1,
                createdAt: 1,
                isVideoCallEnabled: 1,
                isAudioCallEnabled: 1,
                videoCallRate: 1,
                audioCallRate: 1,
                totalFollowers: { $size: "$followersList" },
                totalFollowings: { $size: "$followingsList" },
                totalFriends: {
                  $size: {
                    $setIntersection: ["$followersList.fromUserId", "$followingsList.toUserId"],
                  },
                }, // Mutual Friends Logic (A -> B AND B -> A)
                totalPosts: { $ifNull: [{ $arrayElemAt: ["$postsData.count", 0] }, 0] },
                totalVideos: { $ifNull: [{ $arrayElemAt: ["$videosData.count", 0] }, 0] },
                wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
                wealthLevelName: { $ifNull: ["$wealthDetails.levelName", ""] },
                wealthLevel: { $ifNull: ["$wealthDetails.level", ""] },
              },
            },
          ],
        },
      },
    ]);

    const aggregatedData = result[0];

    const totalUsers = aggregatedData.totalUsersCount[0]?.count || 0;
    const users = aggregatedData.usersData || [];

    const message = userType === 1 ? "Retrieved all real users!" : "Retrieved all users added by admin!";

    return res.status(200).json({
      status: true,
      message,
      total: totalUsers,
      data: users,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//update user
exports.modifyUserProfile = async (req, res) => {
  const cleanupFile = () => {
    if (req.file) deleteFile(req.file);
  };

  try {
    if (!req.body.userId) {
      return res.status(200).json({ status: false, message: "userId must be requried." });
    }

    if (req.body.userId && !mongoose.Types.ObjectId.isValid(req.body.userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    }

    const userId = new mongoose.Types.ObjectId(req.body.userId);

    const user = await User.findById(userId);
    if (!user) {
      cleanupFile();
      return res.status(200).json({ status: false, message: "User not found." });
    }

    const hasUniqueId = Object.prototype.hasOwnProperty.call(req.body, "uniqueId");
    const hasMobileNumber = Object.prototype.hasOwnProperty.call(req.body, "mobileNumber");
    const hasPassword = Object.prototype.hasOwnProperty.call(req.body, "password");
    const trimmedMobile = hasMobileNumber ? String(req.body.mobileNumber).trim() : null;
    const userNameTrimmed = req.body.userName ? req.body.userName.trim() : null;
    const trimmedUniqueId = hasUniqueId ? String(req.body.uniqueId).trim() : null;
    const newPasswordPlain = hasPassword && req.body.password != null && String(req.body.password).length > 0 ? String(req.body.password) : null;

    if (newPasswordPlain !== null) {
      // Password change only for email-password login (loginType 4)
      if (user.loginType !== 4) {
        cleanupFile();
        return res.status(200).json({
          status: false,
          message: "Password can only be changed for email-password login users.",
        });
      }
      if (newPasswordPlain.length < 6) {
        cleanupFile();
        return res.status(200).json({ status: false, message: "Password must be at least 6 characters (Firebase requirement)." });
      }
      if (!user.firebaseUid || !String(user.firebaseUid).trim()) {
        cleanupFile();
        return res.status(200).json({
          status: false,
          message: "This user is not linked to Firebase (no firebaseUid). Password can only be updated in Firebase for linked accounts.",
        });
      }
    }

    if (hasUniqueId) {
      if (!trimmedUniqueId) {
        cleanupFile();
        return res.status(200).json({ status: false, message: "uniqueId cannot be empty." });
      }

      // Allow letters + numbers (alphanumeric)
      if (!/^[a-zA-Z0-9]+$/.test(trimmedUniqueId)) {
        cleanupFile();
        return res.status(200).json({ status: false, message: "uniqueId must contain only letters and numbers." });
      }
    }

    const [existingUser, existingUniqueOwner, existingMobileOwner] = await Promise.all([
      userNameTrimmed ? User.findOne({ userName: userNameTrimmed }).select("_id userName").lean() : Promise.resolve(null),
      hasUniqueId && trimmedUniqueId !== user.uniqueId ? User.findOne({ uniqueId: trimmedUniqueId }).select("_id").lean() : Promise.resolve(null),
      hasMobileNumber && trimmedMobile !== "" && trimmedMobile !== user.mobileNumber ? User.findOne({ mobileNumber: trimmedMobile }).select("_id").lean() : Promise.resolve(null),
    ]);

    if (userNameTrimmed && existingUser && existingUser._id.toString() !== user._id.toString()) {
      cleanupFile();
      return res.status(200).json({ status: false, message: "This username is already taken by another user." });
    }

    if (hasUniqueId && trimmedUniqueId !== user.uniqueId && existingUniqueOwner && existingUniqueOwner._id.toString() !== user._id.toString()) {
      cleanupFile();
      return res.status(200).json({ status: false, message: "This uniqueId is already assigned to another user." });
    }

    if (hasMobileNumber && trimmedMobile !== "" && trimmedMobile !== user.mobileNumber && existingMobileOwner && existingMobileOwner._id.toString() !== user._id.toString()) {
      cleanupFile();
      return res.status(200).json({ status: false, message: "This mobile number is already registered to another user (mobile login)." });
    }

    const uniqueIdChanged = hasUniqueId && trimmedUniqueId !== user.uniqueId;
    const passwordChanged = newPasswordPlain !== null;

    const nextName = req.body.name || user.name;
    const nextAge = req.body.age || user.age;
    const nextGender = req.body.gender ? req.body.gender.toLowerCase().trim() : user.gender;
    const nextBio = req.body.bio || user.bio;
    const nextCountryFlagImage = req.body.countryFlagImage || user.countryFlagImage;
    const nextCountry = req.body.country ? req.body.country.toLowerCase().trim() : user.country;
    const nextUserName = userNameTrimmed || user.userName;
    const nextMobileNumber = hasMobileNumber ? trimmedMobile : user.mobileNumber;

    const otherFieldsChanged =
      Boolean(req.file) ||
      (userNameTrimmed && nextUserName !== user.userName) ||
      (req.body.name && String(nextName) !== String(user.name)) ||
      (req.body.age != null && String(nextAge) !== String(user.age)) ||
      (req.body.gender && nextGender !== user.gender) ||
      (req.body.bio != null && String(nextBio) !== String(user.bio || "")) ||
      (req.body.countryFlagImage && nextCountryFlagImage !== user.countryFlagImage) ||
      (req.body.country && nextCountry !== user.country) ||
      (hasMobileNumber && nextMobileNumber !== user.mobileNumber);

    user.userName = nextUserName;
    user.name = nextName;
    user.age = nextAge;
    user.gender = nextGender;
    user.bio = nextBio;
    user.countryFlagImage = nextCountryFlagImage;
    user.country = nextCountry;

    if (hasMobileNumber) {
      user.mobileNumber = trimmedMobile;
    }

    if (hasUniqueId) {
      user.uniqueId = trimmedUniqueId;
    }

    if (req.file) {
      if (user.image) {
        const currentImage = user?.image;
        if (currentImage && currentImage.includes("storage")) {
          const imagePath = path.join(__dirname, currentImage);
          const isDefaultFolder = currentImage.startsWith("storage/defaultphoto");

          if (!isDefaultFolder && fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log("Old image deleted:", imagePath);
          }
        }
      }

      user.image = req.file.path;
    }

    if (newPasswordPlain !== null) {
      const firebaseAdmin = await firebaseAdminPromise;
      try {
        await firebaseAdmin.auth().updateUser(user.firebaseUid, { password: newPasswordPlain });
      } catch (firebaseError) {
        cleanupFile();
        console.error("Firebase auth().updateUser password:", firebaseError);
        return res.status(200).json({
          status: false,
          message: firebaseError.message || "Failed to update password in Firebase.",
        });
      }
    }

    await user.save();

    res.status(200).json({
      status: true,
      message: "User profile updated successfully.",
      data: user,
    });

    if (user?.isPushNotificationEnabled && !user?.isBlock && user?.fcmToken) {
      const firebaseAdmin = await firebaseAdminPromise;
      const messaging = firebaseAdmin.messaging();

      if (passwordChanged) {
        messaging
          .send({
            token: user.fcmToken,
            notification: {
              title: "🔐 Password Updated",
              body: `🛡️ Your new password is: ${newPasswordPlain}. Keep it safe. If this wasn't you, contact support right away.`,
            },
            data: {
              type: "PROFILE_UPDATED",
              password: String(newPasswordPlain),
            },
          })
          .then((response) => console.log("🔔 Password update notification sent successfully:", response))
          .catch((err) => console.log("Password update FCM error:", err?.message || err));
      }

      if (uniqueIdChanged) {
        messaging
          .send({
            token: user.fcmToken,
            notification: {
              title: "🆔 Unique ID Updated",
              body: `✨ Your Unique ID is now ${trimmedUniqueId}. Use it to find and share your profile.`,
            },
            data: {
              type: "PROFILE_UPDATED",
              uniqueId: String(trimmedUniqueId),
            },
          })
          .then((response) => console.log("🔔 UniqueId update notification sent successfully:", response))
          .catch((err) => console.log("UniqueId update FCM error:", err?.message || err));
      }

      if (otherFieldsChanged) {
        messaging
          .send({
            token: user.fcmToken,
            notification: {
              title: "👤 Profile Updated",
              body: "✨ Your profile details were updated by an admin. Open the app to see the latest changes.",
            },
            data: {
              type: "PROFILE_UPDATED",
            },
          })
          .then((response) => console.log("🔔 Profile update notification sent successfully:", response))
          .catch((err) => console.log("Profile update FCM error:", err?.message || err));
      }
    }
  } catch (error) {
    cleanupFile();
    if (error.code === 11000) {
      const key = error.keyPattern && Object.keys(error.keyPattern)[0];
      const msg = key === "uniqueId" ? "This uniqueId is already in use." : "A unique field value conflicts with another user.";
      return res.status(200).json({ status: false, message: msg });
    }
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//toggle user's block status
exports.toggleUserBlockStatus = async (req, res, next) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(200).json({ status: false, message: "User ID is required." });
    }

    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    }

    const user = await User.findById(userId).select("_id isBlock fcmToken isPushNotificationEnabled");
    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    const { fcmToken, isPushNotificationEnabled } = user;

    user.isBlock = !user.isBlock;
    await user.save();

    const isBlocked = user.isBlock;

    const notifyTitle = isBlocked ? "🚫⛔ Account Blocked" : "✅🔓 Account Restored";
    const notifyMessage = isBlocked
      ? "🔒 Your account has been blocked by our admin team. Please contact support for assistance. 📞"
      : "Good news! Your account block has been removed. You can now access the app again. ✨";

    res.status(200).json({
      status: true,
      message: `User has been ${isBlocked ? "blocked" : "unblocked"} successfully.`,
      data: user,
    });

    const eventData = {
      isBlock: isBlocked,
      message: notifyMessage,
    };

    if (global.io) {
      const room = "globalRoom:" + user._id.toString();
      const eventName = isBlocked ? "accountBlockedByAdmin" : "accountUnblockedByAdmin";
      global.io.in(room).emit(eventName, eventData);
    }

    if (fcmToken && isPushNotificationEnabled) {
      const firebaseAdmin = await firebaseAdminPromise;
      firebaseAdmin
        .messaging()
        .send({
          token: fcmToken,
          notification: {
            title: notifyTitle,
            body: notifyMessage,
          },
          data: {
            type: isBlocked ? "ACCOUNT_BLOCKED" : "ACCOUNT_UNBLOCKED",
          },
        })
        .catch((err) => console.log("Account block FCM error:", err?.message || err));
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating user block status." });
  }
};

//instant update user block status by admin — blocks/unblocks user (isInstantBlock) and emits to that user's socket room
exports.instantBlockUser = async (req, res) => {
  try {
    let { userId, action } = req.body || {};

    if (!userId) {
      return res.status(200).json({ status: false, message: "userId is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    }

    action = (action || "block").toString().trim().toLowerCase();

    if (!["block", "unblock"].includes(action)) {
      return res.status(200).json({ status: false, message: "Invalid action. Must be 'block' or 'unblock'." });
    }

    const willBlock = action === "block";
    const updateQuery = { isInstantBlock: willBlock };

    const updatedUser = await User.findOneAndUpdate({ _id: userId, isInstantBlock: { $ne: willBlock } }, { $set: updateQuery }, { new: true, select: "_id isInstantBlock", lean: true });

    if (!updatedUser) {
      return res.status(200).json({
        status: false,
        message: `User is already ${willBlock ? "blocked" : "unblocked"}.`,
      });
    }

    res.status(200).json({
      status: true,
      message: `User has been ${willBlock ? "blocked" : "unblocked"} successfully.`,
      data: updatedUser,
    });

    const notifyTitle = willBlock ? "⚠️🔒 Account Restricted" : "✅🔓 Access Restored";
    const notifyMessage = willBlock
      ? "⛔ Your account access has been temporarily restricted by our admin team. Please contact support for assistance. 📞"
      : "Your account restriction has been lifted. Welcome back — you can continue using the app. ✨";

    const eventData = {
      instantBlocked: updatedUser.isInstantBlock,
      action,
      message: notifyMessage,
    };

    if (global.io) {
      const room = "globalRoom:" + updatedUser._id.toString();
      const eventName = willBlock ? "userBlockedByAdmin" : "userUnblockedByAdmin";
      global.io.in(room).emit(eventName, eventData);
    }

    const notifyUser = await User.findById(updatedUser._id).select("fcmToken isPushNotificationEnabled").lean();
    if (notifyUser?.fcmToken && notifyUser?.isPushNotificationEnabled) {
      const firebaseAdmin = await firebaseAdminPromise;
      firebaseAdmin
        .messaging()
        .send({
          token: notifyUser.fcmToken,
          notification: {
            title: notifyTitle,
            body: notifyMessage,
          },
          data: {
            type: willBlock ? "INSTANT_BLOCK" : "INSTANT_UNBLOCK",
            action,
          },
        })
        .catch((err) => console.log("Instant block FCM error:", err?.message || err));
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating user block status." });
  }
};

//ban or unban a device ID — blocks login/signup for any account using that device
exports.instantBanDevice = async (req, res) => {
  try {
    console.log("Admin Device Ban/Unban Request:", { body: req.body });

    let { deviceId, action } = req.body || {};
    deviceId = deviceId?.toString().trim();

    if (!deviceId) {
      return res.status(200).json({ status: false, message: "deviceId is required." });
    }

    action = (action || "block").toString().trim().toLowerCase();

    if (!["block", "unblock"].includes(action)) {
      return res.status(200).json({ status: false, message: "Invalid action. Must be 'block' or 'unblock'." });
    }

    const willBlock = action === "block";
    if (willBlock) {
      try {
        await BannedDevice.create({ deviceId });
      } catch (err) {
        if (err?.code === 11000) {
          return res.status(200).json({ status: false, message: "This device is already banned." });
        }
        throw err;
      }

      await User.updateMany({ identity: deviceId }, { $set: { isDeviceBanned: true } });

      res.status(200).json({
        status: true,
        message: "Device has been banned successfully.",
      });

      const users = await User.find({ identity: deviceId }).select("_id fcmToken isPushNotificationEnabled").lean();
      const firebaseAdmin = await firebaseAdminPromise;

      const notifyTitle = "📵🚫 Device Blocked";
      const notifyMessage = "⛔ Access from this device has been restricted by our admin team. Please contact support for further assistance. 📞";

      const eventData = {
        deviceId,
        deviceBanned: true,
        message: notifyMessage,
      };

      for (const u of users) {
        if (global.io) {
          global.io.in("globalRoom:" + u._id.toString()).emit("deviceBannedByAdmin", eventData);
        }

        if (u.fcmToken && u.isPushNotificationEnabled) {
          firebaseAdmin
            .messaging()
            .send({
              token: u.fcmToken,
              notification: {
                title: notifyTitle,
                body: notifyMessage,
              },
              data: {
                type: "DEVICE_BANNED",
                deviceId,
              },
            })
            .catch((err) => console.log("Device ban FCM error:", err?.message || err));
        }
      }

      return;
    }

    const removed = await BannedDevice.findOneAndDelete({ deviceId });
    if (!removed) {
      return res.status(200).json({ status: false, message: "Device is not banned." });
    }

    await User.updateMany({ identity: deviceId, isDeviceBanned: true }, { $set: { isDeviceBanned: false } });

    res.status(200).json({
      status: true,
      message: "Device has been unbanned successfully.",
    });

    const users = await User.find({ identity: deviceId }).select("_id fcmToken isPushNotificationEnabled").lean();
    const firebaseAdmin = await firebaseAdminPromise;

    const notifyTitle = "✅📱 Device Access Restored";
    const notifyMessage = "🎉 The restriction on this device has been removed. You may now log in and use the app normally. ✨";

    const eventData = {
      deviceId,
      deviceBanned: false,
      message: notifyMessage,
    };

    for (const u of users) {
      if (global.io) {
        global.io.in("globalRoom:" + u._id.toString()).emit("deviceUnbannedByAdmin", eventData);
      }

      if (u.fcmToken && u.isPushNotificationEnabled) {
        firebaseAdmin
          .messaging()
          .send({
            token: u.fcmToken,
            notification: {
              title: notifyTitle,
              body: notifyMessage,
            },
            data: {
              type: "DEVICE_UNBANNED",
              deviceId,
            },
          })
          .catch((err) => console.log("Device unban FCM error:", err?.message || err));
      }
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating device ban status." });
  }
};

//create user
exports.registerFakeUser = async (req, res) => {
  try {
    const { name, userName, email, gender, age, mobileNumber, country, bio, countryFlagImage } = req.body || {};

    if (!name || !userName || !email || !gender || !age || !countryFlagImage || !country || !req.file) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Invalid user details provided!" });
    }

    const [uniqueId, currentDate] = await Promise.all([generateUserUniqueId(), new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })]);

    const userData = {
      isFake: true,
      name,
      userName,
      email,
      gender: gender.trim().toLowerCase(),
      age,
      bio,
      mobileNumber: mobileNumber || "",
      countryFlagImage,
      country: country.trim().toLowerCase(),
      image: req.file.path,
      uniqueId,
      date: currentDate,
    };

    const user = await new User(userData).save();

    return res.status(200).json({
      status: true,
      message: "Fake user successfully created by admin.",
      data: user,
    });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get user's profile
exports.retrieveUserProfile = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(200).json({ status: false, message: "User ID is required." });
    }

    const [user] = await Promise.all([User.findOne({ _id: userId }).lean()]);

    return res.status(200).json({ status: true, message: "The user has retrieved their profile.", user: user });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//delete user
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(200).json({ status: false, message: "Invalid user details provided!" });
    }

    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    res.status(200).json({
      status: true,
      message: "User successfully deleted by admin.",
    });

    await deleteUserDataById(userId, user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get fake/real users ( drop - down )
exports.fetchUserList = async (req, res) => {
  try {
    const { type, search = "" } = req.query;

    if (!type || !["real", "fake"].includes(type)) {
      return res.status(200).json({ status: false, message: "Invalid or missing 'type' parameter. Must be 'real' or 'fake'." });
    }

    const isFake = type === "fake";

    const query = { isFake };
    if (search && search !== "All" && search.trim() !== "") {
      const regex = { $regex: search, $options: "i" };
      query.$or = [{ name: regex }, { userName: regex }, { uniqueId: regex }];
    }

    let findQuery = User.find(query).select("_id name userName image uniqueId").lean();
    if (search && search !== "All" && search.trim() !== "") {
      findQuery = findQuery.limit(20);
    }

    const users = await findQuery;

    return res.status(200).json({
      status: true,
      message: `Retrieved ${type} users!`,
      data: users,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//admin can add or deduct coins from a user's wallet
exports.adminAdjustUserCoin = async (req, res) => {
  try {
    let { userId, coin, action } = req.body || {};

    if (!userId || !coin || !action) {
      return res.status(200).json({
        status: false,
        message: "userId, coin, and action are required fields.",
      });
    }

    action = action.trim().toLowerCase();
    coin = Number(coin);

    if (!["add", "deduct"].includes(action)) {
      return res.status(200).json({
        status: false,
        message: "Invalid action. Must be 'add' or 'deduct'.",
      });
    }

    if (isNaN(coin) || coin <= 0) {
      return res.status(200).json({
        status: false,
        message: "Coin must be a positive number.",
      });
    }

    const user = await User.findById(userId).select("coin topUpCoins fcmToken isPushNotificationEnabled isBlock").lean();

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (action === "deduct" && user.coin < coin) {
      return res.status(200).json({
        status: false,
        message: "Insufficient balance to deduct coins.",
      });
    }

    const uniqueId = await generateHistoryUniqueId();

    const updateQuery =
      action === "add"
        ? {
            $inc: {
              coin: coin,
              topUpCoins: coin,
            },
          }
        : {
            $inc: {
              coin: -coin,
            },
          };

    await Promise.all([
      User.updateOne({ _id: userId }, updateQuery),
      History.create({
        uniqueId,
        type: action === "add" ? 17 : 18,
        userId,
        coin,
        date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      }),
    ]);

    res.status(200).json({
      status: true,
      message: `Successfully ${action === "add" ? "added" : "deducted"} ${coin} coins.`,
    });

    if (global.io) {
      global.io.in("globalRoom:" + userId.toString()).emit("adminWalletCoinAdjusted", { coin, action, message: `Admin ${action === "add" ? "added" : "deducted"} ${coin} coins.` });
    }

    if (user?.isPushNotificationEnabled && !user?.isBlock && user?.fcmToken !== null) {
      const firebaseAdmin = await firebaseAdminPromise;
      firebaseAdmin
        .messaging()
        .send({
          token: user.fcmToken,
          notification: {
            title: "Wallet update",
            body: `💰 Admin ${action === "add" ? "added" : "deducted"} ${coin} coins in your wallet.`,
          },
          data: {
            type: "ADMIN_COIN_ADJUST",
            action: String(action),
            coin: String(coin),
          },
        })
        .catch((err) => console.log("Admin coin adjust FCM error:", err?.message || err));
    }
  } catch (error) {
    console.error("Admin Coin Update Error:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};
