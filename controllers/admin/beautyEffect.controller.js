const BeautyEffect = require("../../models/beautyEffect.model");

const { deleteFile, deleteFiles } = require("../../util/deletefile");
const fs = require("fs");

// Create Beauty Effect
exports.createBeautyEffect = async (req, res) => {
  try {
    const { title } = req.body || {};

    if (!title) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "title is required." });
    }

    if (!req.files?.effect) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "effect file is required." });
    }

    const beautyEffect = new BeautyEffect({
      title: title.trim(),
      icon: req.files?.icon ? req.files.icon[0].path : "",
      effect: req.files.effect[0].path,
      isActive: true,
    });

    await beautyEffect.save();

    return res.status(200).json({
      status: true,
      message: "Beauty effect created successfully.",
      data: beautyEffect,
    });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Update Beauty Effect
exports.updateBeautyEffect = async (req, res) => {
  try {
    const { effectId, title, isActive } = req.body || {};

    if (!effectId) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "effectId is required." });
    }

    const beautyEffect = await BeautyEffect.findById(effectId);
    if (!beautyEffect) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Beauty effect not found." });
    }

    if (title) beautyEffect.title = title.trim();
    if (typeof isActive === "boolean") beautyEffect.isActive = isActive;

    if (req.files?.icon) {
      if (beautyEffect.icon) {
        deleteFile(beautyEffect.icon);
      }
      beautyEffect.icon = req.files.icon[0].path;
    }

    if (req.files?.effect) {
      if (beautyEffect.effect) {
        deleteFile(beautyEffect.effect);
      }
      beautyEffect.effect = req.files.effect[0].path;
    }

    await beautyEffect.save();

    return res.status(200).json({
      status: true,
      message: "Beauty effect updated successfully.",
      data: beautyEffect,
    });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Get Beauty Effects
exports.getBeautyEffects = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.start) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === "true";
    }

    const [effects, totalRecords] = await Promise.all([BeautyEffect.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), BeautyEffect.countDocuments(filter)]);

    return res.status(200).json({
      status: true,
      message: "Beauty effects retrieved successfully.",
      totalRecords,
      data: effects,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

// Enable / Disable Beauty Effect
exports.toggleBeautyEffectStatus = async (req, res) => {
  try {
    const { effectId, isActive } = req.body;

    if (!effectId || typeof isActive !== "boolean") {
      return res.status(200).json({ status: false, message: "effectId and isActive are required." });
    }

    const effect = await BeautyEffect.findByIdAndUpdate(effectId, { isActive }, { new: true });

    if (!effect) {
      return res.status(200).json({ status: false, message: "Beauty effect not found." });
    }

    return res.status(200).json({
      status: true,
      message: `Beauty effect ${isActive ? "activated" : "deactivated"} successfully.`,
      data: effect,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Delete Beauty Effect
exports.deleteBeautyEffect = async (req, res) => {
  try {
    const { effectId } = req.query;

    if (!effectId) {
      return res.status(200).json({ status: false, message: "effectId is required." });
    }

    const effect = await BeautyEffect.findById(effectId);
    if (!effect) {
      return res.status(200).json({ status: false, message: "Beauty effect not found." });
    }

    if (effect.icon) {
      deleteFile(effect.icon);
    }

    if (effect.effect) {
      deleteFile(effect.effect);
    }

    await BeautyEffect.findByIdAndDelete(effectId);

    return res.status(200).json({
      status: true,
      message: "Beauty effect deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
