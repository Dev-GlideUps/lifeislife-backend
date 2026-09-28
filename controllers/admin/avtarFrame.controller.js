const AvtarFrame = require("../../models/avtarFrame.model");
const User = require("../../models/user.model");

//fs
const fs = require("fs");

//deletefile
const { deleteFile, deleteFiles } = require("../../util/deletefile");

//Create Avatar Frame
exports.createAvtarFrame = async (req, res) => {
  try {
    const { name, coin, validity, validityType, type } = req.body;
    const image = req.files ? req.files.image[0].path : "";
    const svgaImage = req.files.svgaImage ? req.files?.svgaImage[0]?.path : "";

    const parsedType = Number(type);
    const parsedValidityType = Number(validityType);

    if (!name || !coin || !validity || !validityType || !type) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Oops! Invalid details." });
    }

    if (![1, 2, 3].includes(parsedValidityType)) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Invalid validity type. Choose 1 (Day), 2 (Month), or 3 (Year)." });
    }

    if (![1, 2, 3].includes(parsedType)) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Invalid type. Choose 1 (Image), 2 (GIF), or 3 (SVGA)." });
    }

    const avtarFrame = await new AvtarFrame({
      name,
      type: parsedType,
      image,
      svgaImage,
      coin,
      validity,
      validityType: parsedValidityType,
    }).save();

    return res.status(200).json({
      status: true,
      message: "Avatar Frame has been created successfully.",
      data: avtarFrame,
    });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//Update Avatar Frame
exports.updateAvtarFrame = async (req, res) => {
  try {
    if (!req.query.frameId) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "frameId must be required." });
    }

    const avtarFrame = await AvtarFrame.findById(req.query.frameId);
    if (!avtarFrame) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Avatar Frame not found." });
    }

    avtarFrame.name = req.body.name || avtarFrame.name;
    avtarFrame.coin = req.body.coin || avtarFrame.coin;
    avtarFrame.validity = req.body.validity || avtarFrame.validity;
    avtarFrame.type = req.body.type || avtarFrame.type;

    if (req.body.validityType) {
      const parsedValidityType = Number(req.body.validityType);
      if (![1, 2, 3].includes(parsedValidityType)) {
        return res.status(200).json({ status: false, message: "Invalid validity type. Choose 1 (Day), 2 (Month), or 3 (Year)." });
      }
      avtarFrame.validityType = parsedValidityType;
    }

    if (req.files.image) {
      if (avtarFrame.image) {
        deleteFile(avtarFrame.image);
      }
      avtarFrame.image = req.files.image ? req.files.image[0].path : avtarFrame.image;
    }

    if (req.body.type === 3 && req.files.svgaImage) {
      if (avtarFrame.svgaImage) {
        deleteFile(avtarFrame.svgaImage);
      }
      avtarFrame.svgaImage = req.files.svgaImage ? req.files.svgaImage[0].path : avtarFrame.svgaImage;
    }

    await avtarFrame.save();

    return res.status(200).json({
      status: true,
      message: "Avatar Frame has been updated successfully.",
      data: avtarFrame,
    });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//toggling avatar frame isActive status
exports.toggleAvtarFrameStatus = async (req, res, next) => {
  try {
    const { avtarFrameId } = req.query;

    if (!avtarFrameId) {
      return res.status(200).json({ status: false, message: "Avtar Frame ID is required." });
    }

    const avtarFrame = await AvtarFrame.findById(avtarFrameId);
    if (!avtarFrame) {
      return res.status(200).json({ status: false, message: "Avtar Frame not found." });
    }

    avtarFrame.isActive = !avtarFrame.isActive;
    await avtarFrame.save();

    return res.status(200).json({
      status: true,
      message: `Avtar Frame has been ${avtarFrame.isActive ? "enabled" : "disabled"} successfully.`,
      data: avtarFrame,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating Avtar Frame status." });
  }
};

//toggling avatar frame recommendation
exports.toggleAvtarFrameRecommendation = async (req, res, next) => {
  try {
    const { avtarFrameId } = req.query;

    if (!avtarFrameId) {
      return res.status(200).json({ status: false, message: "Avtar Frame ID is required." });
    }

    const avtarFrame = await AvtarFrame.findById(avtarFrameId);
    if (!avtarFrame) {
      return res.status(200).json({ status: false, message: "Avtar Frame not found." });
    }

    avtarFrame.isRecommended = !avtarFrame.isRecommended;
    await avtarFrame.save();

    return res.status(200).json({
      status: true,
      message: `Avtar Frame has been ${avtarFrame.isRecommended ? "recommended" : "not recommended"} successfully.`,
      data: avtarFrame,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating Avtar Frame status." });
  }
};

//Get Avatar Frames
exports.getAvtarFrames = async (req, res) => {
  try {
    const avtarFrames = await AvtarFrame.find({ isDelete: false }).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Retrieved Avatar Frames successfully.",
      data: avtarFrames,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//Delete Avatar Frame
exports.deleteAvtarFrame = async (req, res) => {
  try {
    const { frameId } = req.query;

    if (!frameId) {
      return res.status(200).json({ status: false, message: "frameId is required." });
    }

    const avtarFrame = await AvtarFrame.findById(frameId).select("_id image").lean();
    if (!avtarFrame) {
      return res.status(200).json({ status: false, message: "Avatar Frame not found." });
    }

    res.status(200).json({ status: true, message: "Avatar Frame has been deleted successfully." });

    await Promise.all([
      //User.updateMany({ activeAvtarFrame: frameId }, { $set: { activeAvtarFrame: null } }),
      AvtarFrame.updateOne({ _id: frameId }, { $set: { isDelete: true } }),
    ]);
  } catch (error) {
    console.error("Error in deleteAvtarFrame:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error." });
  }
};

//Get avatar frames dropdown
exports.fetchAvatarFrameDropdown = async (req, res) => {
  try {
    const search = req.query.search || "";

    const query = {
      isDelete: false,
      isActive: true,
    };

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const avtarFrames = await AvtarFrame.find(query).sort({ createdAt: -1 }).limit(50).lean();

    return res.status(200).json({
      status: true,
      message: "Retrieved Avatar Frames successfully.",
      data: avtarFrames,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
