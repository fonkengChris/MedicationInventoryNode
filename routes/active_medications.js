const express = require("express");
const router = express.Router();
const ActiveMedication = require("../models/active_medication");
const MedicationUpdate = require("../models/medication_update");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const superAdminAuth = require("../middleware/superAdminAuth");
const NotificationService = require("../services/notificationService");

// Helper function to get user ID from token
async function getUserIdFromToken(req) {
  const token = req.header("x-auth-token");
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findOne({ email: decoded.email });
  return user._id;
}

// Get all active medications
router.get("/", auth, async (req, res) => {
  try {
    const medications = await ActiveMedication.find({ isActive: true })
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("updatedBy", "email");

    // Check stock levels for each medication
    for (const medication of medications) {
      if (medication.daysRemaining <= 10) {
        await NotificationService.notifyLowMedicationStock(
          medication,
          medication.daysRemaining
        );
      }
    }

    res.json(medications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all medications for a service user - accessible to all authenticated users
router.get("/service-user/:serviceUserId", auth, async (req, res) => {
  try {
    const medications = await ActiveMedication.find({
      serviceUser: req.params.serviceUserId,
      isActive: true,
    }).populate("serviceUser updatedBy");
    res.json(medications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get one medication - accessible to all authenticated users
router.get("/:id", auth, async (req, res) => {
  try {
    const medication = await ActiveMedication.findById(req.params.id).populate(
      "serviceUser updatedBy"
    );
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }
    res.json(medication);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add new medication - admin only
router.post("/", [auth, adminAuth], async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    const medication = new ActiveMedication({
      serviceUser: req.body.serviceUser,
      medicationName: req.body.medicationName,
      dosage: {
        amount: req.body.dosage.amount,
        unit: req.body.dosage.unit,
      },
      quantityInStock: req.body.quantityInStock,
      quantityPerDose: req.body.quantityPerDose,
      dosesPerDay: req.body.dosesPerDay,
      frequency: req.body.frequency,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      prescribedBy: req.body.prescribedBy,
      notes: req.body.notes,
      updatedBy: userId,
    });

    const newMedication = await medication.save();

    // Create update record
    await new MedicationUpdate({
      medication: newMedication._id,
      updatedBy: userId,
      updateType: "created",
      changes: new Map([
        [
          "medicationName",
          { oldValue: null, newValue: req.body.medicationName },
        ],
        ["dosage", { oldValue: null, newValue: req.body.dosage }],
        [
          "quantityInStock",
          { oldValue: null, newValue: req.body.quantityInStock },
        ],
        [
          "quantityPerDose",
          { oldValue: null, newValue: req.body.quantityPerDose },
        ],
        ["dosesPerDay", { oldValue: null, newValue: req.body.dosesPerDay }],
        ["frequency", { oldValue: null, newValue: req.body.frequency }],
        ["startDate", { oldValue: null, newValue: req.body.startDate }],
        ["endDate", { oldValue: null, newValue: req.body.endDate }],
        ["prescribedBy", { oldValue: null, newValue: req.body.prescribedBy }],
        ["notes", { oldValue: null, newValue: req.body.notes }],
      ]),
    }).save();

    // Populate the response with the calculated daysRemaining
    const populatedMedication = await ActiveMedication.findById(
      newMedication._id
    )
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("updatedBy", "username email");

    res.status(201).json(populatedMedication);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update active medication - accessible to all authenticated users
router.put("/:id", [auth], async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    const medication = await ActiveMedication.findById(req.params.id);
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    // Track changes
    const changes = new Map();

    Object.keys(req.body).forEach((key) => {
      if (req.body[key] != null) {
        if (key === "dosage") {
          changes.set("dosage", {
            oldValue: { ...medication.dosage },
            newValue: { ...medication.dosage, ...req.body.dosage },
          });
          medication.dosage = {
            ...medication.dosage,
            ...req.body.dosage,
          };
        } else {
          changes.set(key, {
            oldValue: medication[key],
            newValue: req.body[key],
          });
          medication[key] = req.body[key];
        }
      }
    });

    medication.updatedBy = userId;
    medication.lastUpdated = Date.now();

    const updatedMedication = await medication.save();

    // Create update record
    await new MedicationUpdate({
      medication: medication._id,
      updatedBy: userId,
      updateType: "updated",
      changes: changes,
    }).save();

    // Populate the response with the calculated daysRemaining
    const populatedMedication = await ActiveMedication.findById(
      updatedMedication._id
    )
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("updatedBy", "username email");

    res.json(populatedMedication);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Deactivate medication - admin only
router.patch("/:id/deactivate", [auth, adminAuth], async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    const medication = await ActiveMedication.findById(req.params.id);
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    medication.isActive = false;
    medication.updatedBy = userId;
    medication.lastUpdated = Date.now();

    const updatedMedication = await medication.save();

    // Create update record
    await new MedicationUpdate({
      medication: medication._id,
      updatedBy: userId,
      updateType: "deactivated",
      changes: new Map([["isActive", { oldValue: true, newValue: false }]]),
    }).save();

    res.json(updatedMedication);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete active medication - superAdmin only
router.delete("/:id", [auth, superAdminAuth], async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    const medication = await ActiveMedication.findById(req.params.id);
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    // Create update record before deletion
    await new MedicationUpdate({
      medication: medication._id,
      updatedBy: userId,
      updateType: "deleted",
      changes: new Map([["deleted", { oldValue: false, newValue: true }]]),
    }).save();

    await ActiveMedication.deleteOne({ _id: req.params.id });
    res.json({ message: "Medication deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
