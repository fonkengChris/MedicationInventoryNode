const request = require("supertest");
const createTestApp = require("../../startup/createTestApp");
const { createUserFixture } = require("../fixtures/factories");
const { signToken } = require("../utils/token");

const app = createTestApp();

describe("POST /api/auth", () => {
  it("returns a token when credentials are valid", async () => {
    const { user, plainPassword } = await createUserFixture({
      password: "StrongPass#1",
    });

    const response = await request(app).post("/api/auth").send({
      email: user.email,
      password: "StrongPass#1",
    });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("rejects invalid credentials", async () => {
    const { user } = await createUserFixture({
      password: "StrongPass#2",
    });

    const response = await request(app).post("/api/auth").send({
      email: user.email,
      password: "WrongPassword",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/invalid credentials/i);
  });
});

describe("GET /api/auth/me", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
  });

  it("returns the current user when authenticated", async () => {
    const { user } = await createUserFixture();

    const response = await request(app)
      .get("/api/auth/me")
      .set("x-auth-token", signToken(user));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      email: user.email,
      username: user.username,
      role: user.role,
    });
    expect(response.body).not.toHaveProperty("password");
  });
});

