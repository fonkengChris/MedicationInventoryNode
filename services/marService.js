const PDFDocument = require("pdfkit");
const ActiveMedication = require("../models/active_medication");
const DailyStock = require("../models/daily_stock");
const MedicationAdministration = require("../models/medication_administration");
const ServiceUser = require("../models/service_user");
const AdministrationWindowService = require("./administrationWindowService");
const AdministrationSettingsService = require("./administrationSettingsService");

function eachDay(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const last = new Date(endDate);
  last.setHours(0, 0, 0, 0);

  while (current <= last) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

const UNSCHEDULED_SLOT = "__UNSCHEDULED__";
const WEEKDAY_LABELS = ["M", "T", "W", "Th", "F", "Sa", "Su"];

function chunkDates(dates, size = 28) {
  if (!Array.isArray(dates) || !dates.length) {
    return [];
  }
  const chunks = [];
  for (let i = 0; i < dates.length; i += size) {
    const slice = dates.slice(i, i + size).map((d) => new Date(d));
    chunks.push(slice);
  }
  return chunks;
}

function startOfWeekMonday(date) {
  const result = new Date(date);
  const currentDay = result.getDay();
  const diff = (currentDay + 6) % 7;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function groupDatesIntoWeeks(dates) {
  if (!Array.isArray(dates) || !dates.length) {
    return [];
  }

  const weeksMap = new Map();

  dates.forEach((date) => {
    const monday = startOfWeekMonday(date);
    const key = monday.toISOString();
    if (!weeksMap.has(key)) {
      weeksMap.set(
        key,
        Array.from({ length: 7 }, () => null)
      );
    }
    const week = weeksMap.get(key);
    const dayIndex = (date.getDay() + 6) % 7;
    week[dayIndex] = date;
  });

  return Array.from(weeksMap.keys())
    .sort()
    .map((key) => weeksMap.get(key));
}

function formatDisplayDate(date, dayIndex) {
  return WEEKDAY_LABELS[dayIndex] || "";
}

function formatWeekRangeLabel(week, index) {
  const validDates = week.filter(Boolean);
  if (!validDates.length) {
    return `Week ${index + 1}`;
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
  });

  const start = formatter.format(validDates[0]);
  const end = formatter.format(validDates[validDates.length - 1]);
  return `Week ${index + 1} (${start} - ${end})`;
}

function formatDateLong(date) {
  return new Date(date).toLocaleDateString("en-GB");
}

function isSameDay(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function formatTimeLabel(timeString) {
  if (!timeString) {
    return "";
  }
  const [hours, minutes] = timeString.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function formatTimeFromDate(source) {
  if (!source) {
    return "";
  }
  return new Date(source).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(status) {
  if (!status) {
    return "";
  }

  const normalized = status.toLowerCase().replace(/[\s-]+/g, "_");

  const mapping = {
    on_time: "On time",
    early: "Early",
    late: "Late",
    recorded: "Recorded",
    missed: "Missed",
    cancelled: "Cancelled",
    refused: "R - Refused",
    nausea: "N - Nausea/Vomiting",
    nausea_vomiting: "N - Nausea/Vomiting",
    hospital: "H - Hospital",
    on_leave: "L - On Leave",
    destroyed: "D - Destroyed",
    sleeping: "S - Sleeping",
    pulse_abnormal: "P - Pulse Abnormal",
    not_required: "NR - Not Required",
    other: "O - Other",
  };

  return mapping[normalized] || status;
}

function getTimeSlotsForMedication(medicationId, dates, windows, administrations) {
  const slots = new Set();
  if (!medicationId || !Array.isArray(dates)) {
    return [UNSCHEDULED_SLOT];
  }

  for (const date of dates) {
    const formattedDate = formatDate(date);
    const dailyWindows =
      windows?.[medicationId]?.[formattedDate] && Array.isArray(windows[medicationId][formattedDate])
        ? windows[medicationId][formattedDate]
        : [];
    const dailyAdministrations =
      administrations?.[medicationId]?.[formattedDate] &&
      Array.isArray(administrations[medicationId][formattedDate])
        ? administrations[medicationId][formattedDate]
        : [];

    dailyWindows.forEach((window) => {
      if (window?.scheduledTime) {
        slots.add(window.scheduledTime);
      }
    });

    dailyAdministrations.forEach((administration) => {
      if (administration?.scheduledTime) {
        slots.add(administration.scheduledTime);
      } else if (administration?.administeredAt) {
        slots.add(UNSCHEDULED_SLOT);
      }
    });
  }

  const ordered = Array.from(slots);
  ordered.sort((a, b) => {
    if (a === b) return 0;
    if (a === UNSCHEDULED_SLOT) return 1;
    if (b === UNSCHEDULED_SLOT) return -1;
    return a.localeCompare(b);
  });

  if (!ordered.length) {
    ordered.push(UNSCHEDULED_SLOT);
  }

  return ordered;
}

function buildMedicationDetailsText(medication) {
  if (!medication) {
    return "Medication details unavailable";
  }

  const lines = [];

  lines.push(medication.medicationName || "Medication");

  if (
    medication.dosage &&
    medication.dosage.amount !== undefined &&
    medication.dosage.unit
  ) {
    lines.push(`Dosage: ${medication.dosage.amount} ${medication.dosage.unit}`);
  }

  if (medication.quantityPerDose !== undefined && medication.quantityPerDose !== null) {
    lines.push(`Quantity per dose: ${medication.quantityPerDose}`);
  }

  return lines.join("\n");
}

function getWindowForSlot(dailyWindows = [], slot) {
  if (!Array.isArray(dailyWindows) || !slot || slot === UNSCHEDULED_SLOT) {
    return null;
  }
  return dailyWindows.find((window) => window?.scheduledTime === slot) || null;
}

function getAdministrationForSlot(dailyAdministrations = [], slot) {
  if (!Array.isArray(dailyAdministrations) || !dailyAdministrations.length) {
    return null;
  }

  if (slot === UNSCHEDULED_SLOT) {
    return dailyAdministrations.find((administration) => !administration.scheduledTime) || null;
  }

  return (
    dailyAdministrations.find((administration) => administration?.scheduledTime === slot) || null
  );
}

function getStaffAbbreviation(administeredBy) {
  if (!administeredBy) {
    return "";
  }

  if (Array.isArray(administeredBy)) {
    return getStaffAbbreviation(administeredBy[0]);
  }

  let source = "";

  if (typeof administeredBy === "string") {
    source = administeredBy;
  } else if (typeof administeredBy === "object") {
    if (administeredBy.username) {
      source = administeredBy.username;
    } else if (administeredBy.name) {
      source = administeredBy.name;
    } else if (administeredBy.email) {
      source = administeredBy.email.split("@")[0];
    } else if (administeredBy._id) {
      source = administeredBy._id.toString();
    }
  }

  const trimmed = (source || "").trim();
  if (!trimmed) {
    return "";
  }

  const parts = trimmed.split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) {
    return trimmed.slice(0, 2).toUpperCase();
  }

  return parts
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
}

function buildCellContent({
  slot,
  date,
  medicationId,
  windows,
  administrations,
}) {
  if (!date) {
    return "";
  }

  const formattedDate = formatDate(date);

  if (isSameDay(date, new Date())) {
    return "";
  }

  const dailyWindows =
    windows?.[medicationId]?.[formattedDate] && Array.isArray(windows[medicationId][formattedDate])
      ? windows[medicationId][formattedDate]
      : [];
  const dailyAdministrations =
    administrations?.[medicationId]?.[formattedDate] &&
    Array.isArray(administrations[medicationId][formattedDate])
      ? administrations[medicationId][formattedDate]
      : [];

  const window = getWindowForSlot(dailyWindows, slot);
  const administration = getAdministrationForSlot(dailyAdministrations, slot);

  if (!administration) {
    return "";
  }

  const lines = [];

  if (slot === UNSCHEDULED_SLOT && !administration.scheduledTime) {
    lines.push("PRN entry");
  } else if (slot && slot !== UNSCHEDULED_SLOT) {
    lines.push(formatTimeLabel(slot));
  }

  if (window && slot !== UNSCHEDULED_SLOT && administration.scheduledTime) {
    lines.push(
      `Window ${formatTimeFromDate(window.windowStart)} - ${formatTimeFromDate(
        window.windowEnd
      )}`
    );
  }

  if (administration.administeredAt) {
    lines.push(`Given ${formatTimeFromDate(administration.administeredAt)}`);
  }
  if (administration.quantity !== undefined && administration.quantity !== null) {
    lines.push(`Qty ${administration.quantity}`);
  }
  if (administration.status) {
    lines.push(formatStatus(administration.status));
  }
  if (administration.notes) {
    lines.push(`Notes: ${administration.notes}`);
  }

  const staffAbbreviation = getStaffAbbreviation(administration.administeredBy);
  if (staffAbbreviation) {
    lines.push(`Staff: ${staffAbbreviation}`);
  }

  return lines.join("\n");
}

function drawAuditSection(doc, { x, y, width }) {
  const sections = [
    { label: "Prep'd by", fields: ["Date", "Sig"], flex: 1.1 },
    { label: "Checked by", fields: ["Date", "Sig"], flex: 1.1 },
    { label: "Carried forward", fields: ["Balance"], flex: 0.9 },
    { label: "Qty received", fields: ["Quantity", "Date", "Sig"], flex: 1.2 },
    { label: "Qty returned", fields: ["Quantity", "Date", "Sig"], flex: 1.2 },
    { label: "Reordered", fields: ["Date", "Sig"], flex: 1 },
  ];

  const totalFlex = sections.reduce((sum, section) => sum + section.flex, 0);
  const height = 40;
  let currentX = x;

  sections.forEach((section) => {
    const sectionWidth = (section.flex / totalFlex) * width;
    doc.rect(currentX, y, sectionWidth, height).stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(section.label, currentX + 4, y + 4, { width: sectionWidth - 8 });

    doc.font("Helvetica").fontSize(7);
    section.fields.forEach((field, index) => {
      doc.text(`${field}:`, currentX + 4, y + 16 + index * 10, {
        width: sectionWidth - 8,
      });
    });

    currentX += sectionWidth;
  });

  return y + height;
}

function drawFooter(doc) {
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const footerY = doc.page.height - doc.page.margins.bottom - 40;

  doc
    .font("Helvetica")
    .fontSize(7)
    .text(
      "Document uncontrolled when printed or downloaded. Any changes to the document are the responsibility of the person making them.",
      doc.page.margins.left,
      footerY,
      {
        width: usableWidth,
        align: "center",
      }
    );
  doc
    .font("Helvetica")
    .fontSize(7)
    .text(
      "Current version available on the Harrogate and Rural District CCG safe handling of medicines in social care website.",
      doc.page.margins.left,
      footerY + 10,
      {
        width: usableWidth,
        align: "center",
      }
    );
}

function drawKey(doc, y) {
  const legendLines = [
    "Codes:",
    "R - Refused    N - Nausea/Vomiting    H - Hospital    L - On Leave",
    "D - Destroyed    S - Sleeping    P - Pulse Abnormal    NR - Not Required    O - Other",
  ];

  doc
    .font("Helvetica")
    .fontSize(8)
    .text(legendLines.join("\n"), doc.page.margins.left, y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
}

function drawMarHeader(
  doc,
  {
    serviceUser,
    chunkStart,
    chunkEnd,
    chartIndex,
    chartCount,
    medicationIndex,
    medicationCount,
    settings,
    isNotesPage,
  }
) {
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  const headerYStart = doc.y;

  doc
    .font("Helvetica")
    .fontSize(8)
    .text(
      "North Yorkshire and AWC Medicines Management Team (Social Care) Hosted by",
      left,
      headerYStart,
      { width: usableWidth, align: "center" }
    );

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("Medication Administration Record (MAR)", left, doc.y + 6, {
      width: usableWidth,
      align: "center",
    });

  doc.moveDown(0.8);

  const columnGap = 30;
  const columnWidth = (usableWidth - columnGap) / 2;
  const rightX = left + columnWidth + columnGap;
  let currentY = doc.y;
  const lineHeight = 14;

  const dob = serviceUser?.dateOfBirth ? formatDateLong(serviceUser.dateOfBirth) : "__________________";
  const groupName =
    serviceUser?.group && typeof serviceUser.group === "object"
      ? serviceUser.group.name
      : serviceUser?.group || "__________________";
  const nhsNumber = serviceUser?.nhsNumber || "__________________";
  const start = chunkStart ? formatDateLong(chunkStart) : "__________________";
  const end = chunkEnd ? formatDateLong(chunkEnd) : "__________________";

  doc.font("Helvetica-Bold").fontSize(10).text("Name:", left, currentY);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(serviceUser?.name || "__________________", left + 55, currentY, {
      width: columnWidth - 55,
    });
  doc.font("Helvetica-Bold").fontSize(10).text("DOB:", rightX, currentY);
  doc.font("Helvetica").fontSize(10).text(dob, rightX + 40, currentY, {
    width: columnWidth - 40,
  });
  currentY += lineHeight;

  doc.font("Helvetica-Bold").fontSize(10).text("GP:", left, currentY);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text("__________________", left + 55, currentY, {
      width: columnWidth - 55,
    });
  doc.font("Helvetica-Bold").fontSize(10).text("Allergies:", rightX, currentY);
  doc.font("Helvetica").fontSize(10).text("__________________", rightX + 60, currentY, {
    width: columnWidth - 60,
  });
  currentY += lineHeight;

  doc.font("Helvetica-Bold").fontSize(10).text("Care home:", left, currentY);
  doc.font("Helvetica").fontSize(10).text(groupName, left + 70, currentY, {
    width: columnWidth - 70,
  });
  doc.font("Helvetica-Bold").fontSize(10).text("NHS number:", rightX, currentY);
  doc.font("Helvetica").fontSize(10).text(nhsNumber, rightX + 80, currentY, {
    width: columnWidth - 80,
  });
  currentY += lineHeight;

  doc.font("Helvetica-Bold").fontSize(10).text("Start date:", left, currentY);
  doc.font("Helvetica").fontSize(10).text(start, left + 70, currentY, {
    width: columnWidth - 70,
  });
  doc.font("Helvetica-Bold").fontSize(10).text("Chart:", rightX, currentY);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`${chartIndex} of ${chartCount}`, rightX + 45, currentY, {
      width: columnWidth - 45,
    });
  currentY += lineHeight;

  doc.font("Helvetica-Bold").fontSize(10).text("Period:", left, currentY);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`${start} - ${end}`, left + 55, currentY, {
      width: columnWidth - 55,
    });

  if (!isNotesPage && medicationCount && medicationCount > 1) {
    doc.font("Helvetica-Bold").fontSize(10).text("Medication sheet:", rightX, currentY);
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`${medicationIndex} of ${medicationCount}`, rightX + 110, currentY, {
        width: columnWidth - 110,
      });
  }

  doc
    .moveTo(left, currentY + lineHeight - 4)
    .lineTo(left + usableWidth, currentY + lineHeight - 4)
    .stroke();
  doc.moveDown(0.8);
}

function drawMedicationGrid(doc, { medication, dates, administrations, windows }) {
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const leftColumnWidth = Math.min(120, Math.max(100, usableWidth * 0.16));
  const timeColumnWidth = 35;
  const weeks = groupDatesIntoWeeks(dates);
  const totalDayColumns = Math.max(1, weeks.length * 7);
  const remainingWidth = usableWidth - leftColumnWidth - timeColumnWidth;
  const dayColumnWidth = remainingWidth / totalDayColumns;
  const tableTop = doc.y;
  const weekHeaderHeight = 24;
  const dateHeaderHeight = 20;
  const medId = medication._id.toString();

  doc.lineWidth(0.5);

  // Header cells
  doc.rect(doc.page.margins.left, tableTop, leftColumnWidth, weekHeaderHeight + dateHeaderHeight).stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Medication Details", doc.page.margins.left + 4, tableTop + 6, {
      width: leftColumnWidth - 8,
    });

  doc
    .rect(doc.page.margins.left + leftColumnWidth, tableTop, timeColumnWidth, weekHeaderHeight + dateHeaderHeight)
    .stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Time", doc.page.margins.left + leftColumnWidth, tableTop + 6, {
      width: timeColumnWidth,
      align: "center",
    });

  let currentX = doc.page.margins.left + leftColumnWidth + timeColumnWidth;
  weeks.forEach((week, index) => {
    const width = week.length * dayColumnWidth;
    doc.rect(currentX, tableTop, width, weekHeaderHeight).stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(formatWeekRangeLabel(week, index), currentX + 2, tableTop + 4, {
        width,
        align: "center",
      });
    currentX += width;
  });

  currentX = doc.page.margins.left + leftColumnWidth + timeColumnWidth;
  weeks.forEach((week) => {
    week.forEach((date, dayIndex) => {
      doc
        .rect(currentX, tableTop + weekHeaderHeight, dayColumnWidth, dateHeaderHeight)
        .stroke();
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .text(formatDisplayDate(date, dayIndex), currentX, tableTop + weekHeaderHeight + 4, {
          width: dayColumnWidth,
          align: "center",
          lineBreak: false,
        });
      currentX += dayColumnWidth;
    });
  });

  const timeSlots = getTimeSlotsForMedication(medId, dates, windows, administrations);
  const rowHeight = 42;
  const tableBodyTop = tableTop + weekHeaderHeight + dateHeaderHeight;
  const bodyHeight = timeSlots.length * rowHeight;

  doc.rect(doc.page.margins.left, tableBodyTop, leftColumnWidth, bodyHeight).stroke();
  doc
    .font("Helvetica")
    .fontSize(8)
    .text(buildMedicationDetailsText(medication), doc.page.margins.left + 4, tableBodyTop + 4, {
      width: leftColumnWidth - 8,
      height: bodyHeight - 8,
    });

  timeSlots.forEach((slot, index) => {
    const rowTop = tableBodyTop + index * rowHeight;
    doc
      .rect(doc.page.margins.left + leftColumnWidth, rowTop, timeColumnWidth, rowHeight)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(
        slot === UNSCHEDULED_SLOT ? "PRN / Other" : formatTimeLabel(slot),
        doc.page.margins.left + leftColumnWidth,
        rowTop + 10,
        {
          width: timeColumnWidth,
          align: "center",
        }
      );

    let cellX = doc.page.margins.left + leftColumnWidth + timeColumnWidth;
    weeks.forEach((week) => {
      week.forEach((date) => {
        doc.rect(cellX, rowTop, dayColumnWidth, rowHeight).stroke();
          const cellContent = buildCellContent({
            slot,
            date,
            medicationId: medId,
            windows,
            administrations,
          });

          if (cellContent) {
            doc
              .font("Helvetica")
              .fontSize(7.5)
              .text(cellContent, cellX + 2, rowTop + 6, {
                width: dayColumnWidth - 4,
                height: rowHeight - 12,
              });
          }
        cellX += dayColumnWidth;
      });
    });
  });

  const afterTableY = tableBodyTop + bodyHeight;
  const auditBottom = drawAuditSection(doc, {
    x: doc.page.margins.left,
    y: afterTableY,
    width: usableWidth,
  });

  const keyY = auditBottom + 6;
  drawKey(doc, keyY);
  drawFooter(doc);
  doc.y = keyY + 24;
}

