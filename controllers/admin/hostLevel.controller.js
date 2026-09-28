const HostLevel = require("../../models/hostLevel.model");
const User = require("../../models/user.model");

const mongoose = require("mongoose");

const { deleteFile } = require("../../util/deletefile");
const updateHostLevel = require("../../util/updateHostLevel");

//create host level
exports.addHostLevel = async (req, res) => {
  try {
    let { name, description, requiredCoin, requiredLiveDuration } = req.body || {};

    name = name?.trim().toUpperCase();
    description = description?.trim();

    const coin = Number(requiredCoin);
    const duration = Number(requiredLiveDuration);

    if (!name || !description || !req.file) {
      if (req.file) deleteFile(req.file.path);
      return res.status(200).json({ status: false, message: "All fields including image are required" });
    }

    if (!Number.isFinite(coin) || !Number.isFinite(duration)) {
      deleteFile(req.file.path);
      return res.status(200).json({ status: false, message: "requiredCoin & requiredLiveDuration must be valid numbers" });
    }

    const [existing, lastLevel] = await Promise.all([HostLevel.exists({ name }), HostLevel.findOne().sort({ level: -1 }).select("level").lean()]);

    if (existing) {
      deleteFile(req.file.path);
      return res.status(200).json({ status: false, message: "Host level name already exists" });
    }

    const level = lastLevel ? lastLevel.level + 1 : 1;

    const hostLevel = await HostLevel.create({
      name,
      description,
      image: req.file ? req.file.path : "",
      level,
      requiredCoin: coin,
      requiredLiveDuration: duration,
    });

    return res.status(200).json({ status: true, message: "Host level created", data: hostLevel });
  } catch (error) {
    if (req.file) deleteFile(req.file.path);
    return res.status(500).json({ status: false, message: error.message });
  }
};

//update host level
exports.editHostLevel = async (req, res) => {
  try {
    let { levelId, name, description, requiredCoin, requiredLiveDuration } = req.body || {};

    if (!levelId || !mongoose.Types.ObjectId.isValid(levelId)) {
      if (req.file) deleteFile(req.file.path);
      return res.status(200).json({ status: false, message: "Valid levelId is required" });
    }

    const hostLevel = await HostLevel.findById(levelId);

    if (!hostLevel) {
      if (req.file) deleteFile(req.file.path);
      return res.status(200).json({ status: false, message: "Not found" });
    }

    if (name) {
      const existing = await HostLevel.exists({ name: name.trim().toUpperCase(), _id: { $ne: levelId } });

      if (existing) {
        if (req.file) deleteFile(req.file.path);
        return res.status(200).json({ status: false, message: "Host level name already exists" });
      }

      hostLevel.name = name.trim().toUpperCase();
    }

    if (description) hostLevel.description = description.trim();

    if (requiredCoin !== undefined) {
      const coin = Number(requiredCoin);
      if (!Number.isFinite(coin)) {
        return res.status(200).json({ status: false, message: "Invalid requiredCoin" });
      }
      hostLevel.requiredCoin = coin;
    }

    if (requiredLiveDuration !== undefined) {
      const duration = Number(requiredLiveDuration);
      if (!Number.isFinite(duration)) {
        return res.status(200).json({ status: false, message: "Invalid requiredLiveDuration" });
      }
      hostLevel.requiredLiveDuration = duration;
    }

    if (req.file) {
      if (hostLevel.image) deleteFile(hostLevel.image);
      hostLevel.image = req.file.path;
    }

    await hostLevel.save();

    return res.status(200).json({ status: true, message: "Host level updated", data: hostLevel });
  } catch (error) {
    if (req.file) deleteFile(req.file.path);
    return res.status(500).json({ status: false, message: error.message });
  }
};

//delete host level
exports.removeHostLevel = async (req, res) => {
  try {
    const { levelId } = req.query;

    if (!levelId || !mongoose.Types.ObjectId.isValid(levelId)) {
      return res.status(200).json({ status: false, message: "valid levelId is required" });
    }

    const hostLevel = await HostLevel.findById(levelId);

    if (!hostLevel) {
      return res.status(200).json({ status: false, message: "Not found" });
    }

    res.status(200).json({
      status: true,
      message: "Host level deleted",
    });

    const deletedLevel = hostLevel.level;
    const deletedLevelId = hostLevel._id;
    const affectedUserIds = await User.find({ hostLevel: deletedLevelId }).distinct("_id");

    if (hostLevel.image) {
      deleteFile(hostLevel.image);
    }

    await hostLevel.deleteOne();
    await Promise.all([
      HostLevel.updateMany({ level: { $gt: deletedLevel } }, { $inc: { level: -1 } }),
      ...affectedUserIds.map((userId) => updateHostLevel(userId)),
    ]);
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

//get host levels
exports.fetchHostLevels = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.start) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";

    const pipeline = [
      ...(search
        ? [
            {
              $match: {
                $or: [{ name: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }],
              },
            },
          ]
        : []),

      {
        $facet: {
          total: [{ $count: "count" }],
          data: [{ $sort: { level: 1 } }, { $skip: skip }, { $limit: limit }],
        },
      },
    ];

    const result = await HostLevel.aggregate(pipeline);

    const total = result[0]?.total[0]?.count || 0;
    const data = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Host levels Fetched",
      total,
      data,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message });
  }
};
