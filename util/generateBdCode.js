const crypto = require("crypto");
const Bd = require("../models/bd.model");

const generateRandomLetters = (length = 2) => {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += letters.charAt(crypto.randomInt(0, letters.length));
  }
  return result;
};

const generateBdCode = async () => {
  let bdCode;
  let exists = true;

  while (exists) {
    const letters = generateRandomLetters(2);
    const number = crypto.randomInt(1000, 10000);
    bdCode = `BD-${letters}${number}`;

    exists = await Bd.findOne({ bdCode });
  }

  return bdCode;
};

module.exports = generateBdCode;
