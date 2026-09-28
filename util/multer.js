const multer = require("multer");
const fs = require("fs");
const path = require("path");

const ensureDirExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

module.exports = multer.diskStorage({
  filename: (req, file, callback) => {
    const filename = Date.now() + Math.floor(Math.random() * 100) + path.extname(file.originalname);
    callback(null, filename);
  },

  destination: (req, file, callback) => {
    // Default upload folder
    let uploadFolder = "storage";

    // If the route is for updating default profile photo list
    if (req.originalUrl.includes("/updateProfilePhotoList")) {
      uploadFolder = path.join("storage", "defaultphoto");
    }

    // If the route is for updating fake audio call content
    if (req.originalUrl.includes("/updateFakeAudioCallAudioList")) {
      uploadFolder = path.join("storage", "fakeAudioCallAudio");
    }

    // If the route is for updating fake video call content
    if (req.originalUrl.includes("/updateFakeVideoCallVideoList")) {
      uploadFolder = path.join("storage", "fakeVideoCallVideo");
    }

    ensureDirExists(uploadFolder);
    callback(null, uploadFolder);
  },
});
