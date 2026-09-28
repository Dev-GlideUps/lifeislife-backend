const generateUserUniqueId = require("../util/generateUserUniqueId");

const userFunction = async (user, data_) => {
  const data = data_.body;

  user.image = data.image ? data.image?.trim() : user.image;
  user.name = data?.name?.trim() || user.name;
  user.userName = data?.userName?.trim() || user.userName;
  user.gender = data?.gender?.toLowerCase()?.trim() || user.gender;
  user.bio = data?.bio?.trim() || user.bio;
  user.age = data?.age || user.age;
  user.email = data?.email?.trim() || user.email;
  user.mobileNumber = data?.mobileNumber || user.mobileNumber;
  user.countryFlagImage = data?.countryFlagImage || user.countryFlagImage;
  user.country = data?.country?.toLowerCase()?.trim() || user.country;
  user.ipAddress = data?.ipAddress || user.ipAddress;

  if (data?.loginType !== undefined) {
    const parsedLoginType = Number(data.loginType);
    user.loginType = parsedLoginType;
  }

  user.identity = data?.identity || user.identity;
  user.facebookId = data?.facebookId || user.facebookId;
  user.fcmToken = data?.fcmToken || user.fcmToken;

  if (!user.uniqueId) {
    [user.uniqueId] = await Promise.all([generateUserUniqueId()]);
  }

  await user.save();
  return user;
};

module.exports = userFunction;
