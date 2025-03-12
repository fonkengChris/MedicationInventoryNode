const mongoose = require("mongoose");

const activeMedicationSchema = new mongoose.Schema({
  serviceUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceUser",
    required: true,
  },
  medicationName: {
    type: String,
    required: true,
  },
  dosage: {
    amount: {
      type: Number,
      required: true,
    },
    unit: {
      type: String,
      required: true,
      enum: [
        "mg",
        "ml",
        "g",
        "tablets",
        "capsules",
        "drops",
        "puffs",
        "patches",
      ],
    },
  },
  quantityInStock: {
    type: Number,
    required: true,
    min: 0,
  },
  quantityPerDose: {
    type: Number,
    required: true,
    min: 0,
  },
  dosesPerDay: {
    type: Number,
    required: true,
    min: 0,
  },
  frequency: {
    type: String,
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
  },
  prescribedBy: {
    type: String,
    required: true,
  },
  notes: String,
  isActive: {
    type: Boolean,
    default: true,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

// Virtual field to calculate days of medication remaining
activeMedicationSchema.virtual("daysRemaining").get(function () {
  if (!this.quantityInStock || !this.quantityPerDose || !this.dosesPerDay) {
    return 0;
  }
  return Math.floor(
    this.quantityInStock / (this.quantityPerDose * this.dosesPerDay)
  );
});

// Ensure virtuals are included when converting document to JSON
activeMedicationSchema.set("toJSON", { virtuals: true });
activeMedicationSchema.set("toObject", { virtuals: true });

// Index to improve query performance
activeMedicationSchema.index({ serviceUser: 1, isActive: 1 });

module.exports = mongoose.model("ActiveMedication", activeMedicationSchema);
