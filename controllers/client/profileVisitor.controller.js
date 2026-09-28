const ProfileVisitor = require("../../models/profileVisitor.model");
const User = require("../../models/user.model");

//mongoose
const mongoose = require("mongoose");

//profile visit of the user
exports.recordProfileVisit = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const visitorId = new mongoose.Types.ObjectId(req.user.userId); // Extracted from Firebase token
    const { profileOwnerId } = req.query; // ID of the profile being visited

    if (!mongoose.Types.ObjectId.isValid(profileOwnerId)) {
      return res.status(200).json({ status: false, message: "Invalid profileOwnerId." });
    }

    if (visitorId.toString() === profileOwnerId.toString()) {
      return res.status(200).json({ status: false, message: "Users cannot visit their own profile." });
    }

    const profileOwner = await User.findById(profileOwnerId).lean();
    if (!profileOwner) {
      return res.status(200).json({ status: false, message: "Profile owner not found." });
    }

    res.status(200).json({ status: true, message: "Profile visit recorded." });

    await ProfileVisitor.updateOne(
      {
        visitorId: visitorId,
        profileOwnerId: profileOwner._id,
      },
      {
        $set: {
          visitedAt: new Date(), // Date for auto-deletion (TTL index)
          localVisitedAt: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }), // Local time
        },
      },
      { upsert: true },
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//retrieves both profile visitors and visited profiles
exports.fetchVisitedProfilesAndVisitors = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const [profileVisitors, visitedProfiles] = await Promise.all([
      ProfileVisitor.aggregate([
        { $match: { profileOwnerId: userId } },
        { $sort: { visitedAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "visitorId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                  userName: 1,
                  image: 1,
                  isProfilePicBanned: 1,
                  age: 1,
                  isVerified: 1,
                  country: 1,
                  countryFlagImage: 1,
                  coin: 1,
                  uniqueId: 1,
                  isOnline: 1,
                  wealthLevel: 1,
                  activeAvtarFrame: 1,
                },
              },
            ],
            as: "visitorDetails",
          },
        },
        { $unwind: { path: "$visitorDetails", preserveNullAndEmptyArrays: false } },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "visitorDetails.wealthLevel",
            foreignField: "_id",
            pipeline: [{ $project: { levelImage: 1 } }],
            as: "wealthDetails",
          },
        },
        { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "avtarframes",
            localField: "visitorDetails.activeAvtarFrame",
            foreignField: "_id",
            pipeline: [{ $project: { image: 1, type: 1 } }],
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "visitorDetails._id",
            foreignField: "toUserId", //visitorId
            pipeline: [{ $match: { fromUserId: userId } }, { $limit: 1 }], //currentUser
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
            _id: "$visitorDetails._id",
            name: "$visitorDetails.name",
            userName: "$visitorDetails.userName",
            image: "$visitorDetails.image",
            isProfilePicBanned: "$visitorDetails.isProfilePicBanned",
            age: "$visitorDetails.age",
            isVerified: "$visitorDetails.isVerified",
            country: "$visitorDetails.country",
            countryFlagImage: "$visitorDetails.countryFlagImage",
            coin: "$visitorDetails.coin",
            uniqueId: "$visitorDetails.uniqueId",
            isOnline: "$visitorDetails.isOnline",
            wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
            avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
            avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
            date: "$visitedAt",
            isFollow: 1,
          },
        },
      ]), // Fetch Profile Visitors (Users who visited my profile)
      ProfileVisitor.aggregate([
        { $match: { visitorId: userId } },
        { $sort: { visitedAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "profileOwnerId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                  userName: 1,
                  image: 1,
                  isProfilePicBanned: 1,
                  age: 1,
                  isVerified: 1,
                  country: 1,
                  countryFlagImage: 1,
                  coin: 1,
                  uniqueId: 1,
                  isOnline: 1,
                  wealthLevel: 1,
                  activeAvtarFrame: 1,
                },
              },
            ],
            as: "profileOwnerDetails",
          },
        },
        { $unwind: "$profileOwnerDetails" },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "profileOwnerDetails.wealthLevel",
            foreignField: "_id",
            pipeline: [{ $project: { levelImage: 1 } }],
            as: "wealthDetails",
          },
        },
        { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "avtarframes",
            localField: "profileOwnerDetails.activeAvtarFrame",
            foreignField: "_id",
            pipeline: [{ $project: { image: 1, type: 1 } }],
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "profileOwnerDetails._id",
            foreignField: "toUserId", //profileOwnerId
            pipeline: [{ $match: { fromUserId: userId } }, { $limit: 1 }], //currentUser
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
            _id: "$profileOwnerDetails._id",
            name: "$profileOwnerDetails.name",
            userName: "$profileOwnerDetails.userName",
            image: "$profileOwnerDetails.image",
            isProfilePicBanned: "$profileOwnerDetails.isProfilePicBanned",
            age: "$profileOwnerDetails.age",
            isVerified: "$profileOwnerDetails.isVerified",
            country: "$profileOwnerDetails.country",
            countryFlagImage: "$profileOwnerDetails.countryFlagImage",
            coin: "$profileOwnerDetails.coin",
            uniqueId: "$profileOwnerDetails.uniqueId",
            isOnline: "$profileOwnerDetails.isOnline",
            wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
            avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
            avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
            date: "$visitedAt",
            isFollow: 1,
          },
        },
      ]), // Fetch Visited Profiles (Profiles visited by the authenticated user)
    ]);

    return res.status(200).json({
      status: true,
      message: "Profile visitors and visited profiles retrieved successfully.",
      profileVisitors,
      visitedProfiles,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

//get the list of users who visited my profile
exports.getProfileVisitors = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const profileOwnerId = new mongoose.Types.ObjectId(req.user.userId);

    const visitors = await ProfileVisitor.aggregate([
      { $match: { profileOwnerId: mongoose.Types.ObjectId(profileOwnerId) } },
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
          from: "followerfollowings",
          localField: "visitorDetails._id",
          foreignField: "toUserId",
          pipeline: [{ $match: { fromUserId: profileOwnerId } }, { $limit: 1 }], // Checking if user follows the visitor
          as: "followStatus",
        },
      },
      {
        $addFields: {
          isFollow: { $gt: [{ $size: "$followStatus" }, 0] }, // If followStatus array has elements, isFollow is true
        },
      },
      {
        $project: {
          _id: "$visitorDetails._id",
          name: "$visitorDetails.name",
          image: "$visitorDetails.image",
          age: "$visitorDetails.age",
          uniqueId: "$visitorDetails.uniqueId",
          wealthLevelImage: "$wealthDetails.levelImage",
          localVisitedAt: 1,
          isFollow: 1,
        },
      },
      { $sort: { localVisitedAt: -1 } },
      { $limit: 50 },
    ]);

    return res.status(200).json({
      status: true,
      message: "Profile visitors retrieved successfully.",
      visitors,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

//get the list of profiles visited by the authenticated user
exports.getVisitedProfiles = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const visitorId = new mongoose.Types.ObjectId(req.user.userId);

    const visitedProfiles = await ProfileVisitor.aggregate([
      { $match: { visitorId: mongoose.Types.ObjectId(visitorId) } },
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
          from: "followerfollowings",
          localField: "profileOwnerDetails._id",
          foreignField: "toUserId",
          pipeline: [{ $match: { fromUserId: visitorId } }, { $limit: 1 }], // Checking if user follows the profile owner
          as: "followStatus",
        },
      },
      {
        $addFields: {
          isFollow: { $gt: [{ $size: "$followStatus" }, 0] }, // If followStatus array has elements, isFollow is true
        },
      },
      {
        $project: {
          _id: "$profileOwnerDetails._id",
          name: "$profileOwnerDetails.name",
          image: "$profileOwnerDetails.image",
          age: "$profileOwnerDetails.age",
          uniqueId: "$profileOwnerDetails.uniqueId",
          wealthLevelImage: "$wealthDetails.levelImage",
          localVisitedAt: 1,
          isFollow: 1,
        },
      },
      { $sort: { localVisitedAt: -1 } },
      { $limit: 50 },
    ]);

    return res.status(200).json({
      status: true,
      message: "Visited profiles retrieved successfully.",
      visitedProfiles,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};
