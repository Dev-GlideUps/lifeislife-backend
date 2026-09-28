const User = require("../../models/user.model");

//import model
const History = require("../../models/history.model");
const FollowerFollowing = require("../../models/followerFollowing.model");
const ProfileVisitor = require("../../models/profileVisitor.model");
const Agency = require("../../models/agency.model");
const LoginBonusTracker = require("../../models/loginBonusTracker.model");
const LiveStreamer = require("../../models/liveStreamer.model");
const Post = require("../../models/post.model");
const Video = require("../../models/video.model");
const HashTag = require("../../models/hashTag.model");
const Song = require("../../models/song.model");
const BannedDevice = require("../../models/bannedDevice.model");
const HostApplication = require("../../models/hostApplication.model");

//fs
const fs = require("fs");

//path
const path = require("path");

//axios
const axios = require("axios");

//updateWealthLevel
const updateWealthLevel = require("../../util/updateWealthLevel");

//updateHostLevel
const updateHostLevel = require("../../util/updateHostLevel");

//deletefile
const { deleteFile } = require("../../util/deletefile");

//userFunction
const userFunction = require("../../util/userFunction");

//mongoose
const mongoose = require("mongoose");

//generateHistoryUniqueId
const generateHistoryUniqueId = require("../../util/generateHistoryUniqueId");

//generateReferralCode
const generateReferralCode = require("../../util/generateReferralCode");

//private key
const admin = require("../../util/privateKey");

//deleteUserDataById
const deleteUserDataById = require("../../util/deleteUserData");

