const crypto = require("crypto");
const Agency = require("../models/agency.model");

const generateRandomLetters = (length = 2) => {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += letters.charAt(crypto.randomInt(0, letters.length));
  }
  return result;
};

const generateAgencyCode = async () => {
  let agencyCode;
  let exists = true;

  while (exists) {
    const letters = generateRandomLetters(2);
    const number = crypto.randomInt(1000, 10000); //4-digit number
    agencyCode = `AG-${letters}${number}`;

    exists = await Agency.findOne({ agencyCode });
  }

  return agencyCode;
};

module.exports = generateAgencyCode;
