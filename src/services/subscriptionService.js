import prisma from "../db.js";

// ==========================
// CHECK SUBSCRIPTION
// ==========================
export async function checkSubscription(wId) {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const user = await prisma.user.findFirst({
      where: { wId },
      include: {
        subscription: true,
        Request: { where: { date: { gte: start, lt: end } } },
      },
    });

    if (!user)
      return {
        valid: false,
        reason: "User not found",
        userId: null,
        requestsToday: 0,
        limit: 0,
      };

    if (!user.subscription)
      return {
        valid: false,
        reason: "No active subscription",
        userId: user.id,
        requestsToday: user.Request.length,
        limit: 0,
      };

    if (user.subscription.expiresAt < new Date())
      return {
        valid: false,
        reason: "Subscription expired",
        userId: user.id,
        requestsToday: user.Request.length,
        limit: 0,
      };

    const plan = user.subscription.plan;
    const requestsToday = user.Request.length;
    const limits = { BASIC: 10, STANDARD: 20, PREMIUM: 30 };
    const limit = limits[plan] || 0;

    if (requestsToday >= limit)
      return {
        valid: false,
        reason: "Daily limit exceeded",
        userId: user.id,
        requestsToday,
        limit,
      };

    return {
      valid: true,
      reason: "Valid subscription",
      userId: user.id,
      requestsToday,
      limit,
      subscription: plan,
    };
  } catch (err) {
    console.error("❌ Error checking subscription:", err);
    return {
      valid: false,
      reason: "Database error",
      userId: null,
      requestsToday: 0,
      limit: 0,
    };
  }
}

// ==========================
// CREATE REQUEST RECORD
// ==========================
export async function createRequest(userId) {
  try {
    const req = await prisma.request.create({ data: { userId } });
    console.log("✅ Request created:", req);
    return req;
  } catch (err) {
    console.error("❌ Error creating request:", err);
  }
}
