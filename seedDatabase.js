const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
const Medication = require('./models/medication');
const Group = require('./models/group');
const ServiceUser = require('./models/service_user');
const ActiveMedication = require('./models/active_medication');

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

// Helper function to clean and transform data
const cleanData = (data) => {
  return data.map(item => {
    const cleaned = { ...item };
    
    // Remove MongoDB-specific fields that shouldn't be in the new database
    delete cleaned._id;
    delete cleaned.__v;
    
    // Convert ObjectId references to strings if they exist
    if (cleaned.createdBy && cleaned.createdBy.$oid) {
      cleaned.createdBy = cleaned.createdBy.$oid;
    }
    
    if (cleaned.serviceUser && cleaned.serviceUser.$oid) {
      cleaned.serviceUser = cleaned.serviceUser.$oid;
    }
    
    if (cleaned.group && cleaned.group.$oid) {
      cleaned.group = cleaned.group.$oid;
    }
    
    if (cleaned.updatedBy && cleaned.updatedBy.$oid) {
      cleaned.updatedBy = cleaned.updatedBy.$oid;
    }
    
    // Convert dates
    if (cleaned.createdAt && cleaned.createdAt.$date) {
      cleaned.createdAt = new Date(cleaned.createdAt.$date);
    }
    
    if (cleaned.updatedAt && cleaned.updatedAt.$date) {
      cleaned.updatedAt = new Date(cleaned.updatedAt.$date);
    }
    
    if (cleaned.dateOfBirth && cleaned.dateOfBirth.$date) {
      cleaned.dateOfBirth = new Date(cleaned.dateOfBirth.$date);
    }
    
    if (cleaned.startDate && cleaned.startDate.$date) {
      cleaned.startDate = new Date(cleaned.startDate.$date);
    }
    
    if (cleaned.endDate && cleaned.endDate.$date) {
      cleaned.endDate = new Date(cleaned.endDate.$date);
    }
    
    if (cleaned.lastUpdated && cleaned.lastUpdated.$date) {
      cleaned.lastUpdated = new Date(cleaned.lastUpdated.$date);
    }
    
    return cleaned;
  });
};

// Seed medications
const seedMedications = async () => {
  try {
    console.log('Seeding medications...');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'backup_db', 'medication-inventory.medications.json'), 'utf8'));
    const cleanedData = cleanData(data);
    
    // Clear existing medications
    await Medication.deleteMany({});
    
    // Insert new medications
    const medications = await Medication.insertMany(cleanedData);
    console.log(`✅ Seeded ${medications.length} medications`);
    
    return medications;
  } catch (error) {
    console.error('Error seeding medications:', error);
    throw error;
  }
};

// Seed groups
const seedGroups = async () => {
  try {
    console.log('Seeding groups...');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'backup_db', 'medication-inventory.groups.json'), 'utf8'));
    const cleanedData = cleanData(data);
    
    // Clear existing groups
    await Group.deleteMany({});
    
    // Insert new groups
    const groups = await Group.insertMany(cleanedData);
    console.log(`✅ Seeded ${groups.length} groups`);
    
    return groups;
  } catch (error) {
    console.error('Error seeding groups:', error);
    throw error;
  }
};

// Seed service users
const seedServiceUsers = async () => {
  try {
    console.log('Seeding service users...');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'backup_db', 'medication-inventory.serviceusers.json'), 'utf8'));
    const cleanedData = cleanData(data);
    
    // Clear existing service users
    await ServiceUser.deleteMany({});
    
    // Insert new service users
    const serviceUsers = await ServiceUser.insertMany(cleanedData);
    console.log(`✅ Seeded ${serviceUsers.length} service users`);
    
    return serviceUsers;
  } catch (error) {
    console.error('Error seeding service users:', error);
    throw error;
  }
};

// Seed active medications
const seedActiveMedications = async () => {
  try {
    console.log('Seeding active medications...');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'backup_db', 'medication-inventory.activemedications.json'), 'utf8'));
    const cleanedData = cleanData(data);
    
    // Clear existing active medications
    await ActiveMedication.deleteMany({});
    
    // Insert new active medications
    const activeMedications = await ActiveMedication.insertMany(cleanedData);
    console.log(`✅ Seeded ${activeMedications.length} active medications`);
    
    return activeMedications;
  } catch (error) {
    console.error('Error seeding active medications:', error);
    throw error;
  }
};

// Main seeding function
const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seeding...');
    
    // Connect to database
    await connectDB();
    
    // Seed collections in order (respecting dependencies)
    await seedMedications();
    await seedGroups();
    await seedServiceUsers();
    await seedActiveMedications();
    
    console.log('🎉 Database seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
};

// Run the seeding script
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
