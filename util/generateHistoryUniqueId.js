const History = require("../models/history.model");

const crypto = require("crypto");

async function generateHistoryUniqueId() {
  let uniqueId;
  let isUnique = false;

  while (!isUnique) {
    uniqueId = `HIS-${crypto.randomBytes(3).toString("hex").toUpperCase()}`; // 6 random characters

    const existingRecord = await History.findOne({ uniqueId: uniqueId }).select("_id").lean();

    if (!existingRecord) {
      isUnique = true;
    }
  }

  return uniqueId;
}

module.exports = generateHistoryUniqueId;
