/* eslint-disable no-console */
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});
const mongoose = require("mongoose");

const DailyStock = require("../models/daily_stock");
const ActiveMedication = require("../models/active_medication");
const ServiceUser = require("../models/service_user");
const User = require("../models/User");

const args = process.argv.slice(2);

const getFlagValue = (flag, defaultValue) => {
  const withEquals = args.find((arg) => arg.startsWith(`${flag}=`));
  if (withEquals) {
    return withEquals.split("=")[1];
  }

  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }

  return defaultValue;
};

const parseNumberFlag = (flag, defaultValue) => {
  const value = Number(getFlagValue(flag, defaultValue));
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
};

// Parse command line arguments
const monthOffset = parseNumberFlag("--month-offset", 0); // 0 = current month, -1 = last month, etc.
const changesPerMonth = parseNumberFlag("--changes-per-month", 15); // Number of changes to generate per medication per month
const createMarEntries = !args.includes("--no-mar-entries"); // Create PRN entries in MAR for status code changes
const dryRun = args.includes("--dry-run");
const clearExisting = args.includes("--clear");
const serviceUserId = getFlagValue("--service-user", null);
const medicationId = getFlagValue("--medication", null);

if (!process.env.MONGODB_URI) {
  console.error("Missing MONGODB_URI in environment. Please configure your database connection.");
  process.exit(1);
}

// Helper functions
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = (items) => items[randomBetween(0, items.length - 1)];
const randomFloat = (min, max) => Math.random() * (max - min) + min;

// Change types that are NOT administrations (excluding "Quantity Administered")
const changeTypes = [
  "From Pharmacy",
  "Leaving Home",
  "Returning Home",
  "Returned to Pharmacy",
  "Lost",
  "Damaged",
  "Other",
];

// Change type distribution (weights)
const changeTypeWeights = {
  "From Pharmacy": 25, // Common - stock received
  "Leaving Home": 10, // Patient going out
  "Returning Home": 8, // Patient returning
  "Returned to Pharmacy": 5, // Unused medication returned
  "Lost": 3, // Medication lost
  "Damaged": 4, // Medication damaged/destroyed
  "Other": 5, // Other changes
};

function getRandomChangeType() {
  const total = Object.values(changeTypeWeights).reduce((sum, weight) => sum + weight, 0);
  let random = Math.random() * total;
  
  for (const [type, weight] of Object.entries(changeTypeWeights)) {
    random -= weight;
    if (random <= 0) {
      return type;
    }
  }
  return "Other";
}

// Notes that map to MAR codes
const marCodeNotes = {
  "Damaged": [
    "Destroyed - Expired",
    "Destroyed - Contaminated",
    "Destroyed - Damaged packaging",
    "Destroyed - Medication spoiled",
  ],
  "Leaving Home": [
    "Patient on Leave",
    "On Leave - Family visit",
    "On Leave - Hospital appointment",
    "On Leave - Day trip",
  ],
  "Returning Home": [
    "Patient returned from Leave",
    "Returned from hospital",
    "Returned from visit",
  ],
  "Lost": [
    "Lost medication",
    "Cannot locate medication",
    "Missing medication",
  ],
  "Returned to Pharmacy": [
    "Returned to pharmacy - No longer needed",
    "Returned to pharmacy - Changed prescription",
    "Returned to pharmacy - Expired",
  ],
  "From Pharmacy": [
    "Received from pharmacy",
    "Stock replenished from pharmacy",
    "New supply received",
  ],
  "Other": [
    "Stock adjustment",
    "Inventory correction",
    "Other - See notes",
    "Refused by patient",
    "Nausea/Vomiting - Cannot take",
    "Pulse Abnormal - Medication withheld",
    "Not Required today",
    "Sleeping - Dose delayed",
  ],
};

// Change types that should create MAR entries with status codes
const marRelevantChanges = [
  "Damaged", // D - Destroyed
  "Leaving Home", // L - On Leave
  "Lost", // Could map to O - Other
  "Other", // Various codes (R, N, P, NR, S, O)
];

// Map change types to MAR status codes (for PRN entries)
function getMarStatusCode(changeType, notes) {
  if (!notes) return null;
  
  const noteUpper = notes.toUpperCase();
  
  if (changeType === "Damaged" || noteUpper.includes("DESTROYED")) {
    return "D";
  }
  if (changeType === "Leaving Home" || noteUpper.includes("ON LEAVE") || noteUpper.includes("LEAVE")) {
    return "L";
  }
  if (noteUpper.includes("REFUSED")) {
    return "R";
  }
  if (noteUpper.includes("NAUSEA") || noteUpper.includes("VOMITING")) {
    return "N";
  }
  if (noteUpper.includes("PULSE ABNORMAL") || noteUpper.includes("PULSE")) {
    return "P";
  }
  if (noteUpper.includes("NOT REQUIRED")) {
    return "NR";
  }
  if (noteUpper.includes("SLEEPING")) {
    return "S";
  }
  if (noteUpper.includes("HOSPITAL")) {
    return "H";
  }
  
  return "O"; // Other
}