//check the user is exists or not
exports.validateUserPresence = async (req, res) => {
  try {
    const { email, loginType } = req.query;

    if (!loginType) {
      return res.status(200).json({ status: false, message: "loginType is required." });
    }

    const parsedLoginType = Number(loginType);

    if (isNaN(parsedLoginType)) {
      return res.status(200).json({ status: false, message: "Invalid loginType." });
    }

    if ([2, 4].includes(parsedLoginType)) {
      if (!email) {
        return res.status(200).json({ status: false, message: `email is required for loginType ${parsedLoginType}.` });
      }

      const user = await User.findOne({ email: email.trim(), loginType: parsedLoginType });

      if (user) {
        return res.status(200).json({
          status: true,
          message: "User login successfully.",
          isLogin: true,
        });
      }

      return res.status(200).json({
        status: true,
        message: "User not found. Please sign up to continue.",
        isLogin: false,
      });
    }

    return res.status(200).json({
      status: false,
      message: "Unsupported loginType.",
    });
  } catch (error) {
    console.error("validateUserPresence error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//check the user is exists or not for forget password
exports.userExistsForReset = async (req, res) => {
  try {
    const { email, loginType } = req.query;

    if (!loginType) {
      return res.status(200).json({ status: false, message: "loginType is required." });
    }

    const parsedLoginType = Number(loginType);

    if (isNaN(parsedLoginType)) {
      return res.status(200).json({ status: false, message: "Invalid loginType." });
    }

    if (parsedLoginType !== 4) {
      return res.status(200).json({ status: false, message: "Only email-password users can reset password." });
    }

    if (!email) {
      return res.status(200).json({ status: false, message: "email is required." });
    }

    const user = await User.findOne({ email: email.trim(), loginType: parsedLoginType });

    if (user) {
      return res.status(200).json({
        status: true,
        message: "User found.",
        isLogin: true,
      });
    }

    return res.status(200).json({
      status: true,
      message: "User not found. Please sign up to continue.",
      isLogin: false,
    });
  } catch (error) {
    console.error("userExistsForReset error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//verify username ( always be unique )
exports.checkUserNameAvailability = async (req, res) => {
  try {
    if (!req.user || !req.user.uid) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const newUsername = req.query.userName?.trim();
    if (!newUsername) {
      return res.status(200).json({ status: false, message: "Oops! Invalid details!" });
    }

    const userId = req.user.userId;

    const [existingUser] = await Promise.all([User.findOne({ userName: newUsername }).select("_id").lean()]);

    if (existingUser && existingUser._id.toString() !== userId.toString()) {
      return res.status(200).json({
        status: false,
        message: "This username is already taken by another user.",
        isUserNameAvailable: false,
      });
    }

    return res.status(200).json({
      status: true,
      message: "Username is valid and available.",
      isUserNameAvailable: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//check if mobile or email exists or not
exports.checkMobileOrEmailExists = async (req, res) => {
  try {
    const { mobile, email } = req.body || {};

    if (!mobile && !email) {
      return res.status(200).json({ status: false, message: "Mobile or email is required" });
    }

    const user = await User.findOne({ $or: [mobile ? { mobileNumber: mobile } : null, email ? { email } : null].filter(Boolean) }).select("email mobileNumber loginType");

    if (!user) {
      return res.status(200).json({
        status: true,
        message: "Mobile or email does not exist",
        isExists: false,
      });
    }

    const loginType = user.loginType || null;

    if (email && user.email === email) {
      return res.status(200).json({
        status: true,
        message: "Email already exists",
        isExists: true,
        loginType,
      });
    }

    if (mobile && user.mobileNumber === mobile) {
      return res.status(200).json({
        status: true,
        message: "Mobile number already exists",
        isExists: true,
        loginType,
      });
    }

    return res.status(200).json({
      status: true,
      message: "Mobile or email does not exist",
      isExists: false,
    });
  } catch (error) {
    console.error("Check Mobile Or Email Exists Error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to check mobile or email",
      error: error.message,
    });
  }
};

//get firebase UID using device UUID
exports.fetchFirebaseUidByDeviceId = async (req, res) => {
  try {
    const { deviceUuid, loginType } = req.query || {};

    if (!deviceUuid) {
      return res.status(200).json({
        status: false,
        message: "Device UUID is required.",
      });
    }

    if (!loginType) {
      return res.status(200).json({
        status: false,
        message: "Login type is required.",
      });
    }

    const user = await User.findOne({ identity: deviceUuid.trim(), loginType: Number(loginType) }, { mobileNumber: 1, email: 1, firebaseUid: 1 }).lean();

    if (!user || !user.firebaseUid) {
      return res.status(200).json({
        status: false,
        message: "Firebase UID not found for this device.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Firebase UID fetched successfully.",
      user,
    });
  } catch (error) {
    console.error("Fetch Firebase UID Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//create firebase custom token using firebase UID
exports.createFirebaseCustomToken = async (req, res) => {
  try {
    const { firebaseUid } = req.query;

    if (!firebaseUid) {
      return res.status(200).json({
        status: false,
        message: "Firebase UID is required.",
      });
    }

    const firebaseAdmin = await admin;
    const customToken = await firebaseAdmin.auth().createCustomToken(firebaseUid);

    return res.status(200).json({
      status: true,
      message: "Firebase custom auth token created successfully.",
      customToken,
    });
  } catch (error) {
    console.error("Create Custom Token Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Failed to create Firebase custom auth token." });
  }
};

//user login and sign up
exports.loginOrRegisterUser = async (req, res) => {
  try {
    console.log("req.body: ", req.body);

    const { identity, loginType, fcmToken, email, mobileNumber, name, userName, image, facebookId } = req.body || {};

    if (!identity || loginType === undefined || !fcmToken) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Oops! Invalid details!" });
    }

    const deviceId = String(identity).trim();
    const isDeviceBanned = await BannedDevice.exists({ deviceId });
    if (isDeviceBanned) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "This device has been blocked by admin. You cannot sign in or register from this device." });
    }

    const { uid, provider } = req.user;

    let userQuery;

    switch (loginType) {
      case 1:
        if (!mobileNumber) {
          if (req.file) deleteFile(req.file);
          return res.status(200).json({ status: false, message: "mobileNumber is required." });
        }
        userQuery = { mobileNumber, loginType: 1 };
        break;
      case 2:
        if (!email) {
          if (req.file) deleteFile(req.file);
          return res.status(200).json({ status: false, message: "email is required." });
        }
        userQuery = { email: email.trim(), loginType: 2 };
        break;
      case 3:
        if (!identity && !email) {
          if (req.file) deleteFile(req.file);
          return res.status(200).json({ status: false, message: "Either identity or email is required." });
        }
        userQuery = { identity, email };
        // userQuery = {}; // No specific query for finding an existing user
        break;
      case 4:
        if (!email) {
          if (req.file) deleteFile(req.file);
          return res.status(200).json({ status: false, message: "email must be required." });
        }

        userQuery = { email: email.trim(), loginType: 4 };
        break;
      case 5:
        if (!email) {
          if (req.file) deleteFile(req.file);
          return res.status(200).json({ status: false, message: "email is required." });
        }
        userQuery = { email, loginType: 5 };
        break;
      case 6:
        if (!facebookId) {
          if (req.file) deleteFile(req.file);
          return res.status(200).json({ status: false, message: "facebookId is required." });
        }
        userQuery = { facebookId, loginType: 6 };
        break;
      default:
        if (req.file) deleteFile(req.file);
        return res.status(200).json({ status: false, message: "Invalid loginType." });
    }

    let user = null;
    if (Object.keys(userQuery).length > 0) {
      user = await User.findOne(userQuery).select("_id loginType name userName image fcmToken lastlogin isBlock isInstantBlock isDeviceBanned identity email mobileNumber");
    }

    if (user) {
      console.log("User already exists, logging in...");

      if (user.isBlock) {
        if (req.file) deleteFile(req.file);
        return res.status(200).json({ status: false, message: "User is blocked by the admin." });
      }

      if (user.isInstantBlock) {
        if (req.file) deleteFile(req.file);
        return res.status(200).json({ status: false, message: "Access denied. Your account has been restricted by the admin." });
      }

      if (user.isDeviceBanned) {
        if (req.file) deleteFile(req.file);
        return res.status(200).json({ status: false, message: "This account is not allowed to access from this device." });
      }

      user.identity = identity ? identity?.trim() : user.identity;
      user.email = email ? email?.trim() : user.email;
      user.mobileNumber = mobileNumber ? mobileNumber?.trim() : user?.mobileNumber;
      user.name = name ? name?.trim() : user.name;
      user.userName = userName ? userName?.trim() : user.userName;
      user.image = req.file ? req.file.path : image ? image : user.image;
      user.fcmToken = fcmToken ? fcmToken : user.fcmToken;
      user.lastlogin = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      await user.save();

      return res.status(200).json({ status: true, message: "User logged in.", user: user, signUp: false });
    } else {
      console.log("Registering new user...");

      const [existingFirebaseUser, referralCode, uniqueId] = await Promise.all([User.exists({ firebaseUid: uid }), generateReferralCode(), generateHistoryUniqueId()]);

      if (existingFirebaseUser) {
        if (req.file) deleteFile(req.file);
        return res.status(200).json({ status: false, message: "User with this Firebase ID already exists." });
      }

      const newUser = new User();
      newUser.firebaseUid = uid;
      newUser.provider = provider;
      newUser.referralCode = referralCode;
      newUser.videoCallRate = settingJSON?.privateCallRate || 0;
      newUser.audioCallRate = settingJSON?.privateAudioCallRate || 0;
      newUser.date = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

      const user = await userFunction(newUser, req);

      res.status(200).json({
        status: true,
        message: "A new user has registered an account.",
        signUp: true,
        user: {
          _id: user._id,
          loginType: user.loginType,
          name: user.name,
          userName: user.userName,
          image: user.image,
          fcmToken: user.fcmToken,
          lastlogin: user.lastlogin,
        },
      });

      let trackerQuery = { loginType };
      if (loginType === 1) trackerQuery.mobileNumber = mobileNumber;
      if ([2, 4, 5].includes(loginType)) trackerQuery.email = email?.trim();
      if (loginType === 3) trackerQuery.identity = identity;

      const bonusTracker = await LoginBonusTracker.findOne(trackerQuery);
      const bonusCoins = bonusTracker ? 0 : (settingJSON.loginBonus ?? 5000);

      await Promise.all([updateWealthLevel(newUser._id)]);

      if (!bonusTracker && bonusCoins > 0) {
        await Promise.all([
          User.updateOne(
            { _id: user._id },
            {
              $inc: {
                coin: bonusCoins,
                loginRewardCoins: bonusCoins,
              },
            },
          ),
          LoginBonusTracker.create({ ...trackerQuery }),
          History.create({
            uniqueId: uniqueId,
            type: 1,
            otherUserId: user._id,
            coin: bonusCoins,
            date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
          }),
        ]);

        if (user.isPushNotificationEnabled && user.fcmToken) {
          const payload = {
            token: user.fcmToken,
            notification: {
              title: "🚀 Instant Bonus Activated! 🎁",
              body: "🎊 Hooray! You've unlocked a special welcome reward just for joining us. Enjoy your bonus! 💰",
            },
            data: {
              type: "LOGINBONUS",
            },
          };

          const adminInstance = await admin;
          adminInstance
            .messaging()
            .send(payload)
            .then((response) => console.log("Notification sent:", response))
            .catch((error) => console.log("Notification error:", error));
        }
      }
    }
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error("Error:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

//update profile of the user
exports.updateUserProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.uid) {
      if (req.file) deleteFile(req.file);
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = req.user.uid;

    const [user, existingUser] = await Promise.all([User.findOne({ firebaseUid: userId }), req.body.userName ? User.findOne({ userName: req.body.userName.trim() }).select("userName").lean() : null]);

    if (!user) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "User does not found." });
    }

    if (user.isBlock) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "you are blocked by the admin." });
    }

    if (req.body.userName) {
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        if (req.file) deleteFile(req.file);
        return res.status(200).json({ status: false, message: "This username is already taken by another user." });
      }

      user.userName = req.body.userName.trim();
    }

    res.status(200).json({ status: true, message: "The user's profile has been modified." });

    if (req?.file) {
      const currentImage = user?.image;

      if (currentImage && currentImage.includes("storage")) {
        const imagePath = path.join(__dirname, currentImage);
        const isDefaultFolder = currentImage.startsWith("storage/defaultphoto");

        if (!isDefaultFolder && fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath); // delete old image
          console.log("Old image deleted:", imagePath);
        }
      }

      user.image = req.file.path;
    }

    user.name = req.body.name ? req.body.name : user.name;
    user.age = req.body.age ? req.body.age : user.age;
    user.email = req.body.email ? req.body.email : user.email;
    user.mobileNumber = req.body.mobileNumber ? req.body.mobileNumber : user.mobileNumber;
    user.gender = req.body.gender ? req.body.gender?.toLowerCase()?.trim() : user.gender;
    user.bio = req.body.bio ? req.body.bio : user.bio;
    user.countryFlagImage = req.body.countryFlagImage ? req.body.countryFlagImage : user.countryFlagImage;
    user.country = req.body.country ? req.body.country.toLowerCase()?.trim() : user.country;
    user.videoCallRate = req.body.videoCallRate ? req.body.videoCallRate : user.videoCallRate;
    user.audioCallRate = req.body.audioCallRate ? req.body.audioCallRate : user.audioCallRate;
    await user.save();

    if (req?.file && settingJSON.postBanned) {
      const userImage = `${process.env.baseURL}${req?.file?.path}`;

      const checks = [];
      if (settingJSON.postBanned.includes("1")) checks.push("nudity-2.1");
      if (settingJSON.postBanned.includes("2")) checks.push("offensive");
      if (settingJSON.postBanned.includes("3")) checks.push("violence");
      if (settingJSON.postBanned.includes("4")) checks.push("gore-2.0");
      if (settingJSON.postBanned.includes("5")) checks.push("weapon");
      if (settingJSON.postBanned.includes("6")) checks.push("tobacco");
      if (settingJSON.postBanned.includes("7")) checks.push("recreational_drug,medical");
      if (settingJSON.postBanned.includes("8")) checks.push("gambling");
      if (settingJSON.postBanned.includes("9")) checks.push("alcohol");
      if (settingJSON.postBanned.includes("10")) checks.push("money");
      if (settingJSON.postBanned.includes("11")) checks.push("self-harm");

      console.log("Checks for user profile image moderation =====================================", checks);

      if (checks.length > 0 && userImage) {
        try {
          const response = await axios.get("https://api.sightengine.com/1.0/check.json", {
            params: {
              url: userImage,
              models: checks.join(","),
              api_user: settingJSON?.sightengineUser,
              api_secret: settingJSON?.sightengineApiSecret,
            },
          });

          const result = response.data;
          let isBanned = false;

          for (const check of checks) {
            if (
              check === "nudity-2.1" &&
              (result.nudity?.sexual_activity > 0.7 ||
                result.nudity?.sexual_display > 0.7 ||
                result.nudity?.erotica > 0.7 ||
                result.nudity?.very_suggestive > 0.7 ||
                result.nudity?.suggestive > 0.7 ||
                result.nudity?.mildly_suggestive > 0.7)
            ) {
              isBanned = true;
            }

            if (check === "offensive" && result.offensive?.prob > 0.7) isBanned = true;
            if (check === "violence" && result.violence?.prob > 0.7) isBanned = true;
            if (check === "gore-2.0" && result.gore?.prob > 0.7) isBanned = true;
            if (check === "weapon" && result.weapon?.prob > 0.7) isBanned = true;
            if (check === "tobacco" && result.tobacco?.prob > 0.7) isBanned = true;
            if (check === "recreational_drug,medical" && result.drugs?.prob > 0.7) isBanned = true;
            if (check === "gambling" && result.gambling?.prob > 0.7) isBanned = true;
            if (check === "alcohol" && result.alcohol?.prob > 0.7) isBanned = true;
            if (check === "money" && result.money?.prob > 0.7) isBanned = true;
            if (check === "self-harm" && result.selfharm?.prob > 0.7) isBanned = true;
          }

          await User.updateOne({ _id: user._id }, { isProfilePicBanned: isBanned });

          if (isBanned && user.isPushNotificationEnabled && user?.fcmToken !== null) {
            const payload = {
              token: user?.fcmToken,
              notification: {
                title: "⛔ Profile Alert: Action Needed! ⛔",
                body: "🚨 Heads up! Your profile picture needs an update to meet our community standards. Upload a valid image to continue hassle-free! 🎭",
              },
              data: {
                type: "PROFILE_PICTURE_BANNED",
              },
            };

            try {
              if (isBanned) {
                const adminPromise = await admin;
                const response = await adminPromise.messaging().send(payload);
                console.log("Successfully sent notification: ", response);
              } else {
                console.log("Profile picture not banned");
              }
            } catch (error) {
              console.error("Error sending notification: ", error);
            }
          }
        } catch (error) {
          console.log(`Error processing user profile image: ${userImage}:`, error.response?.data || error.message);
        }
      } else {
        console.log("No checks selected or no image URL provided.");
      }
    }
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get user profile
exports.fetchUserProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const [user, liveSession] = await Promise.all([
      User.findOne({ _id: userId })
        .populate("activeAvtarFrame", "type image")
        .populate("activeTheme", "type image")
        .populate("activeRide", "type image")
        .populate("wealthLevel", "level levelName levelImage coinThreshold permissions")
        .populate("hostLevel", "level name image")
        .lean(),
      LiveStreamer.findOne({ userId }).select("isPkMode liveType").lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    let status = "Offline";

    if (user.isOnline) status = "Online";
    if (user.isBusy) status = "Busy";
    if (user.isLive && liveSession) {
      if (liveSession.isPkMode) {
        status = "PK Live";
      } else if (liveSession.liveType === 2) {
        const hasSeatedUser = Array.isArray(liveSession.seat) ? liveSession.seat.some((seat) => seat.userId !== null) : false;

        status = hasSeatedUser ? "Live Audio" : "Online";
      } else if (liveSession.liveType === 1) {
        status = "Live Video";
      } else if (liveSession.liveType === 3) {
        status = "Multi Live";
      } else if (liveSession.liveType === 4) {
        status = "Call Join";
      }
    }

    user.status = status;

    res.status(200).json({
      status: true,
      message: "The user has retrieved their profile.",
      user,
    });

    const updates = [updateWealthLevel(userId)];
    if (Array.isArray(user.role) && user.role.includes(2) && user.agencyId) {
      updates.push(updateHostLevel(userId));
    }
    await Promise.all(updates);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get user profile (main)
exports.getUserInfo = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const [user, totalFollowers, totalFollowing, totalVisitors, totalFriendsResult, liveSession, hostApplication] = await Promise.all([
      User.findOne({ _id: userId })
        .select(
          "_id name userName image isProfilePicBanned uniqueId bio age gender countryFlagImage country isVerified coin receivedCoins loginRewardCoins wealthLevel receivedGifts role agencyId agencyOwnerId isOnline isBusy isLive isFake audioCallRate videoCallRate isAudioCallEnabled isVideoCallEnabled topUpCoins ",
        )
        .populate("wealthLevel", "level levelName levelImage coinThreshold permissions")
        .populate("hostLevel", "level name image")
        .populate("activeAvtarFrame", "type image")
        .lean(),
      FollowerFollowing.countDocuments({ toUserId: userId }).lean(),
      FollowerFollowing.countDocuments({ fromUserId: userId }).lean(),
      ProfileVisitor.countDocuments({ profileOwnerId: userId }).lean(),
      FollowerFollowing.aggregate([
        { $match: { fromUserId: userId } },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "toUserId",
            foreignField: "fromUserId",
            as: "mutualFollow",
          },
        },
        { $unwind: "$mutualFollow" },
        { $match: { "mutualFollow.toUserId": userId } },
        { $count: "totalFriends" },
      ]),
      LiveStreamer.findOne({ userId, liveHistoryId: { $ne: null } })
        .select("_id liveHistoryId isPkMode liveType seat isHostActiveInRoom privateCode audioLiveType blockedUsers")
        .lean(),
      HostApplication.findOne({ userId }).select("status reason reviewedAt createdAt").sort({ createdAt: -1 }).lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found!" });
    }

    const totalFriends = totalFriendsResult?.[0]?.totalFriends || 0;

    let status = "Offline";
    if (user.isOnline) status = "Online";
    if (user.isBusy) status = "Busy";
    if (user.isLive && liveSession) {
      if (liveSession.isPkMode) {
        status = "PK Live";
      } else if (liveSession.liveType === 2) {
        const hasSeatedUser = (Array.isArray(liveSession.seat) && liveSession.seat.some((seat) => seat?.userId !== null)) || liveSession.isHostActiveInRoom;

        if (hasSeatedUser) {
          status = "Live Audio";
        }
      } else if (liveSession.liveType === 1) {
        status = "Live Video";
      } else if (liveSession.liveType === 3) {
        status = "Multi Live";
      } else if (liveSession.liveType === 4) {
        status = "Call Join";
      }
    }

    res.status(200).json({
      status: true,
      message: "User profile retrieved successfully.",
      user: {
        ...user,
        hostApplicationStatus: hostApplication?.status || null,
        hostApplicationReason: hostApplication?.reason || "",
        hostApplicationReviewedAt: hostApplication?.reviewedAt || "",
        status,
        totalFollowers,
        totalFollowing,
        totalFriends,
        totalVisitors,
        liveUserObjId: liveSession?._id,
        liveHistoryId: liveSession?.liveHistoryId,
        liveType: liveSession?.liveType,
        isPkMode: liveSession?.isPkMode,
        privateCode: liveSession?.privateCode,
        audioLiveType: liveSession?.audioLiveType,
        blockedUsers: Array.isArray(liveSession?.blockedUsers) ? liveSession.blockedUsers.map((item) => item.blockedUserId.toString()) : [],
      },
    });

    const updates = [updateWealthLevel(userId)];
    if (Array.isArray(user.role) && user.role.includes(2) && user.agencyId) {
      updates.push(updateHostLevel(userId));
    }
    await Promise.all(updates);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//search users (chat)
exports.filterUsersBySearch = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const userSearchString = req.query.userSearchString ? req.query.userSearchString.trim() : "";

    const matchStage = {
      _id: { $ne: userId },
      isBlock: false,
    };

    if (userSearchString) {
      matchStage.$or = [{ name: { $regex: userSearchString, $options: "i" } }, { userName: { $regex: userSearchString, $options: "i" } }, { uniqueId: { $regex: userSearchString, $options: "i" } }];
    }

    const users = await User.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "blocks",
          localField: "_id",
          foreignField: "toUserId",
          pipeline: [
            {
              $match: {
                userId: userId,
              },
            },
          ],
          as: "isBlocked",
        },
      },
      {
        $match: {
          isBlocked: { $eq: [] },
        },
      },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "_id",
          foreignField: "toUserId",
          pipeline: [
            {
              $match: {
                fromUserId: userId,
              },
            },
          ],
          as: "isFollow",
        },
      },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "wealthLevel",
          foreignField: "_id",
          as: "wealthLevel",
        },
      },
      { $unwind: { path: "$wealthLevel", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "avtarframes",
          localField: "activeAvtarFrame",
          foreignField: "_id",
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          wealthLevel: { $ifNull: ["$wealthLevel.levelImage", ""] },
        },
      },
      {
        $project: {
          name: 1,
          userName: 1,
          image: 1,
          isProfilePicBanned: 1,
          age: 1,
          gender: 1,
          isVerified: 1,
          uniqueId: 1,
          country: 1,
          countryFlagImage: 1,
          coin: 1,
          isOnline: 1,
          isFake: 1,
          createdAt: 1,
          wealthLevel: 1,
          isFollow: { $gt: [{ $size: "$isFollow" }, 0] },
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
        },
      },
      { $sort: { createdAt: userSearchString ? 1 : -1 } },
      { $limit: userSearchString ? 100 : 20 },
    ]);

    return res.status(200).json({ status: true, message: "Success", searchData: users });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get toUser profile
