const bcrypt = require("bcryptjs");
const User = require("../../models/User");
const Group = require("../../models/group");
const ServiceUser = require("../../models/service_user");
const Medication = require("../../models/medication");
const ActiveMedication = require("../../models/active_medication");
const Appointment = require("../../models/appointment");
const { signToken } = require("../utils/token");

const uniqueSuffix = () => Math.random().toString(36).substring(2, 8);

async function createUserFixture(overrides = {}) {
  const {
    username = `user-${uniqueSuffix()}`,
    email = `user-${uniqueSuffix()}@example.com`,
    password = "Password123!",
    role = "user",
    phoneNumber = "+1234567890",
    groups = [],
    notificationPreferences,
  } = overrides;

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    username,
    email,
    password: hashedPassword,
    role,
    phoneNumber,
    groups,
    notificationPreferences,
  });

  return {
    user,
    token: signToken(user),
    plainPassword: password,
  };
}

async function createGroupFixture({ createdBy, overrides = {} }) {
  const {
    name = `Group ${uniqueSuffix()}`,
    description = "Care home group",
  } = overrides;

  const group = await Group.create({
    name,
    description,
    createdBy,
  });

  return group;
}

async function createServiceUserFixture({ group, overrides = {} }) {
  const {
    name = `Service User ${uniqueSuffix()}`,
    dateOfBirth = new Date("1970-01-01"),
    nhsNumber = `${Date.now()}${Math.floor(Math.random() * 1000)}`,
    address = "1 Main Street",
    phoneNumber = "+441234567890",
    emergencyContact = {
      name: "Emergency Contact",
      relationship: "Friend",
      phoneNumber: "+441234567891",
    },
  } = overrides;

  const serviceUser = await ServiceUser.create({
    name,
    dateOfBirth,
    nhsNumber,
    address,
    phoneNumber,
    group,
    emergencyContact,
  });

  return serviceUser;
}

async function createMedicationFixture(overrides = {}) {
  const {
    name = `Medication ${uniqueSuffix()}`,
    dosage = "500mg",
    form = "tablet",
    route = "oral",
    manufacturer = "HealthCorp",
    notes = "Take with water",
  } = overrides;

  const medication = await Medication.create({
    name,
    dosage,
    form,
    route,
    manufacturer,
    notes,
  });

  return medication;
}

async function createActiveMedicationFixture({
  serviceUser,
  updatedBy,
  overrides = {},
}) {
  const now = new Date();
  const defaults = {
    medicationName: `Active Med ${uniqueSuffix()}`,
    dosage: {
      amount: 1,
      unit: "tablets",
    },
    quantityInStock: 30,
    quantityPerDose: 1,
    dosesPerDay: 2,
    administrationTimes: ["08:00", "20:00"],
    frequency: "Daily",
    startDate: now,
    endDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    prescribedBy: "Dr. Test",
    instructions: "Take after meals",
    isActive: true,
  };

  const payload = {
    ...defaults,
    ...overrides,
    dosage: {
      ...defaults.dosage,
      ...(overrides.dosage || {}),
    },
  };

  const activeMedication = await ActiveMedication.create({
    ...payload,
    serviceUser,
    updatedBy,
  });

  return activeMedication;
}

async function createAppointmentFixture({
  serviceUser,
  createdBy,
  overrides = {},
}) {
  const now = new Date();
  const {
    appointmentType = "Check-up",
    dateTime = new Date(now.getTime() + 2 * 60 * 60 * 1000),
    duration = 30,
    location = "Clinic Room 1",
    provider = "Dr. Smith",
    notes = "Bring medication list",
    status = "Scheduled",
    reminderSent = false,
    updatedBy = createdBy,
  } = overrides;

  const appointment = await Appointment.create({
    serviceUser,
    appointmentType,
    dateTime,
    duration,
    location,
    provider,
    notes,
    status,
    reminderSent,
    createdBy,
    updatedBy,
  });

  return appointment;
}

module.exports = {
  createUserFixture,
  createGroupFixture,
  createServiceUserFixture,
  createMedicationFixture,
  createActiveMedicationFixture,
  createAppointmentFixture,
  uniqueSuffix,
};