function drawNotesPage(doc, { serviceUser, chunkStart, chunkEnd, chartIndex, chartCount, settings }) {
  drawMarHeader(doc, {
    serviceUser,
    chunkStart,
    chunkEnd,
    chartIndex,
    chartCount,
    settings,
    isNotesPage: true,
  });

  doc.font("Helvetica-Bold").fontSize(12).text("Notes", doc.page.margins.left, doc.y);
  doc.moveDown(0.4);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`Person's Name: ${serviceUser?.name || "__________________"}`, doc.page.margins.left, doc.y);
  doc.moveDown(0.4);

  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const columns = [
    { label: "Date", flex: 0.14 },
    { label: "Time", flex: 0.12 },
    { label: "Details", flex: 0.34 },
    { label: "Actions taken", flex: 0.25 },
    { label: "Signature", flex: 0.15 },
  ];
  const headerHeight = 20;
  const rowHeight = 24;
  const rows = 12;
  let currentX = doc.page.margins.left;
  const tableTop = doc.y + 6;

  columns.forEach((column) => {
    const width = column.flex * usableWidth;
    doc.rect(currentX, tableTop, width, headerHeight).stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(column.label, currentX, tableTop + 5, {
        width,
        align: "center",
      });
    currentX += width;
  });

  for (let row = 0; row < rows; row += 1) {
    let cellX = doc.page.margins.left;
    const rowTop = tableTop + headerHeight + row * rowHeight;
    columns.forEach((column) => {
      const width = column.flex * usableWidth;
      doc.rect(cellX, rowTop, width, rowHeight).stroke();
      cellX += width;
    });
  }

  drawFooter(doc);
}

