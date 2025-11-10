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
      enum: ["on-time", "early", "late", "missed", "cancelled"],
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

