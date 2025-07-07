const mongoose = require("mongoose");

const weeklySummarySchema = new mongoose.Schema({
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  summaries: [
    {
      serviceUser: {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ServiceUser",
          required: true,
        },
        name: String,
        dateOfBirth: Date,
        nhsNumber: String,
      },
      medication: {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ActiveMedication",
          required: true,
        },
        medicationName: String,
        quantityInStock: Number,
        quantityPerDose: Number,
        dosesPerDay: Number,
      },
      stockLevels: {
        initial: Number,
        final: Number,
        daysRemaining: Number,
      },
      cumulativeChanges: {
        fromPharmacy: { type: Number, default: 0 },
        quantityAdministered: { type: Number, default: 0 },
        leavingHome: { type: Number, default: 0 },
        returningHome: { type: Number, default: 0 },
        returnedToPharmacy: { type: Number, default: 0 },
        lost: { type: Number, default: 0 },
        damaged: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
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
            _id: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              required: true,
            },
            username: String,
            email: String,
          },
        },
      ],
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Add indexes for efficient querying
weeklySummarySchema.index({ startDate: 1, endDate: 1 });
weeklySummarySchema.index({ "summaries.medication._id": 1 });
weeklySummarySchema.index({ "summaries.serviceUser._id": 1 });

module.exports = mongoose.model("WeeklySummary", weeklySummarySchema);
