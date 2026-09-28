const mongoose = require("mongoose");

const agencyCommissionSchema = new mongoose.Schema(
  {
    totalEarnings: { type: Number, required: true }, // Total amount earned by the host ( Minimum earnings )
    commissionRate: { type: Number, required: true }, // Percentage commission rate (e.g., 10 for 10%)
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

agencyCommissionSchema.index({ totalEarnings: 1 });

module.exports = mongoose.model("AgencyCommission", agencyCommissionSchema);
