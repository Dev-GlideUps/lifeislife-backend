const WealthLevel = require("../../models/wealthLevel.model");

//fs
const fs = require("fs");

//deletefile
const { deleteFile } = require("../../util/deletefile");

//create wealthLevel
exports.createWealthLevel = async (req, res, next) => {
  try {
    const { level, levelName, coinThreshold } = req.body;
    const levelImage = req.file ? req.file.path : "";

    if (!level || !coinThreshold) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Oops! Invalid details." });
    }

    const existingLevel = await WealthLevel.findOne({ level }).select("_id").lean();
    if (existingLevel) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "This wealth level already exists." });
    }

    const wealthLevel = new WealthLevel({
      level,
      levelName,
      levelImage,
      coinThreshold,
    });

    await Promise.all([wealthLevel.save()]);

    return res.status(201).json({
      status: true,
      message: "Wealth level has been created successfully.",
      data: wealthLevel,
    });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update wealthLevel
exports.updateWealthLevel = async (req, res, next) => {
  try {
    const { levelId } = req.query;
    if (!levelId) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "levelId is required." });
    }

    const wealthLevel = await WealthLevel.findById(levelId).lean();
    if (!wealthLevel) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Wealth level not found." });
    }

    if (req.body.level) {
      const existingLevel = await WealthLevel.findOne({ level: req.body.level, _id: { $ne: levelId } });
      if (existingLevel) {
        if (req.file) deleteFile(req.file);
        return res.status(200).json({ status: false, message: `Level ${req.body.level} already exists.` });
      }
    }

    const updateFields = {
      level: req.body.level || wealthLevel.level,
      levelName: req.body.levelName || wealthLevel.levelName,
      coinThreshold: req.body.coinThreshold || wealthLevel.coinThreshold,
    };

    if (req.file) {
      if (wealthLevel.levelImage) {
        deleteFile(wealthLevel?.levelImage);
      }
      updateFields.levelImage = req.file.path;
    }

    await Promise.all([WealthLevel.findByIdAndUpdate(levelId, updateFields, { new: true })]);

    return res.status(200).json({
      status: true,
      message: "Wealth level has been updated successfully.",
      data: updateFields,
    });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update the specific permission
exports.updateWealthLevelPermissions = async (req, res, next) => {
  try {
    const { levelId } = req.body;

    if (!levelId) {
      return res.status(200).json({ status: false, message: "levelId is required." });
    }

    const validPermissionKeys = ["liveStreaming", "freeCall", "redeemCashout", "uploadSocialPost", "uploadVideo"];

    const updateObject = {};

    for (let key of validPermissionKeys) {
      if (key in req.body) {
        updateObject[`permissions.${key}`] = req.body[key];
      }
    }

    if (Object.keys(updateObject).length === 0) {
      return res.status(200).json({ status: false, message: "No valid permission keys provided." });
    }

    const wealthLevel = await WealthLevel.findById(levelId);
    if (!wealthLevel) {
      return res.status(200).json({ status: false, message: "Wealth level not found." });
    }

    await WealthLevel.updateOne({ _id: levelId }, { $set: updateObject });

    return res.status(200).json({
      status: true,
      message: "Permissions updated successfully.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get wealthLevel
exports.getWealthLevels = async (req, res, next) => {
  try {
    const wealthLevels = await WealthLevel.find().sort({ level: 1 }).select("-__v").lean();

    return res.status(200).json({
      status: true,
      message: "Retrieved wealth levels successfully.",
      data: wealthLevels,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//delete wealthLevel
exports.deleteWealthLevel = async (req, res, next) => {
  try {
    const { levelId } = req.query;
    if (!levelId) {
      return res.status(200).json({ status: false, message: "levelId is required." });
    }

    const wealthLevel = await WealthLevel.findById(levelId).select("_id levelImage").lean();
    if (!wealthLevel) {
      return res.status(200).json({ status: false, message: "Wealth level not found." });
    }

    res.status(200).json({ status: true, message: "Wealth level has been deleted successfully." });

    if (wealthLevel.levelImage) {
      deleteFile(wealthLevel?.levelImage);
    }

    await WealthLevel.deleteOne({ _id: wealthLevel._id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
