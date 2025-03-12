const mongoose = require("mongoose");

const medicationUpdateSchema = new mongoose.Schema({
  medication: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ActiveMedication",
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  updateType: {
    type: String,
    required: true,
    enum: ["created", "updated", "deactivated", "deleted"],
  },
  changes: {
    type: Map,
    of: {
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
    },
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Index to improve query performance
medicationUpdateSchema.index({ medication: 1, timestamp: -1 });

module.exports = mongoose.model("MedicationUpdate", medicationUpdateSchema);
