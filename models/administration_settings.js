const mongoose = require("mongoose");

const administrationSettingsSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["global", "group"],
      default: "global",
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: function () {
        return this.scope === "group";
      },
    },
    thresholdBefore: {
      type: Number,
      required: true,
      min: 0,
      default: 30,
    },
    thresholdAfter: {
      type: Number,
      required: true,
      min: 0,
      default: 30,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

administrationSettingsSchema.index({ scope: 1, group: 1 }, { unique: true });

module.exports = mongoose.model(
  "AdministrationSettings",
  administrationSettingsSchema
);

