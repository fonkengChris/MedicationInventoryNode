/* eslint-disable no-console */
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});
const mongoose = require("mongoose");

const MedicationAdministration = require("../models/medication_administration");
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
const coveragePercent = parseNumberFlag("--coverage", 85); // Percentage of scheduled doses to actually administer
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

// Status distribution: mostly on-time, some early/late, occasional issues
const statusWeights = {
  "on-time": 70,
  early: 10,
  late: 15,
  missed: 3,
  cancelled: 2,
};

function getRandomStatus() {
  const total = Object.values(statusWeights).reduce((sum, weight) => sum + weight, 0);
  let random = Math.random() * total;
  
  for (const [status, weight] of Object.entries(statusWeights)) {
    random -= weight;
    if (random <= 0) {
      return status;
    }
  }
  return "on-time";
}

// Special status notes (for status codes in MAR)
const specialNotes = [
  null, // Most administrations have no special notes
  null,
  null,
  null,
  null,
  "Refused by patient",
  "Nausea/Vomiting",
  "Patient on Leave",
  "Sleeping",
  "Pulse Abnormal",
  "Not Required",
  "Other reason",
];

function getRandomNotes(status) {
  // If status is missed or cancelled, add appropriate notes
  if (status === "missed") {
    return randomChoice(["Missed dose", "Patient unavailable", "Not given"]);
  }
  if (status === "cancelled") {
    return randomChoice(["Cancelled", "Not required today"]);
  }
  
  // Occasionally add special notes
  if (Math.random() < 0.15) {
    return randomChoice(specialNotes);
  }
  
  return null;
}

// Calculate administration time based on scheduled time and status
function calculateAdministeredTime(scheduledTime, status) {
  const [hours, minutes] = scheduledTime.split(":").map(Number);
  const scheduledDate = new Date();
  scheduledDate.setHours(hours, minutes, 0, 0);
  
  let offsetMinutes = 0;
  
  switch (status) {
    case "on-time":
      // Within ±5 minutes
      offsetMinutes = randomBetween(-5, 5);
      break;
    case "early":
      // 10-30 minutes early
      offsetMinutes = -randomBetween(10, 30);
      break;
    case "late":
      // 10-45 minutes late
      offsetMinutes = randomBetween(10, 45);
      break;
    case "missed":
    case "cancelled":
      // Use scheduled time (won't be displayed anyway)
      offsetMinutes = 0;
      break;
    default:
      offsetMinutes = randomBetween(-5, 5);
  }
  
  const administeredDate = new Date(scheduledDate);
  administeredDate.setMinutes(administeredDate.getMinutes() + offsetMinutes);
  
  return administeredDate;
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

// Generate all dates in the month
function generateDatesInMonth(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

async function generateAdministrations() {
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
    console.log(`Generating administrations for: ${monthName}`);
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
        scheduledDate: {
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
      
      const deleted = await MedicationAdministration.deleteMany(deleteQuery);
      console.log(`Cleared ${deleted.deletedCount} existing administrations\n`);
    }

    const allDates = generateDatesInMonth(startDate, endDate);
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
        
        if (!medication.administrationTimes || medication.administrationTimes.length === 0) {
          console.log(`      No administration times configured, skipping\n`);
          continue;
        }

        let medicationCount = 0;
        let medicationSkipped = 0;

        // Process each date in the month
        for (const date of allDates) {
          // Check if medication is active on this date
          if (medication.startDate > date) continue;
          if (medication.endDate && medication.endDate < date) continue;

          // Process each scheduled time for this medication
          for (const scheduledTime of medication.administrationTimes) {
            // Determine if we should create this administration based on coverage
            const shouldCreate = Math.random() * 100 < coveragePercent;

            if (!shouldCreate) {
              medicationSkipped++;
              continue;
            }

            const status = getRandomStatus();
            const notes = getRandomNotes(status);
            const administeredBy = randomChoice(staffUsers);
            const administeredAt = calculateAdministeredTime(scheduledTime, status);

            // Set scheduled date to the date we're processing (at midnight)
            const scheduledDate = new Date(date);
            scheduledDate.setHours(0, 0, 0, 0);

            const administrationData = {
              medication: medication._id,
              serviceUser: serviceUser._id,
              scheduledDate,
              scheduledTime,
              administeredAt,
              administeredBy: administeredBy._id,
              quantity: medication.quantityPerDose || 1,
              status,
              notes: notes || undefined,
            };

            if (dryRun) {
              console.log(`      [DRY RUN] Would create: ${date.toISOString().split("T")[0]} ${scheduledTime} - ${status}${notes ? ` (${notes})` : ""}`);
            } else {
              // Check if administration already exists
              const existing = await MedicationAdministration.findOne({
                medication: medication._id,
                serviceUser: serviceUser._id,
                scheduledDate,
                scheduledTime,
              });

              if (existing) {
                medicationSkipped++;
                continue;
              }

              await MedicationAdministration.create(administrationData);
              medicationCount++;
            }
          }
        }

        if (dryRun) {
          console.log(`      [DRY RUN] Would create ${medicationCount} administrations, skip ${medicationSkipped}\n`);
        } else {
          console.log(`      Created ${medicationCount} administrations, skipped ${medicationSkipped} (already exist or not in coverage)\n`);
        }

        totalGenerated += medicationCount;
        totalSkipped += medicationSkipped;
      }
    }

    console.log("\n" + "=".repeat(60));
    if (dryRun) {
      console.log(`[DRY RUN] Would generate ${totalGenerated} administrations`);
      console.log(`[DRY RUN] Would skip ${totalSkipped} administrations`);
    } else {
      console.log(`Successfully generated ${totalGenerated} administrations`);
      console.log(`Skipped ${totalSkipped} administrations (already exist or not in coverage)`);
    }
    console.log("=".repeat(60));

  } catch (error) {
    console.error("Error generating administrations:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("\nDatabase connection closed");
  }
}

// Run the script
generateAdministrations();

