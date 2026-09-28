const User = require("../models/user.model");

async function generateUniqueReferralCode(length = 8) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let referralCode;
  let exists = true;

  while (exists) {
    referralCode = "";
    for (let i = 0; i < length; i++) {
      referralCode += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    exists = await User.exists({ referralCode });
  }

  return referralCode;
}

module.exports = generateUniqueReferralCode;
