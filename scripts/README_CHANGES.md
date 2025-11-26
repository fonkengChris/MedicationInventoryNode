# Generate Medication Changes Script

This script generates test medication stock changes (non-administrations) with appropriate MAR status codes. These changes represent inventory adjustments, patient movements, and other events that affect medication stock and appear in the MAR grid with status codes.

## Usage

### Basic Usage

Generate changes for the current month:

```bash
npm run generate-changes
```

Or directly:

```bash
node scripts/generateMedicationChanges.js
```

### Command Line Options

- `--month-offset=N` - Month offset from current month (default: 0)
  - `0` = current month
  - `-1` = last month
  - `1` = next month
  - Example: `--month-offset=-1` generates for last month

- `--changes-per-month=N` - Number of changes to generate per medication per month (default: 15)
  - Example: `--changes-per-month=20` generates 20 changes per medication

- `--service-user=ID` - Generate only for a specific service user
  - Example: `--service-user=507f1f77bcf86cd799439011`

- `--medication=ID` - Generate only for a specific medication
  - Example: `--medication=507f1f77bcf86cd799439012`

- `--clear` - Clear existing daily stock records for the month before generating new ones
  - Example: `--clear` removes all existing daily stock records in the date range

- `--no-mar-entries` - Don't create MAR PRN entries for status code changes
  - By default, the script creates PRN entries in the MAR grid for changes with status codes
  - Example: `--no-mar-entries` only creates stock changes without MAR entries

- `--dry-run` - Preview what would be generated without actually creating records
  - Example: `--dry-run` shows what would be created without saving to database

## Examples

### Generate for current month

```bash
npm run generate-changes
```

### Generate for last month with 20 changes per medication

```bash
npm run generate-changes -- --month-offset=-1 --changes-per-month=20
```

### Preview what would be generated (dry run)

```bash
npm run generate-changes -- --dry-run
```

### Generate for specific service user only

```bash
npm run generate-changes -- --service-user=507f1f77bcf86cd799439011
```

### Generate without MAR entries (stock changes only)

```bash
npm run generate-changes -- --no-mar-entries
```

## Change Types Generated

The script generates the following change types with MAR status code mapping:

### 1. From Pharmacy (25% weight)
- **Description**: Stock received from pharmacy
- **Stock Effect**: Increases stock (10-50 units)
- **MAR Code**: None (stock management only)
- **Notes**: "Received from pharmacy", "Stock replenished from pharmacy", etc.

### 2. Leaving Home (10% weight)
- **Description**: Patient leaving home with medication
- **Stock Effect**: Decreases stock (1-7 days supply)
- **MAR Code**: **L - On Leave**
- **Notes**: "Patient on Leave", "On Leave - Family visit", "On Leave - Hospital appointment", etc.

### 3. Returning Home (8% weight)
- **Description**: Patient returning home with medication
- **Stock Effect**: Increases stock (partial return, 0-5 days supply)
- **MAR Code**: None (stock management only)
- **Notes**: "Patient returned from Leave", "Returned from hospital", etc.

### 4. Returned to Pharmacy (5% weight)
- **Description**: Unused medication returned to pharmacy
- **Stock Effect**: Decreases stock (5-30 units)
- **MAR Code**: None (stock management only)
- **Notes**: "Returned to pharmacy - No longer needed", etc.

### 5. Lost (3% weight)
- **Description**: Medication lost
- **Stock Effect**: Decreases stock (1-10 units)
- **MAR Code**: **O - Other**
- **Notes**: "Lost medication", "Cannot locate medication", etc.

### 6. Damaged (4% weight)
- **Description**: Medication damaged or destroyed
- **Stock Effect**: Decreases stock (1-5 units)
- **MAR Code**: **D - Destroyed**
- **Notes**: "Destroyed - Expired", "Destroyed - Contaminated", "Destroyed - Damaged packaging", etc.

### 7. Other (5% weight)
- **Description**: Other changes with various status codes
- **Stock Effect**: Variable (small adjustments)
- **MAR Codes**: **R - Refused**, **N - Nausea/Vomiting**, **P - Pulse Abnormal**, **NR - Not Required**, **S - Sleeping**, **O - Other**
- **Notes**: Various notes that map to MAR status codes

## MAR Status Code Mapping

When `--no-mar-entries` is NOT used, the script creates PRN entries in the MAR grid for changes that have status codes:

| Change Type | MAR Code | Status Code Meaning |
|------------|----------|-------------------|
| Damaged | **D** | Destroyed |
| Leaving Home | **L** | On Leave |
| Other (with specific notes) | **R** | Refused |
| Other (with specific notes) | **N** | Nausea/Vomiting |
| Other (with specific notes) | **P** | Pulse Abnormal |
| Other (with specific notes) | **NR** | Not Required |
| Other (with specific notes) | **S** | Sleeping |
| Other (with specific notes) | **H** | Hospital |
| Other (with specific notes) | **O** | Other |

## What Gets Generated

1. **DailyStock Records**: Created for each date with changes
   - Tracks stock levels and changes
   - Records all change types
   - Updates stock totals

2. **MAR PRN Entries** (if enabled): Created for status code changes
   - Appears in MAR grid under "PRN / Other" time slot
   - Shows status codes (R, N, H, L, D, S, P, NR, O)
   - Includes notes with status code keywords

3. **Stock Updates**: Medication stock levels are updated
   - Stock increases for "From Pharmacy" and "Returning Home"
   - Stock decreases for "Leaving Home", "Returned to Pharmacy", "Lost", "Damaged"
   - Stock adjustments for "Other" changes

## Requirements

- MongoDB connection configured in `.env` file
- Active medications in the database
- Service users in the database
- Staff users (admin or user role) in the database

## Notes

- The script respects medication `startDate` and `endDate` (won't generate outside active period)
- Stock levels are tracked chronologically
- Changes are distributed throughout the month randomly
- MAR PRN entries are created for changes with status codes (by default)
- Stock cannot go negative (changes that would cause negative stock are skipped)
- The script updates medication `quantityInStock` to reflect changes

## Combining with Administration Script

You can run both scripts to generate a complete MAR chart:

```bash
# Generate administrations
npm run generate-administrations -- --month-offset=-1

# Generate stock changes with MAR entries
npm run generate-changes -- --month-offset=-1
```

This will create:
- Scheduled administrations with staff initials
- PRN entries with status codes
- Stock changes for inventory management
- Complete MAR grid with all codes and entries

