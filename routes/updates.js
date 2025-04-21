const express = require("express");
const router = express.Router();
const MedicationUpdate = require("../models/medication_update");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const superAdminAuth = require("../middleware/superAdminAuth");
const ActiveMedication = require("../models/active_medication");

// Get all updates - accessible to authenticated users
router.get("/", auth, async (req, res) => {
  try {
    const updates = await MedicationUpdate.find()
      .populate("medication", "name")
      .populate("updatedBy", "username email")
      .sort({ timestamp: -1 });
    res.json(updates);
  } catch (err) {
    console.error("Error fetching updates:", err);
    res.status(500).json({ message: err.message });
  }
});

// Get updates for a specific medication
router.get("/medication/:medicationId", auth, async (req, res) => {
  try {
    const updates = await MedicationUpdate.find({
      "medication._id": req.params.medicationId,
    })
      .populate({
        path: "updatedBy",
        select: "_id username email",
      })
      .sort({ timestamp: -1 });

    // Handle both old and new updates
    const formattedUpdates = await Promise.all(
      updates.map(async (update) => {
        // For old updates where medication name is missing
        if (
          update.medication &&
          (!update.medication.medicationName ||
            update.medication.medicationName === "Unknown Medication")
        ) {
          const medicationData = await ActiveMedication.findById(
            update.medication._id
          )
            .select(
              "medicationName quantityInStock quantityPerDose dosesPerDay"
            )
            .lean();

          if (medicationData) {
            return {
              _id: update._id,
              medication: {
                _id: update.medication._id,
                medicationName: medicationData.medicationName,
                quantityInStock: medicationData.quantityInStock,
                quantityPerDose: medicationData.quantityPerDose,
                dosesPerDay: medicationData.dosesPerDay,
                daysRemaining: Math.floor(
                  medicationData.quantityInStock /
                    (medicationData.quantityPerDose *
                      medicationData.dosesPerDay)
                ),
              },
              updatedBy: {
                _id: update.updatedBy._id,
                username: update.updatedBy.username || "Unknown User",
                email: update.updatedBy.email || "no-email",
              },
              updateType: update.updateType,
              changes: update.changes,
              timestamp: update.timestamp,
            };
          }
        }

        // For new updates or if medication lookup failed
        return {
          _id: update._id,
          medication: {
            _id: update.medication._id,
            medicationName:
              update.medication.medicationName || "Unknown Medication",
            quantityInStock: update.medication.quantityInStock,
            quantityPerDose: update.medication.quantityPerDose,
            dosesPerDay: update.medication.dosesPerDay,
            daysRemaining: update.medication.daysRemaining,
          },
          updatedBy: {
            _id: update.updatedBy._id,
            username: update.updatedBy.username || "Unknown User",
            email: update.updatedBy.email || "no-email",
          },
          updateType: update.updateType,
          changes: update.changes,
          timestamp: update.timestamp,
        };
      })
    );

    res.json(formattedUpdates);
  } catch (err) {
    console.error("Error fetching medication updates:", err);
    res.status(500).json({ message: err.message });
  }
});

// Get updates by a specific user
router.get("/user/:userId", auth, async (req, res) => {
  try {
    const updates = await MedicationUpdate.find({
      updatedBy: req.params.userId,
    })
      .populate("medication", "name")
      .populate("updatedBy", "username email")
      .sort({ timestamp: -1 });
    res.json(updates);
  } catch (err) {
    console.error("Error fetching user updates:", err);
    res.status(500).json({ message: err.message });
  }
});

// Get updates within a date range
router.get("/date-range", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);

    const updates = await MedicationUpdate.find({
      timestamp: {
        $gte: new Date(startDate),
        $lte: endOfDay,
      },
    })
      .populate("medication", "name")
      .populate("updatedBy", "username email")
      .sort({ timestamp: -1 });
    res.json(updates);
  } catch (err) {
    console.error("Error fetching date range updates:", err);
    res.status(500).json({ message: err.message });
  }
});

// Delete update - superAdmin only
router.delete("/:id", [auth, superAdminAuth], async (req, res) => {
  try {
    const update = await MedicationUpdate.findById(req.params.id);
    if (!update) {
      return res.status(404).json({ message: "Update not found" });
    }

    await MedicationUpdate.deleteOne({ _id: req.params.id });
    res.json({ message: "Update deleted successfully" });
  } catch (err) {
    console.error("Error deleting update:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
