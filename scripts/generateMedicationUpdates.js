/* eslint-disable no-console */
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});
const mongoose = require("mongoose");

const ActiveMedication = require("../models/active_medication");
const MedicationUpdate = require("../models/medication_update");
const User = require("../models/User");

// Get the helper function with fallback
const getCategoryFromUpdateType = MedicationUpdate.getCategoryFromUpdateType || ((updateType) => {
  const quantitativeTypes = [
    "MedStock Increase",
    "MedStock Decrease",
    "Quantity Per Dose Change",
    "Doses Per Day Change",
  ];
  return quantitativeTypes.includes(updateType) ? "quantitative" : "qualitative";
});

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

const daysToGenerate = parseNumberFlag("--days", 30);
const updatesPerMedication = parseNumberFlag("--per-med", 6);
const medicationLimit = Number(getFlagValue("--med-limit", NaN));
const dryRun = args.includes("--dry-run");
const clearExisting = args.includes("--clear");

if (!process.env.MONGODB_URI) {
  console.error("Missing MONGODB_URI in environment. Please configure your database connection.");
  process.exit(1);
}

const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = (items) => items[randomBetween(0, items.length - 1)];
const toTwoDigits = (num) => num.toString().padStart(2, "0");

const calculateDaysRemaining = (state) => {
  if (
    !Number.isFinite(state.quantityInStock) ||
    !Number.isFinite(state.quantityPerDose) ||
    !Number.isFinite(state.dosesPerDay) ||
    state.quantityPerDose <= 0 ||
    state.dosesPerDay <= 0
  ) {
    return 0;
  }
  return Math.floor(state.quantityInStock / (state.quantityPerDose * state.dosesPerDay));
};

const generateAdministrationTimes = (dosesPerDay) => {
  const defaultSlots = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];
  const safeDosesPerDay = Number.isFinite(dosesPerDay) && dosesPerDay > 0 ? dosesPerDay : 1;
  const result = new Set();
  while (result.size < Math.max(1, Math.min(safeDosesPerDay, defaultSlots.length))) {
    result.add(randomChoice(defaultSlots));
  }
  return Array.from(result).sort();
};

