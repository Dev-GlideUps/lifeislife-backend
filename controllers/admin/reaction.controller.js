const Reaction = require("../../models/reaction.model");

//fs
const fs = require("fs");

//deletefile
const { deleteFile } = require("../../util/deletefile");

//create reaction
exports.addReaction = async (req, res, next) => {
  try {
    const { title } = req.body;

    if (!title) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Title is required." });
    }

    const reactionData = {
      title,
      image: req.file ? req.file.path : "",
    };

    const reaction = new Reaction(reactionData);
    await reaction.save();

    return res.status(200).json({ status: true, message: "Reaction successfully created.", data: reaction });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update reaction
exports.updateReaction = async (req, res, next) => {
  try {
    const { reactionId, title } = req.body;

    const reaction = await Reaction.findById(reactionId);
    if (!reaction) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Reaction not found." });
    }

    reaction.title = title || reaction.title;

    if (req.file) {
      if (reaction.image) {
        deleteFile(reaction.image);
      }

      reaction.image = req.file.path;
    }

    await reaction.save();

    return res.status(200).json({ status: true, message: "Reaction updated successfully.", data: reaction });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get all reactions
exports.getAllReactions = async (req, res, next) => {
  try {
    const reactions = await Reaction.find().sort({ createdAt: -1 }).lean();

    return res.status(200).json({ status: true, message: "Reactions retrieved successfully.", data: reactions });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//delete reaction
exports.deleteReaction = async (req, res, next) => {
  try {
    const { reactionId } = req.query;

    const reaction = await Reaction.findById(reactionId);
    if (!reaction) {
      return res.status(200).json({ status: false, message: "Reaction not found." });
    }

    if (reaction.image) {
      deleteFile(reaction.image);
    }

    res.status(200).json({ status: true, message: "Reaction deleted successfully." });

    await Reaction.findByIdAndDelete(reactionId);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
