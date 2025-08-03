const PDFDocument = require("pdfkit");
const PDFTable = require("pdfkit-table");
const TrendAnalysisService = require("./trendAnalysisService");

class PDFService {
  /**
   * Generate PDF for a summary
   */
  static async generateSummaryPdf(summary) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: "A4",
          margin: 50,
        });

        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));

        // Add header
        doc
          .fontSize(24)
          .font("Helvetica-Bold")
          .text("Weekly Medication Summary", { align: "center" });

        doc.moveDown();

        // Add date range
        doc
          .fontSize(14)
          .font("Helvetica")
          .text(
            `Period: ${new Date(summary.startDate).toLocaleDateString()} - ${new Date(
              summary.endDate
            ).toLocaleDateString()}`,
            { align: "center" }
          );

        doc.moveDown(2);

        // Add summary statistics
        doc.fontSize(16).font("Helvetica-Bold").text("Summary Statistics");
        doc.moveDown();

        const totalMedications = summary.summaries.length;
        let totalStockChanges = 0;
        let totalAdministered = 0;

        summary.summaries.forEach((med) => {
          totalStockChanges +=
            med.cumulativeChanges.fromPharmacy +
            med.cumulativeChanges.returningHome -
            med.cumulativeChanges.quantityAdministered -
            med.cumulativeChanges.leavingHome;
          totalAdministered += med.cumulativeChanges.quantityAdministered;
        });

        doc
          .fontSize(12)
          .font("Helvetica")
          .text(`Total Medications: ${totalMedications}`)
          .text(`Total Stock Changes: ${totalStockChanges}`)
          .text(`Total Administered: ${totalAdministered}`);

        doc.moveDown(2);

        // Add detailed medication information
        doc.fontSize(16).font("Helvetica-Bold").text("Medication Details");
        doc.moveDown();

        summary.summaries.forEach((med, index) => {
          doc
            .fontSize(14)
            .font("Helvetica-Bold")
            .text(`${index + 1}. ${med.medication.medicationName}`);

          doc
            .fontSize(10)
            .font("Helvetica")
            .text(`Service User: ${med.serviceUser.name} (NHS: ${med.serviceUser.nhsNumber})`)
            .text(`Dosage: ${med.medication.quantityPerDose} per dose, ${med.medication.dosesPerDay} doses/day`)
            .text(`Stock Levels: Initial ${med.stockLevels.initial} → Final ${med.stockLevels.final}`)
            .text(`Days Remaining: ${med.stockLevels.daysRemaining}`);

          // Stock changes
          doc.text("Stock Changes:");
          doc
            .fontSize(9)
            .text(`  From Pharmacy: ${med.cumulativeChanges.fromPharmacy}`)
            .text(`  Administered: ${med.cumulativeChanges.quantityAdministered}`)
            .text(`  Leaving Home: ${med.cumulativeChanges.leavingHome}`)
            .text(`  Returning Home: ${med.cumulativeChanges.returningHome}`)
            .text(`  Returned to Pharmacy: ${med.cumulativeChanges.returnedToPharmacy}`)
            .text(`  Lost/Damaged: ${med.cumulativeChanges.lost + med.cumulativeChanges.damaged}`);

          doc.moveDown();
        });

        // Add footer
        doc
          .fontSize(10)
          .font("Helvetica")
          .text(
            `Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
            { align: "center" }
          );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = PDFService;
