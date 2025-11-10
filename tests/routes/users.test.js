const request = require("supertest");
const createTestApp = require("../../startup/createTestApp");
const User = require("../../models/User");
const { createUserFixture } = require("../fixtures/factories");
const { signToken } = require("../utils/token");

const app = createTestApp();

describe("POST /api/users/register", () => {
  it("registers a new user and returns a token", async () => {
    const response = await request(app).post("/api/users/register").send({
      username: "newuser",
      email: "new@example.com",
      password: "NewUserPass1!",
      phoneNumber: "+441234567890",
    });

    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));

    const user = await User.findOne({ email: "new@example.com" });
    expect(user).not.toBeNull();
    expect(user.password).not.toBe("NewUserPass1!");
  });

  it("rejects duplicate registrations", async () => {
    await createUserFixture({ email: "dup@example.com" });

    const response = await request(app).post("/api/users/register").send({
      username: "newuser",
      email: "dup@example.com",
      password: "NewUserPass1!",
      phoneNumber: "+441234567890",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/already exists/i);
  });
});

describe("GET /api/users", () => {
  it("requires admin privileges", async () => {
    const { token } = await createUserFixture();

    const response = await request(app)
      .get("/api/users")
      .set("x-auth-token", token);

    expect(response.status).toBe(403);
  });

  it("returns users for admins", async () => {
    await createUserFixture();
    const { user, token } = await createUserFixture({ role: "admin" });

    const response = await request(app)
      .get("/api/users")
      .set("x-auth-token", token);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(1);
    expect(response.body[0]).not.toHaveProperty("password");
  });
});

describe("GET /api/users/:id", () => {
  it("returns 403 when a regular user requests another user", async () => {
    const { user: firstUser, token } = await createUserFixture();
    const { user: secondUser } = await createUserFixture();

    const response = await request(app)
      .get(`/api/users/${secondUser._id}`)
      .set("x-auth-token", token);

    expect(response.status).toBe(403);
  });

  it("allows admins to fetch any user", async () => {
    const { user: targetUser } = await createUserFixture();
    const { token } = await createUserFixture({ role: "admin" });

    const response = await request(app)
      .get(`/api/users/${targetUser._id}`)
      .set("x-auth-token", token);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(targetUser.email);
  });
});

describe("PUT /api/users/:id", () => {
  it("allows a user to update their own profile", async () => {
    const { user, token } = await createUserFixture();

    const response = await request(app)
      .put(`/api/users/${user._id}`)
      .set("x-auth-token", token)
      .send({ phoneNumber: "+441112223334" });

    expect(response.status).toBe(200);
    expect(response.body.phoneNumber).toBe("+441112223334");
  });

  it("prevents users from updating other users", async () => {
    const { user: firstUser, token } = await createUserFixture();
    const { user: secondUser } = await createUserFixture();

    const response = await request(app)
      .put(`/api/users/${secondUser._id}`)
      .set("x-auth-token", token)
      .send({ phoneNumber: "+441112223334" });

    expect(response.status).toBe(403);
  });

  it("allows admins to update user roles", async () => {
    const { user: targetUser } = await createUserFixture();
    const { user: adminUser } = await createUserFixture({ role: "admin" });

    const response = await request(app)
      .put(`/api/users/${targetUser._id}`)
      .set("x-auth-token", signToken(adminUser))
      .send({ role: "admin" });

    expect(response.status).toBe(200);
    expect(response.body.role).toBe("admin");
  });
});

describe("POST /api/users/:id/change-password", () => {
  it("updates password when current password matches", async () => {
    const { user, plainPassword } = await createUserFixture({
      password: "CurrentPass1!",
    });
    const token = signToken(user);

    const response = await request(app)
      .post(`/api/users/${user._id}/change-password`)
      .set("x-auth-token", token)
      .send({
        currentPassword: "CurrentPass1!",
        newPassword: "NewPass2!",
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/updated successfully/i);
  });

  it("rejects incorrect current password", async () => {
    const { user } = await createUserFixture({
      password: "CurrentPass1!",
    });
    const token = signToken(user);

    const response = await request(app)
      .post(`/api/users/${user._id}/change-password`)
      .set("x-auth-token", token)
      .send({
        currentPassword: "WrongPass!",
        newPassword: "NewPass2!",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/incorrect/i);
  });
});

describe("DELETE /api/users/:id", () => {
  it("prevents deleting the last super admin", async () => {
    const { user: superAdmin } = await createUserFixture({
      role: "superAdmin",
    });
    const token = signToken(superAdmin);

    const response = await request(app)
      .delete(`/api/users/${superAdmin._id}`)
      .set("x-auth-token", token);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/last superAdmin/i);
  });

  it("allows deleting a super admin when others exist", async () => {
    const { user: firstSuperAdmin } = await createUserFixture({
      role: "superAdmin",
    });
    const { user: secondSuperAdmin } = await createUserFixture({
      role: "superAdmin",
    });

    const response = await request(app)
      .delete(`/api/users/${secondSuperAdmin._id}`)
      .set("x-auth-token", signToken(firstSuperAdmin));

    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/deleted successfully/i);
    expect(await User.countDocuments({ role: "superAdmin" })).toBe(1);
  });
});

