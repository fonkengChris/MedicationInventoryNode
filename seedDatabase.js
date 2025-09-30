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

// Seed active medications with service user ID mapping
const seedActiveMedicationsWithMapping = async (serviceUserIdMap) => {
  try {
    console.log('Seeding active medications with service user mapping...');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'backup_db', 'medication-inventory.activemedications.json'), 'utf8'));
    
    // Clear existing active medications
    await ActiveMedication.deleteMany({});
    
    // Clean and map service user IDs
    const cleanedData = data.map((med) => {
      const cleaned = { ...med };
      delete cleaned._id;
      delete cleaned.__v;
      
      // Convert dates
      if (cleaned.createdAt && cleaned.createdAt.$date) {
        cleaned.createdAt = new Date(cleaned.createdAt.$date);
      }
      if (cleaned.updatedAt && cleaned.updatedAt.$date) {
        cleaned.updatedAt = new Date(cleaned.updatedAt.$date);
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
      
      // Convert updatedBy ObjectId
      if (cleaned.updatedBy && cleaned.updatedBy.$oid) {
        cleaned.updatedBy = cleaned.updatedBy.$oid;
      }
      
      // Map old service user ID to new service user ID
      if (cleaned.serviceUser && cleaned.serviceUser.$oid) {
        const oldServiceUserId = cleaned.serviceUser.$oid;
        const newServiceUserId = serviceUserIdMap[oldServiceUserId];
        if (newServiceUserId) {
          cleaned.serviceUser = newServiceUserId;
          console.log(`Mapped service user ${oldServiceUserId} -> ${newServiceUserId} for medication ${cleaned.medicationName}`);
        } else {
          console.warn(`No mapping found for service user ${oldServiceUserId}, removing medication`);
          return null;
        }
      }
      
      return cleaned;
    }).filter(med => med !== null); // Only include medications with valid mapped service users
    
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
    const groups = await seedGroups();
    
    // Create a mapping of old group IDs to new group IDs
    const groupIdMap = {};
    const groupData = JSON.parse(fs.readFileSync(path.join(__dirname, 'backup_db', 'medication-inventory.groups.json'), 'utf8'));
    groupData.forEach((oldGroup, index) => {
      if (oldGroup._id && oldGroup._id.$oid && groups[index]) {
        groupIdMap[oldGroup._id.$oid] = groups[index]._id.toString();
      }
    });
    
    console.log('Group ID mapping:', groupIdMap);
    
    // Update service users seed to use the new group IDs
    const serviceUsers = await seedServiceUsersWithMapping(groupIdMap);
    
    // Create a mapping of old service user IDs to new service user IDs
    const serviceUserIdMap = {};
    const serviceUserData = JSON.parse(fs.readFileSync(path.join(__dirname, 'backup_db', 'medication-inventory.serviceusers.json'), 'utf8'));
    serviceUserData.forEach((oldUser, index) => {
      if (oldUser._id && oldUser._id.$oid && serviceUsers[index]) {
        serviceUserIdMap[oldUser._id.$oid] = serviceUsers[index]._id.toString();
      }
    });
    
    console.log('Service User ID mapping:', serviceUserIdMap);
    
    await seedActiveMedicationsWithMapping(serviceUserIdMap);
    
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

// Seed service users with group ID mapping
const seedServiceUsersWithMapping = async (groupIdMap) => {
  try {
    console.log('Seeding service users with group mapping...');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'backup_db', 'medication-inventory.serviceusers.json'), 'utf8'));
    
    // Clear existing service users
    await ServiceUser.deleteMany({});
    
    // Clean and map group IDs
    const cleanedData = data.map((user) => {
      const cleaned = { ...user };
      delete cleaned._id;
      delete cleaned.__v;
      
      // Convert dates
      if (cleaned.createdAt && cleaned.createdAt.$date) {
        cleaned.createdAt = new Date(cleaned.createdAt.$date);
      }
      if (cleaned.dateOfBirth && cleaned.dateOfBirth.$date) {
        cleaned.dateOfBirth = new Date(cleaned.dateOfBirth.$date);
      }
      
      // Map old group ID to new group ID
      if (cleaned.group && cleaned.group.$oid) {
        const oldGroupId = cleaned.group.$oid;
        const newGroupId = groupIdMap[oldGroupId];
        if (newGroupId) {
          cleaned.group = newGroupId;
          console.log(`Mapped group ${oldGroupId} -> ${newGroupId} for user ${cleaned.name}`);
        } else {
          console.warn(`No mapping found for group ${oldGroupId}, removing group reference`);
          delete cleaned.group;
        }
      }
      
      return cleaned;
    }).filter(user => user.group); // Only include users with valid mapped groups
    
    // Insert new service users
    const serviceUsers = await ServiceUser.insertMany(cleanedData);
    console.log(`✅ Seeded ${serviceUsers.length} service users`);
    
    return serviceUsers;
  } catch (error) {
    console.error('Error seeding service users:', error);
    throw error;
  }
};

// Run the seeding script
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
