const mongoose = require("mongoose");

const medicationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  dosage: {
    type: String,
    required: true,
  },
  form: {
    type: String,
    required: true,
    enum: ["tablet", "capsule", "injection", "cream", "solution"],
  },
  route: {
    type: String,
    required: true,
    enum: ["oral", "intravenous", "topical"],
  },

  manufacturer: String,
  location: String,
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Medication", medicationSchema);
