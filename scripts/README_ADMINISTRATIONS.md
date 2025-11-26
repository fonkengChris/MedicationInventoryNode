# Generate Medication Administrations Script

This script generates test medication administration records over a specified month to populate the MAR (Medication Administration Record) grid and PDF.

## Usage

### Basic Usage

Generate administrations for the current month:

```bash
npm run generate-administrations
```

Or directly:

```bash
node scripts/generateMedicationAdministrations.js
```

### Command Line Options

- `--month-offset=N` - Month offset from current month (default: 0)
  - `0` = current month
  - `-1` = last month
  - `1` = next month
  - Example: `--month-offset=-1` generates for last month

- `--coverage=N` - Percentage of scheduled doses to actually administer (default: 85)
  - Range: 1-100
  - Example: `--coverage=90` means 90% of scheduled doses will have administrations

- `--service-user=ID` - Generate only for a specific service user
  - Example: `--service-user=507f1f77bcf86cd799439011`

- `--medication=ID` - Generate only for a specific medication
  - Example: `--medication=507f1f77bcf86cd799439012`

- `--clear` - Clear existing administrations for the month before generating new ones
  - Example: `--clear` removes all existing administrations in the date range

- `--dry-run` - Preview what would be generated without actually creating records
  - Example: `--dry-run` shows what would be created without saving to database

## Examples

### Generate for current month with 90% coverage

```bash
npm run generate-administrations -- --coverage=90
```

### Generate for last month and clear existing

```bash
npm run generate-administrations -- --month-offset=-1 --clear
```

### Preview what would be generated (dry run)

```bash
npm run generate-administrations -- --dry-run
```

### Generate for specific service user only

```bash
npm run generate-administrations -- --service-user=507f1f77bcf86cd799439011
```

### Generate for last month with 100% coverage

```bash
npm run generate-administrations -- --month-offset=-1 --coverage=100
```

## What Gets Generated

The script generates realistic medication administration records with:

- **Status Distribution:**
  - 70% on-time
  - 15% late
  - 10% early
  - 3% missed
  - 2% cancelled

- **Administration Times:**
  - On-time: ±5 minutes from scheduled time
  - Early: 10-30 minutes before scheduled time
  - Late: 10-45 minutes after scheduled time

- **Special Notes (15% chance):**
  - Refused by patient
  - Nausea/Vomiting
  - Patient on Leave
  - Sleeping
  - Pulse Abnormal
  - Not Required
  - Other reason

- **Staff Assignment:**
  - Randomly assigns from available staff users

- **Quantity:**
  - Uses the medication's `quantityPerDose` value

## Requirements

- MongoDB connection configured in `.env` file
- Active medications with `administrationTimes` configured
- Service users in the database
- Staff users (admin or user role) in the database

## Notes

- The script only generates administrations for medications that have `administrationTimes` configured
- It respects medication `startDate` and `endDate` (won't generate outside active period)
- Duplicate administrations (same medication, date, and time) are skipped
- The script automatically handles date ranges and skips weekends/holidays based on medication schedule

