const DailyStock = require("../models/daily_stock");
const ActiveMedication = require("../models/active_medication");
const MedicationUpdate = require("../models/medication_update");
const User = require("../models/User");

class DailyStockService {
  static async recordDailyStock() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get all active medications
      const medications = await ActiveMedication.find({ isActive: true })
        .populate("serviceUser", "name nhsNumber")
        .lean();

      // Create or update daily stock records
      for (const medication of medications) {
        const dailyStock = await DailyStock.findOne({
          medication: medication._id,
          date: today,
        });

        if (!dailyStock) {
          await DailyStock.create({
            medication: medication._id,
            serviceUser: medication.serviceUser._id,
            date: today,
            stockLevel: medication.quantityInStock,
            daysRemaining: Math.floor(
              medication.quantityInStock /
                (medication.quantityPerDose * medication.dosesPerDay)
            ),
            changes: [],
            totals: {
              fromPharmacy: 0,
              quantityAdministered: 0,
              leavingHome: 0,
              returningHome: 0,
              returnedToPharmacy: 0,
              lost: 0,
              damaged: 0,
              other: 0,
            },
          });
        }
      }
    } catch (error) {
      console.error("Error recording daily stock:", error);
      throw error;
    }
  }

  static async recordQuantityChange(
    medicationId,
    userId,
    changeType,
    quantity,
    note
  ) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get the medication that was changed
      const changedMedication = await ActiveMedication.findById(medicationId)
        .populate("serviceUser", "name nhsNumber")
        .lean();

      if (!changedMedication) {
        throw new Error("Medication not found");
      }

      // Record the change for the specific medication
      let dailyStock = await DailyStock.findOne({
        medication: medicationId,
        date: today,
      });

      if (!dailyStock) {
        dailyStock = new DailyStock({
          medication: medicationId,
          serviceUser: changedMedication.serviceUser._id,
          date: today,
          stockLevel: changedMedication.quantityInStock,
          daysRemaining: Math.floor(
            changedMedication.quantityInStock /
              (changedMedication.quantityPerDose *
                changedMedication.dosesPerDay)
          ),
          changes: [],
          totals: {
            fromPharmacy: 0,
            quantityAdministered: 0,
            leavingHome: 0,
            returningHome: 0,
            returnedToPharmacy: 0,
            lost: 0,
            damaged: 0,
            other: 0,
          },
        });
      }

      // Add the change record
      const change = {
        type: changeType,
        quantity: quantity,
        note: note,
        timestamp: new Date(),
        updatedBy: userId,
      };

      dailyStock.changes.push(change);

      // Update totals
      const changeTypeKey = changeType.toLowerCase().replace(/\s+/g, "");
      if (dailyStock.totals.hasOwnProperty(changeTypeKey)) {
        dailyStock.totals[changeTypeKey] += quantity;
      }

      // Update current stock level and days remaining
      dailyStock.stockLevel = changedMedication.quantityInStock;
      dailyStock.daysRemaining = Math.floor(
        changedMedication.quantityInStock /
          (changedMedication.quantityPerDose * changedMedication.dosesPerDay)
      );

      await dailyStock.save();

      // Record current state of all active medications
      const activeMedications = await ActiveMedication.find({ isActive: true })
        .populate("serviceUser", "name nhsNumber")
        .lean();

      for (const medication of activeMedications) {
        if (medication._id.toString() === medicationId.toString()) continue; // Skip the changed medication as we already recorded it

        let otherDailyStock = await DailyStock.findOne({
          medication: medication._id,
          date: today,
        });

        if (!otherDailyStock) {
          otherDailyStock = new DailyStock({
            medication: medication._id,
            serviceUser: medication.serviceUser._id,
            date: today,
            stockLevel: medication.quantityInStock,
            daysRemaining: Math.floor(
              medication.quantityInStock /
                (medication.quantityPerDose * medication.dosesPerDay)
            ),
            changes: [],
            totals: {
              fromPharmacy: 0,
              quantityAdministered: 0,
              leavingHome: 0,
              returningHome: 0,
              returnedToPharmacy: 0,
              lost: 0,
              damaged: 0,
              other: 0,
            },
          });
        }

        // Update stock level and days remaining
        otherDailyStock.stockLevel = medication.quantityInStock;
        otherDailyStock.daysRemaining = Math.floor(
          medication.quantityInStock /
            (medication.quantityPerDose * medication.dosesPerDay)
        );

        await otherDailyStock.save();
      }

      return dailyStock;
    } catch (error) {
      console.error("Error recording quantity change:", error);
      throw error;
    }
  }



  static async getStockHistory(medicationId, startDate, endDate) {
    try {
      return await DailyStock.find({
        medication: medicationId,
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      }).sort({ date: 1 });
    } catch (error) {
      console.error("Error getting stock history:", error);
      throw error;
    }
  }

  static async getInitialStock(medicationId, date) {
    try {
      const stock = await DailyStock.findOne({
        medication: medicationId,
        date: { $lte: date },
      }).sort({ date: -1 });
      return stock ? stock.stockLevel : 0;
    } catch (error) {
      console.error("Error getting initial stock:", error);
      throw error;
    }
  }
}

module.exports = DailyStockService;
