const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  serviceUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceUser",
    required: true,
  },
  appointmentType: {
    type: String,
    required: true,
    enum: ["Medical", "Dental", "Therapy", "Review", "Other"],
  },
  dateTime: {
    type: Date,
    required: true,
  },
  duration: {
    type: Number, // Duration in minutes
    required: true,
    min: 0,
  },
  location: {
    type: String,
    required: true,
  },
  provider: {
    name: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
    },
    contactNumber: String,
  },
  status: {
    type: String,
    required: true,
    enum: ["Scheduled", "Completed", "Cancelled", "Rescheduled", "NoShow"],
    default: "Scheduled",
  },
  notes: String,
  reminderSent: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index to improve query performance
appointmentSchema.index({ serviceUser: 1, dateTime: 1 });
appointmentSchema.index({ status: 1, dateTime: 1 });

// Update the updatedAt timestamp before saving
appointmentSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Appointment", appointmentSchema);
