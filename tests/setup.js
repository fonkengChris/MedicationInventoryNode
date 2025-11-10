const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

jest.mock("../jobs/scheduledTasks", () => ({
  initializeScheduledTasks: jest.fn(),
  checkMedicationStock: jest.fn(),
  checkUpcomingAppointments: jest.fn(),
}));

let mongoServer;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret";
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();

  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
  await mongoose.connection.close();
});

