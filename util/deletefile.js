const fs = require("fs");

exports.deleteFile = (file) => {
  const filePath = typeof file === "string" ? file : file?.path;

  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`Deleted file: ${filePath}`);
  }
};

exports.deleteFiles = (files) => {
  if (!files || typeof files !== "object") return;

  Object.keys(files).forEach((key) => {
    const value = files[key];

    if (Array.isArray(value)) {
      value.forEach((file) => this.deleteFile(file));
    } else if (typeof value === "string") {
      this.deleteFile(value);
    }
  });
};