exports.getTargetUserInfo = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    if (!req.query.toUserId) {
      return res.status(200).json({ status: false, message: "toUserId must be needed." });
    }

    const loginUserId = new mongoose.Types.ObjectId(req.user.userId);
    const userId = new mongoose.Types.ObjectId(req.query.toUserId);

    const [user, totalFollowers, totalFollowing, totalFriendsResult, totalVisitors, isFollowed, liveSession] = await Promise.all([
      User.findOne({ _id: userId })
        .select(
          "_id name userName image isProfilePicBanned uniqueId bio age gender countryFlagImage country isVerified coin wealthLevel receivedGifts role agencyId agencyOwnerId isOnline isBusy isLive isFake audioCallRate videoCallRate isAudioCallEnabled isVideoCallEnabled topUpCoins ",
        )
        .populate("wealthLevel", "levelImage")
        .populate("hostLevel", "level name image")
        .populate("activeAvtarFrame", "type image")
        .lean(),
      FollowerFollowing.countDocuments({ toUserId: userId }).lean(),
      FollowerFollowing.countDocuments({ fromUserId: userId }).lean(),
      FollowerFollowing.aggregate([
        { $match: { fromUserId: userId } },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "toUserId",
            foreignField: "fromUserId",
            as: "mutualFollow",
          },
        },
        { $unwind: "$mutualFollow" },
        { $match: { "mutualFollow.toUserId": userId } },
        { $count: "totalFriends" },
      ]),
      ProfileVisitor.countDocuments({ profileOwnerId: userId }).lean(),
      FollowerFollowing.exists({ fromUserId: loginUserId, toUserId: userId }),
      LiveStreamer.findOne({ userId, liveHistoryId: { $ne: null } })
        .select("_id liveHistoryId isPkMode liveType seat isHostActiveInRoom privateCode audioLiveType blockedUsers")
        .lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found!" });
    }

    const totalFriends = totalFriendsResult?.[0]?.totalFriends || 0;

    let status = "Offline";
    if (user.isOnline) status = "Online";
    if (user.isBusy) status = "Busy";
    if (user.isLive && liveSession) {
      if (liveSession.isPkMode) {
        status = "PK Live";
      } else if (liveSession.liveType === 2) {
        const hasSeatedUser = (Array.isArray(liveSession.seat) && liveSession.seat.some((seat) => seat?.userId !== null)) || liveSession.isHostActiveInRoom;

        if (hasSeatedUser) {
          status = "Live Audio";
        }
      } else if (liveSession.liveType === 1) {
        status = "Live Video";
      } else if (liveSession.liveType === 3) {
        status = "Multi Live";
      } else if (liveSession.liveType === 4) {
        status = "Call Join";
      }
    }

    return res.status(200).json({
      status: true,
      message: "User profile retrieved successfully.",
      user: {
        ...user,
        status,
        totalFollowers,
        totalFollowing,
        totalFriends,
        totalVisitors,
        isFollowed: !!isFollowed,
        liveUserObjId: liveSession?._id,
        liveHistoryId: liveSession?.liveHistoryId,
        liveType: liveSession?.liveType,
        isPkMode: liveSession?.isPkMode,
        privateCode: liveSession?.privateCode,
        audioLiveType: liveSession?.audioLiveType,
        blockedUsers: Array.isArray(liveSession?.blockedUsers) ? liveSession.blockedUsers.map((item) => item.blockedUserId.toString()) : [],
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//toggling the user's notification permission status
exports.toggleNotificationPermission = async (req, res, next) => {
  try {
    const userUid = req.headers["x-user-uid"];
    if (!userUid) {
      console.warn("⚠️ [AUTH] User UID missing.");
      return res.status(401).json({ status: false, message: "User UID required for authentication." });
    }

    const user = await User.findOne({ firebaseUid: userUid }).select("_id isPushNotificationEnabled");
    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    res.status(200).json({
      status: true,
      message: `Notifications have been ${user.isPushNotificationEnabled ? "enabled" : "disabled"} successfully.`,
    });

    user.isPushNotificationEnabled = !user.isPushNotificationEnabled;
    await user.save();
  } catch (error) {
    console.error("❌ Error toggling notification permission:", error);
    return res.status(500).json({ status: false, message: "An error occurred while updating notification permission." });
  }
};

//update the user's audio/video call permission status
exports.updateCallPermission = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const { isAudioCallEnabled, isVideoCallEnabled } = req.body || {};

    const isAudioProvided = typeof isAudioCallEnabled !== "undefined";
    const isVideoProvided = typeof isVideoCallEnabled !== "undefined";

    if (!isAudioProvided && !isVideoProvided) {
      return res.status(200).json({ status: false, message: "isAudioCallEnabled or isVideoCallEnabled is required." });
    }

    if (isAudioProvided && typeof isAudioCallEnabled !== "boolean") {
      return res.status(200).json({ status: false, message: "isAudioCallEnabled must be boolean." });
    }

    if (isVideoProvided && typeof isVideoCallEnabled !== "boolean") {
      return res.status(200).json({ status: false, message: "isVideoCallEnabled must be boolean." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const user = await User.findOne({ _id: userId }).select("_id isAudioCallEnabled isVideoCallEnabled");
    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (isAudioProvided) user.isAudioCallEnabled = isAudioCallEnabled;
    if (isVideoProvided) user.isVideoCallEnabled = isVideoCallEnabled;

    await user.save();

    return res.status(200).json({
      status: true,
      message: "Call permissions updated successfully.",
    });
  } catch (error) {
    console.error("❌ Error updating call permissions:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get user's coin
exports.fetchUserCoinBalance = async (req, res) => {
  try {
    const userUid = req.headers["x-user-uid"];
    if (!userUid) {
      console.warn("⚠️ [AUTH] User UID.");
      return res.status(401).json({ status: false, message: "User UID required for authentication." });
    }

    const user = await User.findOne({ firebaseUid: userUid }).select("_id coin").lean();
    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    return res.status(200).json({ status: true, message: "User coin balance retrieved successfully.", coinBalance: user.coin });
  } catch (error) {
    console.error("Error fetching user coin balance:", error);
    return res.status(500).json({ status: false, message: "An error occurred while retrieving user coin balance.", error: error.message });
  }
};

//search users (socialList/profileVisitor)
exports.searchUsersByType = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    if (!req.query.type) {
      return res.status(200).json({ status: false, message: "type must be passed valid." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const userSearchString = req.query.userSearchString?.trim() || "";
    const type = req.query.type?.trim();
    const start = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const userProjectFields = (prefix = "") => ({
      _id: `$${prefix}._id`,
      name: `$${prefix}.name`,
      userName: `$${prefix}.userName`,
      image: `$${prefix}.image`,
      isProfilePicBanned: `$${prefix}.isProfilePicBanned`,
      age: `$${prefix}.age`,
      isVerified: `$${prefix}.isVerified`,
      country: `$${prefix}.country`,
      countryFlagImage: `$${prefix}.countryFlagImage`,
      coin: `$${prefix}.coin`,
      uniqueId: `$${prefix}.uniqueId`,
      isOnline: `$${prefix}.isOnline`,
      date: `$${prefix}.createdAt`,
      wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
      avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
      avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
    });

    if (type === "friends") {
      const searchData = await FollowerFollowing.aggregate([
        { $match: { fromUserId: userId } },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "toUserId",
            foreignField: "fromUserId",
            as: "mutualFollow",
          },
        },
        { $unwind: "$mutualFollow" },
        { $match: { "mutualFollow.toUserId": userId } },
        {
          $lookup: {
            from: "users",
            localField: "toUserId",
            foreignField: "_id",
            as: "friendDetails",
          },
        },
        { $unwind: "$friendDetails" },
        {
          $match: {
            "friendDetails.isBlock": false,
            ...(userSearchString
              ? {
                  $or: [
                    { "friendDetails.name": { $regex: userSearchString, $options: "i" } },
                    { "friendDetails.userName": { $regex: userSearchString, $options: "i" } },
                    { "friendDetails.uniqueId": { $regex: userSearchString, $options: "i" } },
                  ],
                }
              : {}),
          },
        },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "friendDetails.wealthLevel",
            foreignField: "_id",
            as: "wealthDetails",
          },
        },
        { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "avtarframes",
            localField: "friendDetails.activeAvtarFrame",
            foreignField: "_id",
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            ...userProjectFields("friendDetails"),
            isFollow: true,
          },
        },
        { $skip: (start - 1) * limit },
        { $limit: limit },
      ]);

      return res.status(200).json({ status: true, message: "Friends fetched", searchData });
    }

    if (type === "followings") {
      const searchData = await FollowerFollowing.aggregate([
        { $match: { fromUserId: userId } },
        {
          $lookup: {
            from: "users",
            localField: "toUserId",
            foreignField: "_id",
            as: "followingDetails",
          },
        },
        { $unwind: "$followingDetails" },
        {
          $match: {
            "followingDetails.isBlock": false,
            ...(userSearchString
              ? {
                  $or: [
                    { "followingDetails.name": { $regex: userSearchString, $options: "i" } },
                    { "followingDetails.userName": { $regex: userSearchString, $options: "i" } },
                    { "followingDetails.uniqueId": { $regex: userSearchString, $options: "i" } },
                  ],
                }
              : {}),
          },
        },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "followingDetails.wealthLevel",
            foreignField: "_id",
            as: "wealthDetails",
          },
        },
        { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "avtarframes",
            localField: "followingDetails.activeAvtarFrame",
            foreignField: "_id",
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "followingDetails._id",
            foreignField: "toUserId",
            pipeline: [
              {
                $match: { fromUserId: userId },
              },
              { $project: { _id: 1 } },
              { $limit: 1 },
            ],
            as: "isFollowing",
          },
        },
        {
          $project: {
            ...userProjectFields("followingDetails"),
            isFollow: { $gt: [{ $size: "$isFollowing" }, 0] },
          },
        },
        { $skip: (start - 1) * limit },
        { $limit: limit },
      ]);

      return res.status(200).json({ status: true, message: "Followings fetched", searchData });
    }

    if (type === "followers") {
      const searchData = await FollowerFollowing.aggregate([
        { $match: { toUserId: userId } },
        {
          $lookup: {
            from: "users",
            localField: "fromUserId",
            foreignField: "_id",
            as: "followerDetails",
          },
        },
        { $unwind: "$followerDetails" },
        {
          $match: {
            "followerDetails.isBlock": false,
            ...(userSearchString
              ? {
                  $or: [
                    { "followerDetails.name": { $regex: userSearchString, $options: "i" } },
                    { "followerDetails.userName": { $regex: userSearchString, $options: "i" } },
                    { "followerDetails.uniqueId": { $regex: userSearchString, $options: "i" } },
                  ],
                }
              : {}),
          },
        },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "followerDetails.wealthLevel",
            foreignField: "_id",
            as: "wealthDetails",
          },
        },
        { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "avtarframes",
            localField: "followerDetails.activeAvtarFrame",
            foreignField: "_id",
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "followerDetails._id",
            foreignField: "toUserId",
            pipeline: [
              {
                $match: { fromUserId: userId },
              },
              { $project: { _id: 1 } },
              { $limit: 1 },
            ],
            as: "isFollowing",
          },
        },
        {
          $project: {
            ...userProjectFields("followerDetails"),
            isFollow: { $gt: [{ $size: "$isFollowing" }, 0] },
          },
        },
        { $skip: (start - 1) * limit },
        { $limit: limit },
      ]);

      return res.status(200).json({ status: true, message: "Followers fetched", searchData });
    }

    if (type === "visitors") {
      const searchData = await ProfileVisitor.aggregate([
        { $match: { profileOwnerId: userId } },
        {
          $lookup: {
            from: "users",
            localField: "visitorId",
            foreignField: "_id",
            as: "visitorDetails",
          },
        },
        { $unwind: "$visitorDetails" },
        {
          $match: {
            "visitorDetails.isBlock": false,
            ...(userSearchString
              ? {
                  $or: [
                    { "visitorDetails.name": { $regex: userSearchString, $options: "i" } },
                    { "visitorDetails.userName": { $regex: userSearchString, $options: "i" } },
                    { "visitorDetails.uniqueId": { $regex: userSearchString, $options: "i" } },
                  ],
                }
              : {}),
          },
        },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "visitorDetails.wealthLevel",
            foreignField: "_id",
            as: "wealthDetails",
          },
        },
        { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "avtarframes",
            localField: "visitorDetails.activeAvtarFrame",
            foreignField: "_id",
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "visitorDetails._id", // Visitor ni ID sathe match karse
            foreignField: "toUserId", // Jene follow karyo hoy teni ID
            pipeline: [
              {
                $match: {
                  userId: userId, // Current logged-in user potana account thi follow kare che ke nahi
                },
              },
            ],
            as: "followStatus",
          },
        },
        {
          $addFields: {
            isFollow: { $gt: [{ $size: "$followStatus" }, 0] },
          },
        },
        {
          $project: {
            ...userProjectFields("visitorDetails"),
            isFollow: 1,
          },
        },
        { $sort: { localVisitedAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
      ]);

      return res.status(200).json({ status: true, message: "Visitors fetched", searchData });
    }

    if (type === "visitedProfiles") {
      const searchData = await ProfileVisitor.aggregate([
        { $match: { visitorId: userId } },
        {
          $lookup: {
            from: "users",
            localField: "profileOwnerId",
            foreignField: "_id",
            as: "profileOwnerDetails",
          },
        },
        { $unwind: "$profileOwnerDetails" },
        {
          $match: {
            "profileOwnerDetails.isBlock": false,
            ...(userSearchString
              ? {
                  $or: [
                    { "profileOwnerDetails.name": { $regex: userSearchString, $options: "i" } },
                    { "profileOwnerDetails.userName": { $regex: userSearchString, $options: "i" } },
                    { "profileOwnerDetails.uniqueId": { $regex: userSearchString, $options: "i" } },
                  ],
                }
              : {}),
          },
        },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "profileOwnerDetails.wealthLevel",
            foreignField: "_id",
            as: "wealthDetails",
          },
        },
        { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "avtarframes",
            localField: "profileOwnerDetails.activeAvtarFrame",
            foreignField: "_id",
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "profileOwnerDetails._id", // Profile owner ni ID sathe match karse
            foreignField: "toUserId", // Jene follow karvama avyo che (target)
            pipeline: [
              {
                $match: {
                  fromUserId: userId, // Current user pote follower che ke nahi?
                },
              },
            ],
            as: "followStatus",
          },
        },
        {
          $addFields: {
            isFollow: { $gt: [{ $size: "$followStatus" }, 0] },
          },
        },
        {
          $project: {
            ...userProjectFields("profileOwnerDetails"),
            isFollow: 1,
          },
        },
        { $sort: { localVisitedAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
      ]);

      return res.status(200).json({ status: true, message: "Visited Profiles fetched", searchData });
    }

    return res.status(200).json({ status: false, message: "Invalid type" });
  } catch (error) {
    console.error("Error in searchUsersByType:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal server error." });
  }
};