const buildUpdateGenerators = () => [
  (state) => {
    const changeAmount = randomBetween(5, 25);
    const oldStock = state.quantityInStock;
    const newStock = oldStock + changeAmount;
    state.quantityInStock = newStock;

    const increaseScenarios = [
      {
        category: "pharmacy",
        buildNote: () =>
          `Pharmacy delivery received: ${changeAmount} units added to stock.`,
      },
      {
        category: "returning",
        buildNote: () =>
          `Medication returned from leave with ${changeAmount} units.`,
      },
      {
        category: "other",
        buildNote: () =>
          `Stock reconciled after audit (+${changeAmount} units).`,
      },
    ];

    const scenario = randomChoice(increaseScenarios);
    const note = scenario.buildNote();

    return {
      updateType: "MedStock Increase",
      changes: {
        quantityInStock: { oldValue: oldStock, newValue: newStock },
        daysRemaining: {
          oldValue: calculateDaysRemaining({ ...state, quantityInStock: oldStock }),
          newValue: calculateDaysRemaining(state),
        },
      },
      notes: note,
    };
  },
  (state) => {
    const oldStock = state.quantityInStock;
    if (oldStock <= 0) {
      return null;
    }
    const changeAmount = randomBetween(3, Math.max(3, Math.floor(oldStock * 0.4)));
    const newStock = Math.max(0, oldStock - changeAmount);
    state.quantityInStock = newStock;

    const decreaseScenarios = [
      {
        category: "administered",
        buildNote: () =>
          `Medication administered ${changeAmount} units recorded.`,
      },
      {
        category: "leaving",
        buildNote: () =>
          `${changeAmount} units issued for service user leaving home.`,
      },
      {
        category: "returnedToPharmacy",
        buildNote: () =>
          `${changeAmount} units returned to pharmacy due to course completion.`,
      },
      {
        category: "lost",
        buildNote: () =>
          `Reported lost: ${changeAmount} units missing from stock.`,
      },
      {
        category: "damaged",
        buildNote: () =>
          `Damaged packaging discarded (${changeAmount} units).`,
      },
    ];

    const scenario = randomChoice(decreaseScenarios);
    const note = scenario.buildNote();

    return {
      updateType: "MedStock Decrease",
      changes: {
        quantityInStock: { oldValue: oldStock, newValue: newStock },
        daysRemaining: {
          oldValue: calculateDaysRemaining({ ...state, quantityInStock: oldStock }),
          newValue: calculateDaysRemaining(state),
        },
      },
      notes: note,
    };
  },
  (state) => {
    const oldDose = state.quantityPerDose;
    const change = randomBetween(-1, 1);
    const newDose = Math.max(1, oldDose + (change === 0 ? 1 : change));
    state.quantityPerDose = newDose;
    return {
      updateType: "Quantity Per Dose Change",
      changes: {
        quantityPerDose: { oldValue: oldDose, newValue: newDose },
        daysRemaining: {
          oldValue: calculateDaysRemaining({ ...state, quantityPerDose: oldDose }),
          newValue: calculateDaysRemaining(state),
        },
      },
      notes: `Adjusted quantity per dose to ${newDose}.`,
    };
  },
  (state) => {
    const oldDoses = state.dosesPerDay;
    const change = randomBetween(-1, 1);
    const newDoses = Math.max(1, (Number.isFinite(oldDoses) ? oldDoses : 1) + (change === 0 ? 1 : change));
    state.dosesPerDay = newDoses;
    return {
      updateType: "Doses Per Day Change",
      changes: {
        dosesPerDay: { oldValue: oldDoses, newValue: newDoses },
        daysRemaining: {
          oldValue: calculateDaysRemaining({ ...state, dosesPerDay: oldDoses }),
          newValue: calculateDaysRemaining(state),
        },
      },
      notes: `Updated daily dose frequency to ${newDoses} times per day.`,
    };
  },
  (state) => {
    const options = ["Once daily", "Twice daily", "Every 6 hours", "Every 8 hours", "Alternate days", "As needed"];
    const oldFrequency = state.frequency || "Once daily";
    let newFrequency = randomChoice(options);
    let safetyCounter = 0;
    while (newFrequency === oldFrequency && safetyCounter < options.length) {
      newFrequency = randomChoice(options);
      safetyCounter += 1;
    }
    state.frequency = newFrequency;
    return {
      updateType: "Frequency Change",
      changes: {
        frequency: { oldValue: oldFrequency, newValue: newFrequency },
      },
      notes: `Frequency adjusted from ${oldFrequency} to ${newFrequency}.`,
    };
  },
  (state) => {
    const oldTimes = Array.isArray(state.administrationTimes) ? state.administrationTimes : [];
    const newTimes = generateAdministrationTimes(state.dosesPerDay);
    state.administrationTimes = newTimes;
    return {
      updateType: "Administration Times Change",
      changes: {
        administrationTimes: { oldValue: oldTimes, newValue: newTimes },
      },
      notes: `Administration times updated to ${newTimes.join(", ")}.`,
    };
  },
  (state) => {
    const dosageUnits = state.dosageUnit || "mg";
    const oldDosage = state.dosageAmount;
    const newDosage = Math.max(1, oldDosage + randomBetween(-2, 2));
    state.dosageAmount = newDosage;
    return {
      updateType: "Dosage Change",
      changes: {
        dosage: {
          oldValue: `${oldDosage} ${dosageUnits}`,
          newValue: `${newDosage} ${dosageUnits}`,
        },
      },
      notes: `Dosage modified to ${newDosage} ${dosageUnits}.`,
    };
  },
  (state) => {
    const noteFragments = [
      "Take with food.",
      "Monitor blood pressure before administration.",
      "Ensure hydration prior to dose.",
      "Observe for adverse reactions for 30 minutes.",
      "Administer while seated to avoid dizziness.",
    ];
    const oldInstructions = state.instructions || "No additional instructions";
    const extra = randomChoice(noteFragments);
    const newInstructions = `${oldInstructions} ${extra}`.trim();
    state.instructions = newInstructions;
    return {
      updateType: "Instructions Change",
      changes: {
        instructions: { oldValue: oldInstructions, newValue: newInstructions },
      },
      notes: `Instructions updated with: ${extra}`,
    };
  },
  (state) => {
    if (state.isActive) {
      return null;
    }
    state.isActive = true;
    return {
      updateType: "Activated",
      changes: {
        isActive: { oldValue: false, newValue: true },
      },
      notes: "Medication reactivated after review.",
    };
  },
  (state) => {
    if (!state.isActive) {
      return null;
    }
    state.isActive = false;
    return {
      updateType: "Deactivated",
      changes: {
        isActive: { oldValue: true, newValue: false },
      },
      notes: "Medication temporarily paused pending review.",
    };
  },
  (state) => {
    const adjectives = ["Advanced", "Extended", "Rapid", "Calm", "Prime", "Ultra"];
    const oldName = state.medicationName;
    const newName = `${randomChoice(adjectives)} ${oldName}`;
    state.medicationName = newName;
    return {
      updateType: "Name Change",
      changes: {
        medicationName: { oldValue: oldName, newValue: newName },
      },
      notes: `Renamed medication to ${newName}.`,
    };
  },
];

