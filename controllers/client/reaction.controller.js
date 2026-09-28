const Reaction = require("../../models/reaction.model");

//get reactions ( when view live )
exports.getReactionEmojis = async (req, res) => {
  try {
    const reactions = await Reaction.find().select("title image").sort({ createdAt: -1 }).lean();

    return res.status(200).json({ status: true, message: "Reactions retrieved successfully.", data: reactions });
  } catch (error) {
    console.error("Error fetching reactions:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};
