const mongoose = require("mongoose");

const Announcement = require("../../models/announcement.model");

const { deleteFile, deleteFiles } = require("../../util/deletefile");

// create Announcement (all users or user-wise)
exports.createAnnouncement = async (req, res) => {
  try {
    let { title, message, redirectUrl = "", audienceType = "all", userId = null, mediaType = "" } = req.body || {};

    if (!title?.trim() || !message?.trim()) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "title and message are required!" });
    }

    audienceType = String(audienceType || "all")
      .trim()
      .toLowerCase();
    if (!["all", "user"].includes(audienceType)) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Invalid audienceType. Use all|user." });
    }

    mediaType = String(mediaType || "")
      .trim()
      .toLowerCase();
    if (!["", "image", "video"].includes(mediaType)) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Invalid mediaType. Use image|video." });
    }

    const media = req.files?.media?.[0]?.path || "";
    let thumbnail = req.files?.thumbnail?.[0]?.path || "";

    if ((req.files?.media?.length || req.files?.thumbnail?.length) && !mediaType) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "mediaType is required when media file is uploaded." });
    }

    if (mediaType === "video") {
      if (!media) {
        if (req.files) deleteFiles(req.files);
        return res.status(200).json({ status: false, message: "media file is required when mediaType is video." });
      }
      if (!thumbnail) {
        if (req.files) deleteFiles(req.files);
        return res.status(200).json({ status: false, message: "thumbnail is required when mediaType is video." });
      }
    } else {
      thumbnail = "";
      if (req.files?.thumbnail?.[0]) {
        deleteFile(req.files.thumbnail[0]);
      }
    }

    let targetUserId = null;
    if (audienceType === "user") {
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        if (req.files) deleteFiles(req.files);
        return res.status(200).json({ status: false, message: "Valid userId is required for audienceType=user." });
      }
      targetUserId = new mongoose.Types.ObjectId(userId);
    }

    const announcement = await Announcement.create({
      title: title.trim(),
      message: message.trim(),
      mediaType,
      media,
      thumbnail,
      redirectUrl: redirectUrl ? String(redirectUrl).trim() : "",
      audienceType,
      userId: targetUserId,
    });

    return res.status(200).json({
      status: true,
      message: "Announcement created successfully.",
      data: announcement,
    });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    console.error("createAnnouncement error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

// list announcements
exports.fetchAnnouncementList = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const { isActive = "All", audienceType = "All", search = "" } = req.query || {};

    const match = {};
    if (isActive !== "All") match.isActive = String(isActive) === "true";
    if (audienceType !== "All") match.audienceType = String(audienceType).trim().toLowerCase();

    let searchMatch = null;
    if (search && String(search).trim()) {
      const s = String(search).trim();
      searchMatch = {
        $or: [
          { title: { $regex: s, $options: "i" } },
          { message: { $regex: s, $options: "i" } },
          { "user.name": { $regex: s, $options: "i" } },
          { "user.name": { $regex: s, $options: "i" } },
          { "user.uniqueId": { $regex: s, $options: "i" } },
        ],
      };
    }

    const result = await Announcement.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                userName: 1,
                image: 1,
                isProfilePicBanned: 1,
                countryFlagImage: 1,
                country: 1,
                uniqueId: 1,
                isVerified: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      ...(searchMatch ? [{ $match: searchMatch }] : []),
      {
        $facet: {
          total: [{ $count: "count" }],
          data: [
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $project: {
                title: 1,
                message: 1,
                mediaType: 1,
                media: 1,
                thumbnail: 1,
                redirectUrl: 1,
                audienceType: 1,
                userId: 1,
                user: 1,
                isActive: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
        },
      },
    ]);

    const total = result?.[0]?.total?.[0]?.count || 0;
    const data = result?.[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Announcements retrieved successfully.",
      total,
      data,
    });
  } catch (error) {
    console.error("fetchAnnouncementList error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

// toggle active announcement
exports.toggleAnnouncementActiveState = async (req, res) => {
  try {
    const { announcementId } = req.query;
    if (!announcementId || !mongoose.Types.ObjectId.isValid(announcementId)) {
      return res.status(200).json({ status: false, message: "announcementId is required." });
    }

    const announcement = await Announcement.findById(announcementId).select("isActive").lean();
    if (!announcement) {
      return res.status(200).json({ status: false, message: "Announcement not found." });
    }

    const updated = await Announcement.findByIdAndUpdate(announcementId, { isActive: !announcement.isActive }, { new: true, select: "isActive" }).lean();

    return res.status(200).json({ status: true, message: "Announcement status updated successfully", data: updated });
  } catch (error) {
    console.error("toggleAnnouncementActiveState error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

// delete announcement
exports.removeAnnouncement = async (req, res) => {
  try {
    const { announcementId } = req.query;
    if (!announcementId || !mongoose.Types.ObjectId.isValid(announcementId)) {
      return res.status(200).json({ status: false, message: "announcementId is required." });
    }

    const announcement = await Announcement.findById(announcementId).select("_id media thumbnail").lean();
    if (!announcement) {
      return res.status(200).json({ status: false, message: "Announcement not found." });
    }

    res.status(200).json({ status: true, message: "Announcement deleted successfully" });

    if (announcement.media) {
      deleteFile({ path: announcement.media });
    }
    if (announcement.thumbnail) {
      deleteFile({ path: announcement.thumbnail });
    }

    await Announcement.deleteOne({ _id: announcementId });
  } catch (error) {
    console.error("removeAnnouncement error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