const parseMedicationState = (medication) => ({
  medicationId: medication._id,
  medicationName: medication.medicationName,
  dosageAmount: Number.isFinite(medication.dosage?.amount)
    ? medication.dosage.amount
    : 1,
  dosageUnit: medication.dosage?.unit || "mg",
  quantityInStock: Number.isFinite(medication.quantityInStock)
    ? medication.quantityInStock
    : 0,
  quantityPerDose: Number.isFinite(medication.quantityPerDose)
    ? medication.quantityPerDose
    : 1,
  dosesPerDay: Number.isFinite(medication.dosesPerDay)
    ? medication.dosesPerDay
    : 1,
  administrationTimes: Array.isArray(medication.administrationTimes)
    ? medication.administrationTimes
    : [],
  frequency: medication.frequency || "Once daily",
  instructions: medication.instructions || "",
  isActive: typeof medication.isActive === "boolean" ? medication.isActive : true,
});

const randomDateBetween = (start, end) => {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return new Date(startTime + Math.random() * (endTime - startTime));
};

const main = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const userQuery = await User.find({}, { _id: 1, username: 1 }).lean();
    if (!userQuery.length) {
      throw new Error("No users found in the database. Seed at least one user before generating updates.");
    }

    const medicationQuery = await ActiveMedication.find()
      .sort({ medicationName: 1 })
      .limit(Number.isFinite(medicationLimit) ? medicationLimit : 0)
      .lean();

    if (!medicationQuery.length) {
      throw new Error("No active medications found. Seed medications before generating updates.");
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - Math.max(0, daysToGenerate - 1));

    const generators = buildUpdateGenerators();
    const updatesToInsert = [];

    medicationQuery.forEach((medication) => {
      const state = parseMedicationState(medication);
      const generatorPool = [...generators];
      const medUpdates = [];

      for (let i = 0; i < updatesPerMedication; i += 1) {
        if (!generatorPool.length) {
          generatorPool.push(...generators);
        }
        const generatorIndex = randomBetween(0, generatorPool.length - 1);
        const [generator] = generatorPool.splice(generatorIndex, 1);
        const result = generator(state);
        if (!result) {
          continue;
        }

        medUpdates.push({
          medication: {
            _id: state.medicationId,
            medicationName: state.medicationName,
            quantityInStock: state.quantityInStock,
            quantityPerDose: state.quantityPerDose,
            dosesPerDay: state.dosesPerDay,
            daysRemaining: calculateDaysRemaining(state),
          },
          updatedBy: randomChoice(userQuery)._id,
          updateType: result.updateType,
          category: getCategoryFromUpdateType(result.updateType),
          changes: result.changes,
          notes: result.notes,
          timestamp: randomDateBetween(startDate, endDate),
        });
      }

      updatesToInsert.push(...medUpdates);
    });

    if (!updatesToInsert.length) {
      console.log("No updates were generated. Try increasing --per-med or ensuring medications are available.");
      return;
    }

    // Sort chronologically for readability in the UI
    updatesToInsert.sort((a, b) => a.timestamp - b.timestamp);

    if (clearExisting) {
      const deleteResult = await MedicationUpdate.deleteMany({
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
      });
      console.log(`Cleared ${deleteResult.deletedCount} existing updates in the selected range.`);
    }

    if (dryRun) {
      console.log(`[Dry Run] Prepared ${updatesToInsert.length} medication updates between ${startDate.toDateString()} and ${endDate.toDateString()}.`);
    } else {
      const inserted = await MedicationUpdate.insertMany(updatesToInsert);
      console.log(`Inserted ${inserted.length} medication updates between ${startDate.toDateString()} and ${endDate.toDateString()}.`);
    }
  } catch (error) {
    console.error("Failed to generate medication updates:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
};

main();

