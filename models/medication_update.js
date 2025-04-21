const mongoose = require("mongoose");
const ActiveMedication = require("./active_medication");

const medicationUpdateSchema = new mongoose.Schema({
  medication: {
    type: {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "ActiveMedication" },
      medicationName: String,
      quantityInStock: Number,
      quantityPerDose: Number,
      dosesPerDay: Number,
      daysRemaining: Number,
    },
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  updateType: {
    type: String,
    enum: [
      "New Medication",
      "MedStock Increase",
      "MedStock Decrease",
      "Name Change",
      "Dosage Change",
      "Frequency Change",
      "Quantity Per Dose Change",
      "Doses Per Day Change",
      "Prescriber Change",
      "Service User Change",
      "Form Change",
      "Route Change",
      "Instructions Change",
      "Activated",
      "Deactivated",
      "Deleted",
    ],
    required: true,
  },
  changes: {
    type: Map,
    of: {
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
    },
    required: true,
  },
  notes: {
    type: String,
    trim: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Add indexes for common queries
medicationUpdateSchema.index({ medication: 1, timestamp: -1 });
medicationUpdateSchema.index({ updatedBy: 1, timestamp: -1 });

// Helper function to fetch medication data
async function fetchMedicationData(medicationId) {
  console.log("Fetching medication data for ID:", medicationId);
  try {
    const medication = await ActiveMedication.findById(medicationId)
      .select("medicationName quantityInStock quantityPerDose dosesPerDay")
      .lean();

    console.log("Medication data:", medication);
    if (medication) {
      return {
        ...medication,
        daysRemaining: Math.floor(
          medication.quantityInStock /
            (medication.quantityPerDose * medication.dosesPerDay)
        ),
      };
    }
  } catch (err) {
    console.error("Error fetching medication:", err);
  }
  return null;
}

// Add method to schema to populate missing medication data
medicationUpdateSchema.methods.populateMissingData = async function () {
  if (this.medication) {
    const medicationId = this.medication._id || this.medication;
    if (
      !medicationId ||
      (typeof medicationId === "object" &&
        Object.keys(medicationId).length === 0)
    ) {
      console.log("Invalid medication ID");
      return;
    }

    const medicationData = await fetchMedicationData(medicationId);
    console.log("Medication data:", medicationData);
    if (medicationData) {
      // Convert the document to a plain object and update it
      const doc = this.toObject();
      doc.medication = {
        _id: medicationId,
        ...medicationData,
      };
      Object.assign(this, doc);
      console.log("Updated medication data:", this.medication);
    }
  }
};

medicationUpdateSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    // For debugging
    // console.log("Original medication data:", ret.medication);

    if (ret.medication && ret.medication._id) {
      if (!ret.medication.medicationName) {
        ret.medication.medicationName = "Unknown Medication";
      }
    } else {
      ret.medication = {
        _id: null,
        medicationName: "Unknown Medication",
      };
    }

    if (ret.updatedBy && ret.updatedBy._id) {
      ret.updatedBy = {
        _id: ret.updatedBy._id,
        username: ret.updatedBy.username || "Unknown User",
        email: ret.updatedBy.email || "no-email",
      };
    } else {
      ret.updatedBy = {
        _id: null,
        username: "Unknown User",
        email: "no-email",
      };
    }

    return ret;
  },
});

module.exports = mongoose.model("MedicationUpdate", medicationUpdateSchema);
