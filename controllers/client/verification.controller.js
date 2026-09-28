const Verification = require("../../models/verification.model");
const User = require("../../models/user.model");

const mongoose = require("mongoose");
const admin = require("../../util/privateKey");

// Generate uniqueId without count
function generateVerificationId() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.floor(10000 + Math.random() * 90000); // 5-digit random number
  return `VER-${datePart}-${randomPart}`;
}

//Submit user verification
exports.submitUserVerificationRequest = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const idProofFile = req.files?.idProofUrl;
    const selfieFile = req.files?.selfieUrl;
    const { idProofId, idProof, address } = req.body;

    if (!idProof || !idProofFile) {
      return res.status(200).json({ status: false, message: "ID type and ID proof image are required." });
    }

    const [user, existing] = await Promise.all([User.findById(userId).select("_id fcmToken isVerified"), Verification.findOne({ user: userId }).select("status").sort({ createdAt: -1 })]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user.isVerified) {
      return res.status(200).json({ status: false, message: "Your account is already verified." });
    }

    if (existing && existing.status === 1) {
      return res.status(200).json({
        status: false,
        message: "A verification request is already pending review.",
      });
    }

    if (existing && existing.status === 2) {
      return res.status(200).json({
        status: false,
        message: "Your account is already verified.",
      });
    }

    res.status(200).json({
      status: true,
      message: "Verification details submitted successfully.",
    });

    const uniqueId = generateVerificationId();
    await Verification.create({
      uniqueId,
      user: userId,
      idProof,
      idProofUrl: idProofFile ? idProofFile[0].path : "",
      selfieUrl: selfieFile ? selfieFile[0].path : "",
      idProofId: idProofId || "",
      address: address || "",
      status: 1,
      submittedAt: new Date(),
    });

    if (user.fcmToken && user.fcmToken !== null) {
      const payload = {
        token: user.fcmToken,
        notification: {
          title: "📩 Verification Request Submitted",
          body: "We've received your verification request ✅ Our team is reviewing it, and you'll be notified once it's approved 🔍",
        },
        data: {
          type: "USER_VERIFICATION_REQUEST",
        },
      };

      const adminInstance = await admin;
      adminInstance
        .messaging()
        .send(payload)
        .then((response) => {
          console.log("Successfully sent with response: ", response);
        })
        .catch((error) => {
          console.log("Error sending message: ", error);
        });
    }
  } catch (error) {
    console.error("Error submitting verification:", error);
    return res.status(500).json({ status: false, message: "Something went wrong." });
  }
};