class MarService {
  static async fetchMarData({ serviceUserId, startDate, endDate, groupId, userId }) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Invalid date range provided");
    }

    if (start > end) {
      throw new Error("Start date must be before end date");
    }

    const serviceUser = await ServiceUser.findById(serviceUserId)
      .populate("group", "name")
      .lean();

    if (!serviceUser) {
      throw new Error("Service user not found");
    }

    const settings = await AdministrationSettingsService.getSettings({
      groupId,
      userId,
    });

    const dateRange = eachDay(start, end);

    const medications = await ActiveMedication.find({
      serviceUser: serviceUserId,
      isActive: true,
      startDate: { $lte: end },
      $or: [{ endDate: null }, { endDate: { $gte: start } }],
    }).lean();

    if (!medications.length) {
      return {
        serviceUser,
        medications: [],
        administrations: {},
        windows: {},
        settings,
        dateRange,
      };
    }

    const administrations = {};
    const windows = {};

    medications.forEach((medication) => {
      medication.serviceUser = serviceUser;
      const medId = medication._id.toString();
      administrations[medId] = {};
      windows[medId] = {};
    });

    for (const medication of medications) {
      const medId = medication._id.toString();

      for (const date of dateRange) {
        const formattedDate = formatDate(date);

        const medicationWindows =
          AdministrationWindowService.buildWindowsForMedication(
            medication,
            date,
            settings
          ) || [];

        windows[medId][formattedDate] = medicationWindows.map((window) =>
          AdministrationWindowService.formatWindow(window)
        );

        const recordedAdministrations = await MedicationAdministration.find({
          medication: medication._id,
          serviceUser: serviceUserId,
          scheduledDate: date,
        })
          .sort({ scheduledTime: 1 })
          .populate("administeredBy", "username email")
          .lean();

        if (recordedAdministrations.length) {
          administrations[medId][formattedDate] = recordedAdministrations;
          continue;
        }

        const dailyStock = await DailyStock.findOne({
          medication: medication._id,
          serviceUser: serviceUserId,
          date,
        })
          .select("changes")
          .populate("changes.updatedBy", "username email")
          .lean();

        if (dailyStock?.changes?.length) {
          administrations[medId][formattedDate] = dailyStock.changes
            .filter(
              (change) =>
                change.type === "Quantity Administered" && change.timestamp
            )
            .map((change) => ({
              medication: medication._id,
              serviceUser: serviceUserId,
              scheduledDate: date,
              scheduledTime: null,
              administeredAt: change.timestamp,
              administeredBy: change.updatedBy,
              quantity: change.quantity,
              status: "recorded",
              notes: change.note,
            }));
        } else {
          administrations[medId][formattedDate] = [];
        }
      }
    }

    return {
      serviceUser,
      medications,
      administrations,
      windows,
      settings,
      dateRange,
    };
  }

  static async generateMarPdf({ serviceUserId, startDate, endDate, groupId, userId }) {
    const {
      serviceUser,
      medications,
      administrations,
      windows,
      settings,
      dateRange,
    } = await MarService.fetchMarData({
      serviceUserId,
      startDate,
      endDate,
      groupId,
      userId,
    });

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: "A4", margin: 36 });
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));

        const normalizedDates =
          Array.isArray(dateRange) && dateRange.length
            ? dateRange.map((date) => new Date(date))
            : [];

        if (!normalizedDates.length) {
          const fallbackStart = new Date(startDate);
          fallbackStart.setHours(0, 0, 0, 0);
          normalizedDates.push(fallbackStart);
        }

        const charts = chunkDates(normalizedDates, 28);
        const chartCount = charts.length || 1;
        const hasMedications = medications.length > 0;
        const effectiveCharts = charts.length ? charts : [normalizedDates];

        if (!hasMedications) {
          const [firstChunk] = effectiveCharts;
          const chunkStart = firstChunk[0] || new Date(startDate);
          const chunkEnd =
            firstChunk[firstChunk.length - 1] || new Date(endDate);

          drawMarHeader(doc, {
            serviceUser,
            chunkStart,
            chunkEnd,
            chartIndex: 1,
            chartCount,
            medicationIndex: 1,
            medicationCount: 1,
            settings,
            isNotesPage: false,
          });

          doc
            .font("Helvetica")
            .fontSize(12)
            .text(
              "No active medications for the selected period.",
              doc.page.margins.left,
              doc.y + 30,
              {
                width:
                  doc.page.width - doc.page.margins.left - doc.page.margins.right,
                align: "center",
              }
            );

          drawFooter(doc);

          doc.addPage();
          drawNotesPage(doc, {
            serviceUser,
            chunkStart,
            chunkEnd,
            chartIndex: 1,
            chartCount,
            settings,
          });

          doc.end();
          return;
        }

        effectiveCharts.forEach((chunkDates, chunkIndex) => {
          const chunkStart = chunkDates[0] || new Date(startDate);
          const chunkEnd =
            chunkDates[chunkDates.length - 1] || new Date(endDate);

          medications.forEach((medication, medicationIndex) => {
            if (chunkIndex !== 0 || medicationIndex !== 0) {
              doc.addPage();
            }

            drawMarHeader(doc, {
              serviceUser,
              chunkStart,
              chunkEnd,
              chartIndex: chunkIndex + 1,
              chartCount,
              medicationIndex: medicationIndex + 1,
              medicationCount: medications.length,
              settings,
              isNotesPage: false,
            });

            drawMedicationGrid(doc, {
              medication,
              dates: chunkDates,
              administrations,
              windows,
            });
          });

          doc.addPage();
          drawNotesPage(doc, {
            serviceUser,
            chunkStart,
            chunkEnd,
            chartIndex: chunkIndex + 1,
            chartCount,
            settings,
          });
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = MarService;

