const mongoose = require("mongoose");

const medicationAdministrationSchema = new mongoose.Schema(
  {
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
    scheduledDate: {
      type: Date,
      required: true,
    },
    scheduledTime: {
      type: String,
      required: true,
      validate: {
        validator: function (value) {
          return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
        },
        message: (props) =>
          `${props.value} is not a valid scheduled time (HH:mm)`,
      },
    },
    administeredAt: {
      type: Date,
      required: true,
    },
    administeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        // Timing statuses
        "on-time",
        "early",
        "late",
        "recorded",
        "missed",
        "cancelled",
        // MAR status codes
        "refused",
        "nausea",
        "nausea_vomiting",
        "hospital",
        "on_leave",
        "destroyed",
        "sleeping",
        "pulse_abnormal",
        "not_required",
        "other",
      ],
      default: "on-time",
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

medicationAdministrationSchema.index({
  medication: 1,
  scheduledDate: 1,
  scheduledTime: 1,
});

module.exports = mongoose.model(
  "MedicationAdministration",
  medicationAdministrationSchema
);

