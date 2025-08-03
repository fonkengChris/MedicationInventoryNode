const Summary = require("../models/summary");
const ActiveMedication = require("../models/active_medication");
const MedicationUpdate = require("../models/medication_update");
const ServiceUser = require("../models/service_user");
const User = require("../models/User");

class SummaryService {
  /**
   * Generate a summary for a specific date range
   */
  static async generateSummary(startDate, endDate) {
    try {
      console.log(`Generating summary from ${startDate} to ${endDate}`);

      // Get all active medications
      const activeMedications = await ActiveMedication.find({ isActive: true })
        .populate("serviceUser")
        .populate("updatedBy", "username email")
        .lean();

      console.log(`Found ${activeMedications.length} active medications`);

      const summaries = [];

      for (const medication of activeMedications) {
        console.log(`Processing medication: ${medication.medicationName}`);
        
        // Check if serviceUser is properly populated
        if (!medication.serviceUser || !medication.serviceUser._id) {
          console.log(`Skipping medication ${medication.medicationName} - serviceUser not populated`);
          continue;
        }
        
        // Get medication updates for this period
        const updates = await MedicationUpdate.find({
          "medication._id": medication._id,
          timestamp: {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
        })
          .populate("updatedBy", "username email")
          .sort({ timestamp: 1 })
          .lean();

        console.log(`Found ${updates.length} updates for ${medication.medicationName}`);
        
        // Debug: Log the first update structure if available
        if (updates.length > 0) {
          console.log("Sample update structure:", JSON.stringify(updates[0], null, 2));
        }

        // Calculate initial stock (stock at the beginning of the period)
        const initialStock = await this.getInitialStock(medication._id, startDate);

        // Calculate final stock (current stock)
        const finalStock = medication.quantityInStock;

        // Calculate cumulative changes
        const cumulativeChanges = this.calculateCumulativeChanges(updates);

        // Get recent changes for the summary
        const recentChanges = updates.slice(-10).map(update => {
          // Handle cases where updatedBy might be null or undefined
          let updatedByData = {
            _id: null,
            username: "Unknown User",
            email: "no-email",
          };
          
          if (update.updatedBy && update.updatedBy._id) {
            updatedByData = {
              _id: update.updatedBy._id,
              username: update.updatedBy.username || "Unknown User",
              email: update.updatedBy.email || "no-email",
            };
          }
          
          return {
            type: update.updateType,
            quantity: this.extractQuantityFromUpdate(update),
            note: update.notes || update.updateType,
            timestamp: update.timestamp,
            updatedBy: updatedByData,
          };
        });

        // Calculate days remaining
        const daysRemaining = Math.floor(
          finalStock / (medication.quantityPerDose * medication.dosesPerDay)
        );

        const summary = {
          serviceUser: {
            _id: medication.serviceUser._id,
            name: medication.serviceUser.name || "Unknown User",
            dateOfBirth: medication.serviceUser.dateOfBirth || "",
            nhsNumber: medication.serviceUser.nhsNumber || "",
          },
          medication: {
            _id: medication._id,
            medicationName: medication.medicationName,
            quantityInStock: medication.quantityInStock,
            quantityPerDose: medication.quantityPerDose,
            dosesPerDay: medication.dosesPerDay,
          },
          stockLevels: {
            initial: initialStock,
            final: finalStock,
            daysRemaining: daysRemaining,
          },
          cumulativeChanges: cumulativeChanges,
          changes: recentChanges,
        };

        summaries.push(summary);
      }

      // Create and save the summary
      const summary = new Summary({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        summaries: summaries,
      });

      const savedSummary = await summary.save();
      console.log(`Summary generated with ${summaries.length} medication entries`);

      return savedSummary;
    } catch (error) {
      console.error("Error generating summary:", error);
      throw error;
    }
  }

  /**
   * Get initial stock for a medication at a specific date
   */
  static async getInitialStock(medicationId, startDate) {
    try {
      // Get the most recent stock level before the start date
      const lastUpdate = await MedicationUpdate.findOne({
        "medication._id": medicationId,
        timestamp: { $lt: new Date(startDate) },
        $or: [
          { updateType: "MedStock Increase" },
          { updateType: "MedStock Decrease" },
          { updateType: "New Medication" },
        ],
      })
        .sort({ timestamp: -1 })
        .lean();

      if (lastUpdate) {
        // Extract the final stock from the last update
        const changes = lastUpdate.changes;
        if (changes) {
          let quantityInStock = null;
          
          if (changes.get && typeof changes.get === 'function') {
            // It's a Map object
            const change = changes.get("quantityInStock");
            if (change) {
              quantityInStock = change.newValue || 0;
            }
          } else if (changes.quantityInStock) {
            // It's a plain object
            const change = changes.quantityInStock;
            quantityInStock = change.newValue || 0;
          } else if (typeof changes === 'object') {
            // Try to find quantityInStock in the changes object
            const change = changes.quantityInStock || changes.get?.("quantityInStock");
            if (change) {
              quantityInStock = change.newValue || 0;
            }
          }
          
          if (quantityInStock !== null) {
            return quantityInStock;
          }
        }
      }

      // If no previous updates, get current stock
      const medication = await ActiveMedication.findById(medicationId).lean();
      return medication ? medication.quantityInStock : 0;
    } catch (error) {
      console.error("Error getting initial stock:", error);
      return 0;
    }
  }

  /**
   * Calculate cumulative changes from updates
   */
  static calculateCumulativeChanges(updates) {
    const changes = {
      fromPharmacy: 0,
      quantityAdministered: 0,
      leavingHome: 0,
      returningHome: 0,
      returnedToPharmacy: 0,
      lost: 0,
      damaged: 0,
      other: 0,
    };

    for (const update of updates) {
      const quantity = this.extractQuantityFromUpdate(update);
      
      switch (update.updateType) {
        case "MedStock Increase":
          if (update.notes && update.notes.toLowerCase().includes("pharmacy")) {
            changes.fromPharmacy += quantity;
          } else if (update.notes && update.notes.toLowerCase().includes("return")) {
            changes.returningHome += quantity;
          } else {
            changes.other += quantity;
          }
          break;
        case "MedStock Decrease":
          if (update.notes && update.notes.toLowerCase().includes("administered")) {
            changes.quantityAdministered += quantity;
          } else if (update.notes && update.notes.toLowerCase().includes("leave")) {
            changes.leavingHome += quantity;
          } else if (update.notes && update.notes.toLowerCase().includes("pharmacy")) {
            changes.returnedToPharmacy += quantity;
          } else if (update.notes && update.notes.toLowerCase().includes("lost")) {
            changes.lost += quantity;
          } else if (update.notes && update.notes.toLowerCase().includes("damaged")) {
            changes.damaged += quantity;
          } else {
            changes.other += quantity;
          }
          break;
        case "New Medication":
          changes.fromPharmacy += quantity;
          break;
      }
    }

    return changes;
  }

  /**
   * Extract quantity change from an update
   */
  static extractQuantityFromUpdate(update) {
    if (update.changes) {
      // Handle both Map and plain object formats
      let quantityChange = null;
      
      if (update.changes.get && typeof update.changes.get === 'function') {
        // It's a Map object
        const change = update.changes.get("quantityInStock");
        if (change) {
          quantityChange = Math.abs((change.newValue || 0) - (change.oldValue || 0));
        }
      } else if (update.changes.quantityInStock) {
        // It's a plain object
        const change = update.changes.quantityInStock;
        quantityChange = Math.abs((change.newValue || 0) - (change.oldValue || 0));
      } else if (typeof update.changes === 'object') {
        // Try to find quantityInStock in the changes object
        const change = update.changes.quantityInStock || update.changes.get?.("quantityInStock");
        if (change) {
          quantityChange = Math.abs((change.newValue || 0) - (change.oldValue || 0));
        }
      }
      
      return quantityChange || 0;
    }
    return 0;
  }

  /**
   * Get summaries for a date range
   */
  static async getSummariesByDateRange(startDate, endDate) {
    try {
      const summaries = await Summary.find({
        startDate: { $gte: new Date(startDate) },
        endDate: { $lte: new Date(endDate) },
      })
        .sort({ createdAt: -1 })
        .lean();

      return summaries;
    } catch (error) {
      console.error("Error getting summaries by date range:", error);
      throw error;
    }
  }

  /**
   * Get summary by ID
   */
  static async getSummaryById(summaryId) {
    try {
      const summary = await Summary.findById(summaryId).lean();
      return summary;
    } catch (error) {
      console.error("Error getting summary by ID:", error);
      throw error;
    }
  }

  /**
   * Get summaries for a specific medication
   */
  static async getSummariesByMedication(medicationId, startDate, endDate) {
    try {
      const summaries = await Summary.find({
        "summaries.medication._id": medicationId,
        startDate: { $gte: new Date(startDate) },
        endDate: { $lte: new Date(endDate) },
      })
        .sort({ createdAt: -1 })
        .lean();

      return summaries;
    } catch (error) {
      console.error("Error getting summaries by medication:", error);
      throw error;
    }
  }

  /**
   * Get summaries for a specific service user
   */
  static async getSummariesByServiceUser(serviceUserId, startDate, endDate) {
    try {
      const summaries = await Summary.find({
        "summaries.serviceUser._id": serviceUserId,
        startDate: { $gte: new Date(startDate) },
        endDate: { $lte: new Date(endDate) },
      })
        .sort({ createdAt: -1 })
        .lean();

      return summaries;
    } catch (error) {
      console.error("Error getting summaries by service user:", error);
      throw error;
    }
  }
}

module.exports = SummaryService; 