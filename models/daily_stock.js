const mongoose = require("mongoose");

const dailyStockSchema = new mongoose.Schema({
  medication: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ActiveMedication",
    required: true,
  },
  serviceUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceUser",
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  stockLevel: {
    type: Number,
    required: true,
  },
  daysRemaining: {
    type: Number,
    required: true,
  },
  changes: [
    {
      type: {
        type: String,
        enum: [
          "From Pharmacy",
          "Quantity Administered",
          "Leaving Home",
          "Returning Home",
          "Returned to Pharmacy",
          "Lost",
          "Damaged",
          "Other",
        ],
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
      },
      note: String,
      timestamp: {
        type: Date,
        required: true,
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    },
  ],
  totals: {
    fromPharmacy: { type: Number, default: 0 },
    quantityAdministered: { type: Number, default: 0 },
    leavingHome: { type: Number, default: 0 },
    returningHome: { type: Number, default: 0 },
    returnedToPharmacy: { type: Number, default: 0 },
    lost: { type: Number, default: 0 },
    damaged: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Add compound indexes for efficient queries
dailyStockSchema.index({ medication: 1, date: 1 });
dailyStockSchema.index({ serviceUser: 1, date: 1 });
dailyStockSchema.index({ date: 1 });

module.exports = mongoose.model("DailyStock", dailyStockSchema);
