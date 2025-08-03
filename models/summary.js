const mongoose = require("mongoose");

const summarySchema = new mongoose.Schema({
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
        name: {
          type: String,
          required: true,
        },
        dateOfBirth: {
          type: String,
          required: true,
        },
        nhsNumber: {
          type: String,
          required: true,
        },
      },
      medication: {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ActiveMedication",
          required: true,
        },
        medicationName: {
          type: String,
          required: true,
        },
        quantityInStock: {
          type: Number,
          required: true,
        },
        quantityPerDose: {
          type: Number,
          required: true,
        },
        dosesPerDay: {
          type: Number,
          required: true,
        },
      },
      stockLevels: {
        initial: {
          type: Number,
          required: true,
        },
        final: {
          type: Number,
          required: true,
        },
        daysRemaining: {
          type: Number,
          required: true,
        },
      },
      cumulativeChanges: {
        fromPharmacy: {
          type: Number,
          default: 0,
        },
        quantityAdministered: {
          type: Number,
          default: 0,
        },
        leavingHome: {
          type: Number,
          default: 0,
        },
        returningHome: {
          type: Number,
          default: 0,
        },
        returnedToPharmacy: {
          type: Number,
          default: 0,
        },
        lost: {
          type: Number,
          default: 0,
        },
        damaged: {
          type: Number,
          default: 0,
        },
        other: {
          type: Number,
          default: 0,
        },
      },
      changes: [
        {
          type: {
            type: String,
            required: true,
          },
          quantity: {
            type: Number,
            required: true,
          },
          note: {
            type: String,
            required: true,
          },
          timestamp: {
            type: Date,
            required: true,
          },
          updatedBy: {
            _id: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              required: false,
            },
            username: {
              type: String,
              required: false,
            },
            email: {
              type: String,
              required: false,
            },
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

// Index for efficient querying
summarySchema.index({ startDate: 1, endDate: 1 });
summarySchema.index({ createdAt: -1 });

module.exports = mongoose.model("Summary", summarySchema); 