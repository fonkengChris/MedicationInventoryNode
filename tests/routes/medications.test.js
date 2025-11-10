const request = require("supertest");
const createTestApp = require("../../startup/createTestApp");
const Medication = require("../../models/medication");
const {
  createUserFixture,
  createMedicationFixture,
} = require("../fixtures/factories");
const { signToken } = require("../utils/token");

const app = createTestApp();

describe("GET /api/medications", () => {
  it("returns an empty list when no medications exist", async () => {
    const response = await request(app).get("/api/medications");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("returns medications stored in the database", async () => {
    const medication = await createMedicationFixture({
      name: "Aspirin",
    });

    const response = await request(app).get("/api/medications");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      name: "Aspirin",
      dosage: medication.dosage,
      form: medication.form,
      route: medication.route,
    });
  });
});

describe("POST /api/medications", () => {
  let token;

  beforeEach(async () => {
    const { user } = await createUserFixture({ role: "admin" });
    token = signToken(user);
  });

  it("requires authentication", async () => {
    const response = await request(app).post("/api/medications").send({
      name: "Ibuprofen",
      dosage: "200mg",
      form: "tablet",
      route: "oral",
    });

    expect(response.status).toBe(401);
  });

  it("creates a medication when the user is an admin", async () => {
    const payload = {
      name: "Ibuprofen",
      dosage: "200mg",
      form: "tablet",
      route: "oral",
      manufacturer: "Wellness Labs",
      notes: "Take after meals",
    };

    const response = await request(app)
      .post("/api/medications")
      .set("x-auth-token", token)
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject(payload);

    const stored = await Medication.findOne({ name: "Ibuprofen" });
    expect(stored).not.toBeNull();
    expect(stored.dosage).toBe("200mg");
  });
});

describe("GET /api/medications/:id", () => {
  it("returns 404 when medication does not exist", async () => {
    const { token } = await createUserFixture({ role: "admin" });
    const response = await request(app)
      .get(`/api/medications/${"64b66c8096fd197073d5f0b1"}`)
      .set("x-auth-token", token);

    expect(response.status).toBe(404);
  });

  it("returns the medication when found", async () => {
    const medication = await createMedicationFixture({ name: "Metformin" });
    const { token } = await createUserFixture({ role: "admin" });

    const response = await request(app)
      .get(`/api/medications/${medication._id}`)
      .set("x-auth-token", token);

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Metformin");
  });
});

describe("PATCH /api/medications/:id", () => {
  it("updates allowed fields for admin users", async () => {
    const medication = await createMedicationFixture({ name: "Paracetamol" });
    const { user } = await createUserFixture({ role: "admin" });

    const response = await request(app)
      .patch(`/api/medications/${medication._id}`)
      .set("x-auth-token", signToken(user))
      .send({ notes: "Updated note" });

    expect(response.status).toBe(200);
    expect(response.body.notes).toBe("Updated note");
  });
});

describe("DELETE /api/medications/:id", () => {
  it("requires super admin privileges", async () => {
    const medication = await createMedicationFixture({ name: "Amoxicillin" });
    const { user } = await createUserFixture({ role: "admin" });

    const response = await request(app)
      .delete(`/api/medications/${medication._id}`)
      .set("x-auth-token", signToken(user));

    expect(response.status).toBe(403);
  });

  it("deletes the medication for super admins", async () => {
    const medication = await createMedicationFixture({ name: "Captopril" });
    const { user } = await createUserFixture({ role: "superAdmin" });

    const response = await request(app)
      .delete(`/api/medications/${medication._id}`)
      .set("x-auth-token", signToken(user));

    expect(response.status).toBe(200);
    expect(await Medication.findById(medication._id)).toBeNull();
  });
});