//fetch users based on search input ( drop - down )
exports.getFilteredUserList = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized: Valid token with userId is required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.user.userId)) {
      return res.status(200).json({
        status: false,
        message: "Bad Request: Invalid userId format.",
      });
    }

    const { search = "" } = req.query;
    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const query = {
      isFake: false,
      isBlock: false,
      _id: { $ne: userId },
      ...(search !== "All" && search.trim() !== ""
        ? {
            $or: [{ name: { $regex: search, $options: "i" } }, { userName: { $regex: search, $options: "i" } }, { uniqueId: { $regex: search, $options: "i" } }],
          }
        : {}),
    };

    const users = await User.aggregate([
      { $match: query },
      {
        $lookup: {
          from: "blocks",
          localField: "_id", // Target user ni ID
          foreignField: "toUserId", // Blocks collection ma jene block karyo che te
          pipeline: [
            {
              $match: {
                userId: userId, // Check karse ke block karnar tame (current user) pote j chho
              },
            },
          ],
          as: "isBlocked",
        },
      },
      {
        $match: {
          isBlocked: { $eq: [] }, // Exclude users blocked by current user
        },
      },
      {
        $lookup: {
          from: "avtarframes",
          localField: "activeAvtarFrame",
          foreignField: "_id",
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: 1,
          userName: 1,
          uniqueId: 1,
          image: 1,
          isProfilePicBanned: 1,
          isVerified: 1,
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
        },
      },
      { $limit: 20 },
    ]);

    return res.status(200).json({
      status: true,
      message: "User list retrieved successfully.",
      data: users,
    });
  } catch (error) {
    console.error("Error in getFilteredUserList:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//delete user account
exports.deactivateMyAccount = async (req, res) => {
  try {
    // if (!req.user || !req.user.userId) {
    //   return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    // }

    // const userId = req.user.userId;

    // if (!mongoose.Types.ObjectId.isValid(userId)) {
    //   return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    // }

    const userUid = req.headers["x-user-uid"];
    if (!userUid) {
      console.warn("⚠️ [AUTH] User UID.");
      return res.status(401).json({ status: false, message: "User UID required for authentication." });
    }

    const user = await User.findOne({ firebaseUid: userUid }).lean();
    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    res.status(200).json({
      status: true,
      message: "User and related data successfully deleted.",
    });

    await deleteUserDataById(user._id, user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//fetch Searched Data by Type (For You, Accounts, Videos, Posts, Songs, Hashtags)
exports.retrieveSearchedContent = async (req, res) => {
  try {
    const { search = "" } = req.query || {};

    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized: Valid token with userId is required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.user.userId)) {
      return res.status(200).json({
        status: false,
        message: "Bad Request: Invalid userId format.",
      });
    }

    const currentUserId = new mongoose.Types.ObjectId(req.user.userId);

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    if (isNaN(start) || start <= 0 || isNaN(limit) || limit <= 0) {
      return res.status(200).json({
        status: false,
        message: "'start' and 'limit' must be valid positive integers.",
      });
    }

    const [accountResults, postResults, videoResults, hashtagResults, songResults] = await Promise.all([
      User.aggregate([
        {
          $match: {
            _id: { $ne: currentUserId },
            $or: [
              { uniqueId: { $regex: search, $options: "i" } },
              { name: { $regex: search, $options: "i" } },
              { mobileNumber: { $regex: search, $options: "i" } },
              { userName: { $regex: search, $options: "i" } },
            ],
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "avtarframes",
            localField: "activeAvtarFrame",
            foreignField: "_id",
            pipeline: [{ $project: { image: 1, type: 1 } }],
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "wealthLevel",
            foreignField: "_id",
            pipeline: [{ $project: { levelImage: 1 } }],
            as: "wealthDetails",
          },
        },
        { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "_id",
            foreignField: "toUserId",
            pipeline: [
              {
                $match: {
                  fromUserId: currentUserId,
                },
              },
            ],
            as: "isFollow",
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            userName: 1,
            image: 1,
            isProfilePicBanned: 1,
            isVerified: 1,
            countryFlagImage: 1,
            country: 1,
            gender: 1,
            age: 1,
            gender: 1,
            coin: 1,
            uniqueId: 1,
            isFake: 1,
            isOnline: 1,
            createdAt: 1,
            isFollow: { $gt: [{ $size: "$isFollow" }, 0] },
            avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
            avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
            wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
          },
        },
      ]),
      Post.aggregate([
        {
          $lookup: {
            from: "hashtags",
            localField: "hashTagId",
            foreignField: "_id",
            pipeline: [{ $project: { hashTag: 1 } }],
            as: "hashTag",
          },
        },
        {
          $match: {
            $or: [{ caption: { $regex: search, $options: "i" } }, { "hashTag.hashTag": { $regex: search, $options: "i" } }],
          },
        },
        {
          $addFields: {
            postImage: {
              $cond: {
                if: { $isArray: "$postImage" },
                then: {
                  $filter: {
                    input: "$postImage",
                    as: "image",
                    cond: { $eq: ["$$image.isBanned", false] },
                  },
                },
                else: [],
              },
            },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            pipeline: [{ $project: { name: 1, userName: 1, gender: 1, age: 1, country: 1, countryFlagImage: 1, image: 1, isProfilePicBanned: 1, isVerified: 1, isFake: 1, activeAvtarFrame: 1 } }],
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
        {
          $lookup: {
            from: "blocks",
            localField: "user._id",
            foreignField: "toUserId",
            pipeline: [{ $match: { userId: currentUserId, toUserId: "$user._id" } }, { $limit: 1 }],
            as: "isBlocked",
          },
        },
        {
          $match: {
            isBlocked: { $eq: [] },
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "mentionedUserIds",
            foreignField: "_id",
            as: "mentionedUsers",
          },
        },
        {
          $lookup: {
            from: "avtarframes",
            localField: "mentionedUsers.activeAvtarFrame",
            foreignField: "_id",
            as: "mentionedUsersAvtarFrames",
          },
        },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "mentionedUsers.wealthLevel",
            foreignField: "_id",
            as: "mentionedUsersWealthLevels",
          },
        },
        {
          $lookup: {
            from: "avtarframes",
            localField: "user.activeAvtarFrame",
            foreignField: "_id",
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "hashtags",
            localField: "hashTagId",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 1, hashTag: 1 } }],
            as: "hashTag",
          },
        },
        {
          $lookup: {
            from: "comments",
            localField: "_id",
            foreignField: "postId",
            as: "totalComments",
          },
        },
        {
          $lookup: {
            from: "likehistories",
            localField: "_id",
            foreignField: "postId",
            as: "totalLikes",
          },
        },
        {
          $lookup: {
            from: "likehistories",
            localField: "_id",
            foreignField: "postId",
            pipeline: [
              {
                $match: {
                  userId: currentUserId,
                },
              },
            ],
            as: "likeHistory",
          },
        },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "userId",
            foreignField: "toUserId",
            pipeline: [
              {
                $match: {
                  fromUserId: currentUserId,
                },
              },
            ],
            as: "isFollow",
          },
        },
        {
          $project: {
            postId: "$_id",
            caption: 1,
            shareCount: 1,
            postImage: 1,
            isFake: 1,
            createdAt: 1,
            hashTagId: "$hashTag._id",
            hashTag: "$hashTag.hashTag",
            userId: "$user._id",
            name: "$user.name",
            userName: "$user.userName",
            gender: "$user.gender",
            age: "$user.age",
            country: "$user.country",
            countryFlagImage: "$user.countryFlagImage",
            userImage: "$user.image",
            isProfilePicBanned: "$user.isProfilePicBanned",
            isVerified: "$user.isVerified",
            userIsFake: "$user.isFake",
            avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
            avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
            isLike: { $gt: [{ $size: "$likeHistory" }, 0] },
            isFollow: { $gt: [{ $size: "$isFollow" }, 0] },
            totalLikes: { $size: "$totalLikes" },
            totalComments: { $size: "$totalComments" },
            mentionedUsers: {
              $map: {
                input: "$mentionedUsers",
                as: "m",
                in: {
                  $let: {
                    vars: {
                      frame: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$mentionedUsersAvtarFrames",
                              as: "f",
                              cond: { $eq: ["$$f._id", "$$m.activeAvtarFrame"] },
                            },
                          },
                          0,
                        ],
                      },
                      wl: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$mentionedUsersWealthLevels",
                              as: "w",
                              cond: { $eq: ["$$w._id", "$$m.wealthLevel"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      _id: "$$m._id",
                      name: "$$m.name",
                      userName: "$$m.userName",
                      uniqueId: "$$m.uniqueId",
                      image: "$$m.image",
                      isProfilePicBanned: "$$m.isProfilePicBanned",
                      isVerified: "$$m.isVerified",
                      isFake: "$$m.isFake",
                      gender: "$$m.gender",
                      age: "$$m.age",
                      coin: "$$m.coin",
                      avtarFrame: { $ifNull: ["$$frame.image", ""] },
                      avtarFrameType: { $ifNull: ["$$frame.type", 0] },
                      wealthLevelImage: { $ifNull: ["$$wl.levelImage", ""] },
                    },
                  },
                },
              },
            },
            time: {
              $let: {
                vars: { timeDiff: { $subtract: [new Date(), "$createdAt"] } },
                in: {
                  $switch: {
                    branches: [
                      { case: { $gte: ["$$timeDiff", 31536000000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 31536000000] } } }, " years ago"] } },
                      { case: { $gte: ["$$timeDiff", 2592000000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 2592000000] } } }, " months ago"] } },
                      { case: { $gte: ["$$timeDiff", 604800000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 604800000] } } }, " weeks ago"] } },
                      { case: { $gte: ["$$timeDiff", 86400000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 86400000] } } }, " days ago"] } },
                      { case: { $gte: ["$$timeDiff", 3600000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 3600000] } } }, " hours ago"] } },
                      { case: { $gte: ["$$timeDiff", 60000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 60000] } } }, " minutes ago"] } },
                      { case: { $gte: ["$$timeDiff", 1000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 1000] } } }, " seconds ago"] } },
                      { case: true, then: "Just now" },
                    ],
                  },
                },
              },
            },
          },
        },
      ]),
      Video.aggregate([
        {
          $match: { isBanned: false },
        },
        {
          $lookup: {
            from: "hashtags",
            localField: "hashTagId",
            foreignField: "_id",
            pipeline: [{ $project: { hashTag: 1 } }],
            as: "hashTag",
          },
        },
        {
          $match: {
            $or: [{ caption: { $regex: search, $options: "i" } }, { "hashTag.hashTag": { $regex: search, $options: "i" } }],
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "user",
          },
        },
        {
          $unwind: {
            path: "$user",
            preserveNullAndEmptyArrays: false,
          },
        },
        {
          $lookup: {
            from: "blocks",
            localField: "user._id", // Video owner ni ID
            foreignField: "toUserId", // Blocks collection ma jene block karyo che te
            pipeline: [
              {
                $match: {
                  userId: currentUserId, // Block karnar tame (current user) pote j chho
                },
              },
            ],
            as: "isBlocked",
          },
        },
        { $match: { isBlocked: { $eq: [] } } },
        { $sort: { createdAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "mentionedUserIds",
            foreignField: "_id",
            as: "mentionedUsers",
          },
        },
        {
          $lookup: {
            from: "avtarframes",
            localField: "mentionedUsers.activeAvtarFrame",
            foreignField: "_id",
            as: "mentionedUsersAvtarFrames",
          },
        },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "mentionedUsers.wealthLevel",
            foreignField: "_id",
            as: "mentionedUsersWealthLevels",
          },
        },
        {
          $lookup: {
            from: "avtarframes",
            localField: "user.activeAvtarFrame",
            foreignField: "_id",
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "songs",
            localField: "songId",
            foreignField: "_id",
            as: "song",
          },
        },
        {
          $unwind: { path: "$song", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "hashtags",
            localField: "hashTagId",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 1, hashTag: 1 } }],
            as: "hashTag",
          },
        },
        {
          $lookup: {
            from: "comments",
            localField: "_id",
            foreignField: "videoId",
            as: "totalComments",
          },
        },
        {
          $lookup: {
            from: "likehistories",
            localField: "_id",
            foreignField: "videoId",
            as: "totalLikes",
          },
        },
        {
          $lookup: {
            from: "likehistories",
            localField: "_id",
            foreignField: "videoId",
            pipeline: [
              {
                $match: {
                  userId: currentUserId,
                },
              },
            ],
            as: "likeHistory",
          },
        },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "userId",
            foreignField: "toUserId",
            pipeline: [
              {
                $match: {
                  fromUserId: currentUserId,
                },
              },
            ],
            as: "isFollow",
          },
        },
        {
          $project: {
            _id: 1,
            caption: 1,
            isBanned: 1,
            videoImage: 1,
            videoUrl: 1,
            videoTime: 1,
            shareCount: 1,
            isFake: 1,
            songId: 1,
            createdAt: 1,
            songTitle: { $ifNull: ["$song.songTitle", ""] },
            songImage: { $ifNull: ["$song.songImage", ""] },
            songLink: { $ifNull: ["$song.songLink", ""] },
            singerName: { $ifNull: ["$song.singerName", ""] },
            hashTagId: "$hashTag._id",
            hashTag: "$hashTag.hashTag",
            userId: "$user._id",
            name: "$user.name",
            userName: "$user.userName",
            gender: "$user.gender",
            age: "$user.age",
            country: "$user.country",
            countryFlagImage: "$user.countryFlagImage",
            userImage: "$user.image",
            isProfilePicBanned: "$user.isProfilePicBanned",
            isVerified: "$user.isVerified",
            userIsFake: "$user.isFake",
            avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
            avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
            isLike: { $cond: { if: { $gt: [{ $size: "$likeHistory" }, 0] }, then: true, else: false } },
            isFollow: { $cond: { if: { $gt: [{ $size: "$isFollow" }, 0] }, then: true, else: false } },
            totalLikes: { $size: "$totalLikes" },
            totalComments: { $size: "$totalComments" },
            mentionedUsers: {
              $map: {
                input: "$mentionedUsers",
                as: "m",
                in: {
                  $let: {
                    vars: {
                      frame: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$mentionedUsersAvtarFrames",
                              as: "f",
                              cond: { $eq: ["$$f._id", "$$m.activeAvtarFrame"] },
                            },
                          },
                          0,
                        ],
                      },
                      wl: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$mentionedUsersWealthLevels",
                              as: "w",
                              cond: { $eq: ["$$w._id", "$$m.wealthLevel"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      _id: "$$m._id",
                      name: "$$m.name",
                      userName: "$$m.userName",
                      uniqueId: "$$m.uniqueId",
                      image: "$$m.image",
                      isProfilePicBanned: "$$m.isProfilePicBanned",
                      isVerified: "$$m.isVerified",
                      isFake: "$$m.isFake",
                      gender: "$$m.gender",
                      age: "$$m.age",
                      coin: "$$m.coin",
                      avtarFrame: { $ifNull: ["$$frame.image", ""] },
                      avtarFrameType: { $ifNull: ["$$frame.type", 0] },
                      wealthLevelImage: { $ifNull: ["$$wl.levelImage", ""] },
                    },
                  },
                },
              },
            },
            time: {
              $let: {
                vars: {
                  timeDiff: { $subtract: [new Date(), "$createdAt"] },
                },
                in: {
                  $concat: [
                    {
                      $switch: {
                        branches: [
                          {
                            case: { $gte: ["$$timeDiff", 31536000000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 31536000000] } } }, " years ago"] },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 2592000000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 2592000000] } } }, " months ago"] },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 604800000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 604800000] } } }, " weeks ago"] },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 86400000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 86400000] } } }, " days ago"] },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 3600000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 3600000] } } }, " hours ago"] },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 60000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 60000] } } }, " minutes ago"] },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 1000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 1000] } } }, " seconds ago"] },
                          },
                          { case: true, then: "Just now" },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ]),
      HashTag.aggregate([
        {
          $match: {
            hashTag: { $regex: search, $options: "i" },
          },
        },
        {
          $lookup: {
            from: "hashtagusagehistories",
            localField: "_id",
            foreignField: "hashTagId",
            as: "usageHistory",
          },
        },
        {
          $project: {
            _id: 1,
            hashTag: 1,
            totalVideo: {
              $size: {
                $filter: {
                  input: "$usageHistory",
                  as: "usage",
                  cond: { $ne: ["$$usage.videoId", null] },
                },
              },
            },
            totalPost: {
              $size: {
                $filter: {
                  input: "$usageHistory",
                  as: "usage",
                  cond: { $ne: ["$$usage.postId", null] },
                },
              },
            },
          },
        },
        {
          $sort: {
            totalVideo: -1,
            totalPost: -1,
          },
        },
        { $skip: (start - 1) * limit },
        { $limit: limit },
      ]),
      Song.aggregate([
        {
          $lookup: {
            from: "songcategories",
            localField: "songCategoryId",
            foreignField: "_id",
            pipeline: [{ $project: { name: 1, image: 1 } }],
            as: "songCategory",
          },
        },
        { $unwind: { path: "$songCategory", preserveNullAndEmptyArrays: true } },
        {
          $match: {
            $or: [{ songTitle: { $regex: search, $options: "i" } }, { singerName: { $regex: search, $options: "i" } }, { "songCategory.name": { $regex: search, $options: "i" } }],
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "videos",
            localField: "_id",
            foreignField: "songId",
            as: "videos",
          },
        },
        {
          $lookup: {
            from: "songfavorites",
            localField: "_id", // Song ni ID
            foreignField: "songId", // Favorite collection ma song ni ID
            pipeline: [
              {
                $match: {
                  userId: currentUserId, // Check karse ke aa song tame favorite karyu che ke nahi
                },
              },
            ],
            as: "isFavorite",
          },
        },
        {
          $project: {
            singerName: 1,
            songTitle: 1,
            songTime: 1,
            songLink: 1,
            songImage: 1,
            createdAt: 1,
            songCategoryName: "$songCategory.name",
            songCategoryImage: "$songCategory.image",
            isFavorite: { $gt: [{ $size: "$isFavorite" }, 0] },
            totalVideos: { $size: "$videos" },
          },
        },
      ]),
    ]);

    const accounts = accountResults;
    const posts = postResults;
    const videos = videoResults;
    const hashtags = hashtagResults;
    const songs = songResults;

    return res.status(200).json({
      status: true,
      message: "For You Feed fetched successfully",
      accounts,
      posts,
      videos,
      hashtags,
      songs,
    });
  } catch (error) {
    console.error("❌ For You Feed Error:", error);
    return res.status(500).json({ status: false, message: "Failed to fetch For You Feed", error: error.message });
  }
};