function getNotesForChangeType(changeType) {
  const notes = marCodeNotes[changeType];
  if (!notes || notes.length === 0) {
    return null;
  }
  
  // 80% chance of having a note
  if (Math.random() < 0.8) {
    return randomChoice(notes);
  }
  
  return null;
}

// Calculate quantity change based on change type
function calculateQuantityChange(changeType, currentStock, quantityPerDose) {
  switch (changeType) {
    case "From Pharmacy":
      // Stock increase: 10-50 units (or 5-20 doses)
      return randomBetween(quantityPerDose * 5, quantityPerDose * 20);
    
    case "Leaving Home":
      // Patient takes medication with them: 1-7 days supply
      const daysSupply = randomBetween(1, 7);
      return -(quantityPerDose * daysSupply);
    
    case "Returning Home":
      // Patient returns with medication: 0-5 days supply (partial return)
      const returnDays = randomBetween(0, 5);
      return quantityPerDose * returnDays;
    
    case "Returned to Pharmacy":
      // Return unused medication: 5-30 units
      return -(randomBetween(quantityPerDose * 5, quantityPerDose * 30));
    
    case "Lost":
      // Lost medication: 1-10 units
      return -(randomBetween(quantityPerDose, quantityPerDose * 10));
    
    case "Damaged":
      // Damaged/destroyed: 1-5 units
      return -(randomBetween(quantityPerDose, quantityPerDose * 5));
    
    case "Other":
      // Other changes: small adjustments
      return randomBetween(-quantityPerDose * 2, quantityPerDose * 5);
    
    default:
      return 0;
  }
}

// Get date range for the month
function getMonthDateRange(monthOffset) {
  const now = new Date();
  const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const startDate = new Date(targetMonth);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
  endDate.setHours(23, 59, 59, 999);
  
  return { startDate, endDate };
}

// Generate random dates within the month
function generateRandomDatesInMonth(startDate, endDate, count) {
  const dates = [];
  const timeDiff = endDate.getTime() - startDate.getTime();
  
  for (let i = 0; i < count; i++) {
    const randomTime = startDate.getTime() + Math.random() * timeDiff;
    const date = new Date(randomTime);
    date.setHours(randomBetween(8, 18), randomBetween(0, 59), 0, 0);
    dates.push(date);
  }
  
  // Sort dates
  dates.sort((a, b) => a.getTime() - b.getTime());
  return dates;
}

