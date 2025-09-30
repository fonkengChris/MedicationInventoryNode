const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import User model
const User = require('./models/User');

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

// Hash password function
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// Seed users
const seedUsers = async () => {
  try {
    console.log('Seeding users...');
    
    // Clear existing users
    await User.deleteMany({});
    console.log('Cleared existing users');
    
    // Define users to create
    const usersToCreate = [
      {
        username: 'superadmin',
        email: 'superadmin@med-tracker-pro.com',
        password: 'passWord123',
        role: 'superAdmin',
        phoneNumber: '+447123456789'
      },
      {
        username: 'admin',
        email: 'admin@med-tracker-pro.com',
        password: 'passWord123',
        role: 'admin',
        phoneNumber: '+447123456790'
      },
      {
        username: 'user1',
        email: 'user1@med-tracker-pro.com',
        password: 'passWord123',
        role: 'user',
        phoneNumber: '+447123456791'
      },
      {
        username: 'user2',
        email: 'user2@med-tracker-pro.com',
        password: 'passWord123',
        role: 'user',
        phoneNumber: '+447123456792'
      },
      {
        username: 'user3',
        email: 'user3@med-tracker-pro.com',
        password: 'passWord123',
        role: 'user',
        phoneNumber: '+447123456793'
      }
    ];
    
    // Hash passwords and create users
    const users = [];
    for (const userData of usersToCreate) {
      const hashedPassword = await hashPassword(userData.password);
      const user = new User({
        ...userData,
        password: hashedPassword
      });
      users.push(user);
    }
    
    // Insert users
    const createdUsers = await User.insertMany(users);
    console.log(`✅ Seeded ${createdUsers.length} users:`);
    
    // Display created users
    createdUsers.forEach(user => {
      console.log(`  - ${user.username} (${user.email}) - Role: ${user.role}`);
    });
    
    return createdUsers;
  } catch (error) {
    console.error('Error seeding users:', error);
    throw error;
  }
};

// Main seeding function
const seedUsersDatabase = async () => {
  try {
    console.log('🌱 Starting user database seeding...');
    
    // Connect to database
    await connectDB();
    
    // Seed users
    await seedUsers();
    
    console.log('🎉 User database seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ User database seeding failed:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
};

// Run the seeding script
if (require.main === module) {
  seedUsersDatabase();
}

module.exports = { seedUsersDatabase };
