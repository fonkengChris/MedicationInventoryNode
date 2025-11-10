const ActiveMedication = require("../models/active_medication");
const MedicationAdministration = require("../models/medication_administration");
const AdministrationSettingsService = require("./administrationSettingsService");

function parseTimeString(timeString) {
  if (!timeString) return null;
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToDate(date, minutes) {
  const result = new Date(date);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  result.setHours(hours, mins, 0, 0);
  return result;
}

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

class AdministrationWindowService {
  static buildWindowsForMedication(medication, date, settings) {
    const scheduleTimes =
      medication.administrationTimes && medication.administrationTimes.length
        ? medication.administrationTimes
        : [];

    if (!scheduleTimes.length) {
      return [];
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    return scheduleTimes.map((timeString) => {
      const scheduledMinutes = parseTimeString(timeString);
      const windowStartMinutes = Math.max(
        0,
        scheduledMinutes - settings.thresholdBefore
      );
      const windowEndMinutes = Math.min(
        24 * 60,
        scheduledMinutes + settings.thresholdAfter
      );

      const scheduledDateTime = minutesToDate(targetDate, scheduledMinutes);
      const scheduledDateOnly = new Date(targetDate);

      const windowStart = minutesToDate(targetDate, windowStartMinutes);
      const windowEnd = minutesToDate(targetDate, windowEndMinutes);

      return {
        medicationId: medication._id,
        scheduledTime: timeString,
        scheduledDate: scheduledDateOnly,
        scheduledDateTime,
        windowStart,
        windowEnd,
      };
    });
  }

  static isWithinWindow({ now, windowStart, windowEnd }) {
    return now >= windowStart && now <= windowEnd;
  }

  static async getAvailableMedications({ serviceUserId, date, now, groupId, userId }) {
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const effectiveNow = now ? new Date(now) : new Date();

    const settings = await AdministrationSettingsService.getSettings({
      groupId,
      userId,
    });

    const medications = await ActiveMedication.find({
      serviceUser: serviceUserId,
      isActive: true,
      startDate: { $lte: targetDate },
      $or: [{ endDate: null }, { endDate: { $gte: targetDate } }],
    })
      .populate("serviceUser", "name nhsNumber")
      .populate("updatedBy", "username email")
      .lean();

    const windows = medications.flatMap((medication) =>
      AdministrationWindowService.buildWindowsForMedication(
        medication,
        targetDate,
        settings
      )
    );

    const medicationAvailability = medications.map((medication) => {
      const medicationWindows = windows.filter((w) =>
        w.medicationId.equals(medication._id)
      );

      if (!medicationWindows.length) {
        return {
          medication,
          availability: "no-schedule",
          currentWindow: null,
          nextWindow: null,
        };
      }

      const currentWindow = medicationWindows.find((window) =>
        AdministrationWindowService.isWithinWindow({
          now: effectiveNow,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
        })
      );

      const futureWindows = medicationWindows
        .filter((window) => effectiveNow < window.windowStart)
        .sort((a, b) => a.windowStart - b.windowStart);

      const pastWindows = medicationWindows
        .filter((window) => effectiveNow > window.windowEnd)
        .sort((a, b) => b.windowEnd - a.windowEnd);

      const format = (window) =>
        window ? AdministrationWindowService.formatWindow(window) : null;

      return {
        medication,
        availability: currentWindow
          ? "available"
          : futureWindows.length
          ? "upcoming"
          : "unavailable",
        currentWindow: format(currentWindow),
        nextWindow: currentWindow ? null : format(futureWindows[0]),
        lastWindow: format(pastWindows[0]),
      };
    });

    return {
      settings,
      now: effectiveNow,
      medications: medicationAvailability,
    };
  }

  static async validateAdministration({
    medicationId,
    serviceUserId,
    timestamp,
    groupId,
    userId,
  }) {
    const medication = await ActiveMedication.findOne({
      _id: medicationId,
      serviceUser: serviceUserId,
      isActive: true,
    })
      .populate("serviceUser", "name")
      .lean();

    if (!medication) {
      return {
        valid: false,
        reason: "Medication not found or inactive for the service user.",
      };
    }

    const administrationTime = timestamp ? new Date(timestamp) : new Date();
    const settings = await AdministrationSettingsService.getSettings({
      groupId,
      userId,
    });

    const date = new Date(administrationTime);
    date.setHours(0, 0, 0, 0);

    const windows = AdministrationWindowService.buildWindowsForMedication(
      medication,
      date,
      settings
    );

    if (!windows.length) {
      return {
        valid: false,
        reason: "No administration schedule defined for this medication.",
      };
    }

    const matchingWindow = windows.find((window) =>
      AdministrationWindowService.isWithinWindow({
        now: administrationTime,
        windowStart: window.windowStart,
        windowEnd: window.windowEnd,
      })
    );

    if (!matchingWindow) {
      return {
        valid: false,
        reason: "Administration is outside the allowed window.",
        windows,
      };
    }

    const existingAdministration = await MedicationAdministration.findOne({
      medication: medicationId,
      serviceUser: serviceUserId,
      scheduledDate: matchingWindow.scheduledDate,
      scheduledTime: matchingWindow.scheduledTime,
    }).lean();

    if (existingAdministration) {
      return {
        valid: false,
        reason: "This scheduled administration has already been recorded.",
        existingAdministration,
      };
    }

    return {
      valid: true,
      window: matchingWindow,
      settings,
    };
  }

  static evaluateStatus({ administrationTime, window }) {
    if (administrationTime < window.windowStart) {
      return "early";
    }

    if (administrationTime > window.windowEnd) {
      return "late";
    }

    return "on-time";
  }

  static formatWindow(window) {
    return {
      medicationId: window.medicationId.toString(),
      scheduledDate: window.scheduledDate,
      scheduledDateTime: window.scheduledDateTime,
      scheduledTime: window.scheduledTime,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
    };
  }
}

module.exports = AdministrationWindowService;