async function generateChanges() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB\n");

    // Get date range
    const { startDate, endDate } = getMonthDateRange(monthOffset);
    const monthName = startDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    console.log(`Generating medication changes for: ${monthName}`);
    console.log(`Date range: ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}\n`);

    // Find service users
    let serviceUsers;
    if (serviceUserId) {
      const user = await ServiceUser.findById(serviceUserId);
      serviceUsers = user ? [user] : [];
    } else {
      serviceUsers = await ServiceUser.find().limit(5);
    }

    if (serviceUsers.length === 0) {
      console.error("No service users found. Please create service users first.");
      process.exit(1);
    }

    console.log(`Found ${serviceUsers.length} service user(s)`);

    // Find staff users
    const staffUsers = await User.find({ role: { $in: ["admin", "user"] } }).limit(10);
    if (staffUsers.length === 0) {
      console.error("No staff users found. Please create users first.");
      process.exit(1);
    }
    console.log(`Found ${staffUsers.length} staff member(s)\n`);

    // Clear existing if requested
    if (clearExisting && !dryRun) {
      const deleteQuery = {
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      };
      if (serviceUserId) {
        deleteQuery.serviceUser = serviceUserId;
      }
      if (medicationId) {
        deleteQuery.medication = medicationId;
      }
      
      // Delete DailyStock records (this will also remove changes)
      const deleted = await DailyStock.deleteMany(deleteQuery);
      console.log(`Cleared ${deleted.deletedCount} existing daily stock records\n`);
    }

    let totalGenerated = 0;
    let totalSkipped = 0;

    // Process each service user
    for (const serviceUser of serviceUsers) {
      console.log(`Processing service user: ${serviceUser.name} (${serviceUser._id})`);

      // Find active medications for this service user
      let medications;
      if (medicationId) {
        const med = await ActiveMedication.findOne({
          _id: medicationId,
          serviceUser: serviceUser._id,
          isActive: true,
        });
        medications = med ? [med] : [];
      } else {
        medications = await ActiveMedication.find({
          serviceUser: serviceUser._id,
          isActive: true,
          startDate: { $lte: endDate },
          $or: [{ endDate: null }, { endDate: { $gte: startDate } }],
        }).limit(10);
      }

      if (medications.length === 0) {
        console.log(`  No active medications found for this service user\n`);
        continue;
      }

      console.log(`  Found ${medications.length} active medication(s)`);

      // Process each medication
      for (const medication of medications) {
        console.log(`    Medication: ${medication.medicationName}`);
        console.log(`      Current stock: ${medication.quantityInStock}`);

        // Generate random dates for changes
        const changeDates = generateRandomDatesInMonth(startDate, endDate, changesPerMonth);
        let medicationChanges = 0;
        let medicationSkipped = 0;
        let currentStock = medication.quantityInStock;

        // Process each change date
        for (const changeDate of changeDates) {
          // Check if medication is active on this date
          if (medication.startDate > changeDate) continue;
          if (medication.endDate && medication.endDate < changeDate) continue;

          const changeType = getRandomChangeType();
          const quantityChange = calculateQuantityChange(
            changeType,
            currentStock,
            medication.quantityPerDose
          );

          // Don't allow stock to go negative (for decreases)
          if (quantityChange < 0 && Math.abs(quantityChange) > currentStock) {
            medicationSkipped++;
            continue;
          }

          const notes = getNotesForChangeType(changeType);
          const updatedBy = randomChoice(staffUsers);
          const quantity = Math.abs(quantityChange);

          // Update current stock for next iteration
          currentStock += quantityChange;
          if (currentStock < 0) currentStock = 0;

          // Normalize date to start of day for DailyStock
          const stockDate = new Date(changeDate);
          stockDate.setHours(0, 0, 0, 0);

          if (dryRun) {
            console.log(`      [DRY RUN] ${changeDate.toISOString().split("T")[0]} ${changeDate.toTimeString().substring(0, 5)} - ${changeType}: ${quantityChange > 0 ? "+" : ""}${quantityChange}${notes ? ` (${notes})` : ""}`);
          } else {
            try {
              // Get or create DailyStock record
              let dailyStock = await DailyStock.findOne({
                medication: medication._id,
                date: stockDate,
              });

              if (!dailyStock) {
                dailyStock = new DailyStock({
                  medication: medication._id,
                  serviceUser: serviceUser._id,
                  date: stockDate,
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

              // Add the change record
              const change = {
                type: changeType,
                quantity: quantity,
                note: notes || undefined,
                timestamp: changeDate,
                updatedBy: updatedBy._id,
              };

              dailyStock.changes.push(change);

              // Update totals
              const changeTypeKey = changeType.toLowerCase().replace(/\s+/g, "");
              if (dailyStock.totals.hasOwnProperty(changeTypeKey)) {
                dailyStock.totals[changeTypeKey] += quantity;
              }

              // Create MAR PRN entry for changes that should appear in MAR grid
              // Add a "Quantity Administered" change with quantity 0 for status code entries
              if (createMarEntries && marRelevantChanges.includes(changeType) && notes) {
                const marCode = getMarStatusCode(changeType, notes);
                if (marCode) {
                  // Add a PRN-style "Quantity Administered" change to the same DailyStock record
                  // This will appear in the MAR grid as a PRN entry with the status code
                  const prnChange = {
                    type: "Quantity Administered",
                    quantity: 0, // No quantity - just status code
                    note: notes, // Notes contain the status code keywords
                    timestamp: changeDate,
                    updatedBy: updatedBy._id,
                  };

                  dailyStock.changes.push(prnChange);
                  // No change to totals.quantityAdministered for PRN status entries
                }
              }

              // Update stock level (simulated - in real scenario, this would update ActiveMedication)
              dailyStock.stockLevel = currentStock;
              dailyStock.daysRemaining = Math.floor(
                currentStock / (medication.quantityPerDose * medication.dosesPerDay)
              );

              await dailyStock.save();
              medicationChanges++;

              // Update the actual medication stock (for realism)
              // Note: In production, this should go through the proper update route
              await ActiveMedication.findByIdAndUpdate(medication._id, {
                quantityInStock: currentStock,
              });

            } catch (error) {
              console.error(`      Error creating change: ${error.message}`);
              medicationSkipped++;
            }
          }
        }

        if (dryRun) {
          console.log(`      [DRY RUN] Would create ${medicationChanges} changes, skip ${medicationSkipped}`);
          console.log(`      [DRY RUN] Final stock would be: ${currentStock}\n`);
        } else {
          console.log(`      Created ${medicationChanges} changes, skipped ${medicationSkipped}`);
          console.log(`      Final stock: ${currentStock}\n`);
        }

        totalGenerated += medicationChanges;
        totalSkipped += medicationSkipped;
      }
    }

    console.log("\n" + "=".repeat(60));
    if (dryRun) {
      console.log(`[DRY RUN] Would generate ${totalGenerated} medication changes`);
      console.log(`[DRY RUN] Would skip ${totalSkipped} changes`);
    } else {
      console.log(`Successfully generated ${totalGenerated} medication changes`);
      console.log(`Skipped ${totalSkipped} changes`);
    }
    console.log("=".repeat(60));

  } catch (error) {
    console.error("Error generating medication changes:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("\nDatabase connection closed");
  }
}

// Run the script
generateChanges();

