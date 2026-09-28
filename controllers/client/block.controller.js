const Block = require("../../models/block.model");

//import model
const User = require("../../models/user.model");
const FollowerFollowing = require("../../models/followerFollowing.model");
const ProfileVisitor = require("../../models/profileVisitor.model");

//mongoose
const mongoose = require("mongoose");

//block or unblock user
exports.manageUserBlockStatus = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    if (!req.query.toUserId) {
      return res.status(200).json({ status: false, message: "Missing required parameter: toUserId." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.toUserId)) {
      return res.status(200).json({ status: false, message: "Invalid toUserId. Please provide a valid ObjectId." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const toUserId = new mongoose.Types.ObjectId(req.query.toUserId);

    const [targetUser, existingBlockStatus] = await Promise.all([User.findById(toUserId).select("_id").lean(), Block.findOne({ userId, toUserId }).select("_id").lean()]);

    if (!targetUser) {
      return res.status(200).json({ status: false, message: "Target user not found." });
    }

    if (existingBlockStatus) {
      res.status(200).json({
        status: true,
        message: "The user has been successfully unblocked.",
        isBlocked: false,
      });

      await Block.deleteOne({ userId, toUserId });
    } else {
      res.status(200).json({
        status: true,
        message: "The user has been successfully blocked.",
        isBlocked: true,
      });

      await Promise.all([
        FollowerFollowing.deleteMany({
          $or: [
            { fromUserId: userId, toUserId: toUserId },
            { toUserId: userId, fromUserId: toUserId },
          ],
        }),
        ProfileVisitor.deleteMany({
          $or: [
            { visitorId: userId, profileOwnerId: toUserId },
            { profileOwnerId: userId, visitorId: toUserId },
          ],
        }),
        new Block({ userId, toUserId }).save(),
      ]);
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An unexpected error occurred while processing the request." });
  }
};

//get blocked user
exports.listBlockedUsers = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const blockedUsersList = await Block.find({ userId })
      .select("toUserId")
      .populate({
        path: "toUserId",
        select: "name userName image isProfilePicBanned countryFlagImage country activeAvtarFrame isVerified",
        populate: {
          path: "activeAvtarFrame",
          select: "image type",
        },
      })
      .skip((start - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({
      status: true,
      message: blockedUsersList.length > 0 ? "Blocked users fetched successfully." : "No blocked users found.",
      blockedUsers: blockedUsersList,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, message: "An unexpected error occurred while fetching the blocked users." });
  }
};
