import prisma from "../db.js";
import { ADMIN_NUMBERS, SUBSCRIPTION_PLANS } from "../config/index.js";

// ==========================
// CHECK IF USER IS ADMIN
// ==========================
export function isAdmin(whatsappId) {
  // Admin check - compare with both phone numbers and potential LIDs
  const cleanId = String(whatsappId).replace(/\D/g, "");
  return ADMIN_NUMBERS.some((admin) => admin.replace(/\D/g, "") === cleanId);
}

// ==========================
// PARSE ADMIN COMMANDS
// ==========================
export function parseCommand(messageBody, mentionedIds, mentionedIdsInfo = []) {
  const body = messageBody.trim();

  // Command patterns
  const patterns = {
    // Register: @bot register @user PLAN 2025-02-15
    // Or: @bot register 923001234567 PLAN 2025-02-15
    register:
      /register\s+@?(\d+)\s+(BASIC|STANDARD|PREMIUM)\s+(\d{4}-\d{2}-\d{2})/i,

    // Update: @bot update @user PLAN 2025-02-15
    update:
      /update\s+@?(\d+)\s+(BASIC|STANDARD|PREMIUM)\s+(\d{4}-\d{2}-\d{2})/i,

    // Delete: @bot delete @user
    delete: /delete\s+@?(\d+)/i,

    // Check: @bot check @user
    check: /check\s+@?(\d+)/i,

    // Status: @bot status @user
    status: /status\s+@?(\d+)/i,

    // List all users: @bot list
    list: /\blist\b/i,

    // Stats: @bot stats
    stats: /\bstats\b/i,

    // Expiring: @bot expiring (days)
    expiring: /expiring\s*(\d+)?/i,

    // Renew: @bot renew @user (days)
    renew: /renew\s+@?(\d+)\s+(\d+)/i,

    // Help: @bot help
    help: /\bhelp\b|\bcommands\b/i,
  };

  // Try to match each pattern
  for (const [command, pattern] of Object.entries(patterns)) {
    const match = body.match(pattern);
    if (match) {
      return { command, match, body };
    }
  }

  // Check if there's a mentioned user (for registration via mention)
  // Format: @bot @userWhatsAppId STANDARD 2025-02-15
  // The mentioned ID could be a LID (like 137804394799233) or phone number
  if (mentionedIds && mentionedIds.length > 1) {
    const planMatch = body.match(/\b(BASIC|STANDARD|PREMIUM)\b/i);
    const dateMatch = body.match(/(\d{4}-\d{2}-\d{2})/);

    if (planMatch && dateMatch) {
      // Get the second mentioned ID (first is bot)
      // ✅ Use the ORIGINAL WhatsApp ID (LID or phone number) - don't clean it
      const userWhatsAppId = mentionedIds[1];

      console.log(
        "📝 Registration via mention - User WhatsApp ID:",
        userWhatsAppId
      );

      if (userWhatsAppId) {
        return {
          command: "register",
          match: [null, userWhatsAppId, planMatch[1], dateMatch[1]],
          body,
        };
      }
    }
  }

  return null;
}

// ==========================
// EXECUTE ADMIN COMMANDS
// ==========================
export async function executeCommand(command, match, senderNumber) {
  try {
    switch (command) {
      case "register":
        return await registerUser(match[1], match[2].toUpperCase(), match[3]);

      case "update":
        return await updateUser(match[1], match[2].toUpperCase(), match[3]);

      case "delete":
        return await deleteUser(match[1]);

      case "check":
      case "status":
        return await checkUser(match[1]);

      case "list":
        return await listUsers();

      case "stats":
        return await getStats();

      case "expiring":
        const days = parseInt(match[1]) || 7;
        return await getExpiringUsers(days);

      case "renew":
        const renewDays = parseInt(match[2]) || 30;
        return await renewUser(match[1], renewDays);

      case "help":
        return getHelpMessage();

      default:
        return { success: false, message: "❌ Unknown command" };
    }
  } catch (error) {
    console.error(`❌ Command execution error:`, error);
    return { success: false, message: `❌ Error: ${error.message}` };
  }
}

// ==========================
// REGISTER NEW USER
// ==========================
async function registerUser(whatsappId, plan, expiryDate) {
  // ✅ Store the WhatsApp ID as-is (could be LID like 137804394799233 or phone number)
  // Just ensure it's a clean string (no special characters)
  const wId = String(whatsappId).trim();

  console.log("📝 Registering user with WhatsApp ID:", wId);

  // Validate plan
  if (!SUBSCRIPTION_PLANS[plan]) {
    return {
      success: false,
      message: `❌ Invalid plan: ${plan}\n\nValid plans: BASIC, STANDARD, PREMIUM`,
    };
  }

  // Validate date
  const expiry = new Date(expiryDate);
  if (isNaN(expiry.getTime())) {
    return {
      success: false,
      message: `❌ Invalid date format: ${expiryDate}\n\nUse: YYYY-MM-DD (e.g., 2025-02-15)`,
    };
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { wId },
    include: { subscription: true },
  });

  if (existingUser) {
    return {
      success: false,
      message:
        `❌ User @${wId} already exists!\n\n` +
        `📋 Current Plan: ${existingUser.subscription?.plan || "None"}\n` +
        `📅 Expires: ${
          existingUser.subscription?.expiresAt?.toLocaleDateString() || "N/A"
        }\n\n` +
        `Use *update* command to modify this user.`,
      mentionUser: wId,
    };
  }

  // Create user
  const user = await prisma.user.create({
    data: {
      wId,
      name: `User ${wId}`,
      subscription: {
        create: {
          plan,
          expiresAt: expiry,
        },
      },
    },
    include: { subscription: true },
  });

  const planInfo = SUBSCRIPTION_PLANS[plan];

  return {
    success: true,
    message:
      `✅ *User Registered Successfully!*\n\n` +
      `👤 WhatsApp ID: @${wId}\n` +
      `📋 Plan: ${plan}\n` +
      `📊 Daily Limit: ${planInfo.dailyLimit} files\n` +
      `💰 Price: ${planInfo.price} PKR\n` +
      `📅 Expires: ${expiry.toLocaleDateString()}\n\n` +
      `User can now download files! 🎉`,
    mentionUser: wId,
  };
}

// ==========================
// UPDATE USER
// ==========================
async function updateUser(whatsappId, plan, expiryDate) {
  const wId = String(whatsappId).trim();

  // Validate plan
  if (!SUBSCRIPTION_PLANS[plan]) {
    return {
      success: false,
      message: `❌ Invalid plan: ${plan}\n\nValid plans: BASIC, STANDARD, PREMIUM`,
    };
  }

  // Validate date
  const expiry = new Date(expiryDate);
  if (isNaN(expiry.getTime())) {
    return {
      success: false,
      message: `❌ Invalid date format: ${expiryDate}\n\nUse: YYYY-MM-DD`,
    };
  }

  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { wId },
    include: { subscription: true },
  });

  if (!existingUser) {
    return {
      success: false,
      message: `❌ User @${wId} not found!\n\nUse *register* command to create this user.`,
      mentionUser: wId,
    };
  }

  // Update subscription
  await prisma.subscription.upsert({
    where: { userId: existingUser.id },
    update: {
      plan,
      expiresAt: expiry,
      reminderDay7Send: false,
      reminderDay4Send: false,
      reminderDay1Send: false,
    },
    create: {
      userId: existingUser.id,
      plan,
      expiresAt: expiry,
    },
  });

  const planInfo = SUBSCRIPTION_PLANS[plan];

  return {
    success: true,
    message:
      `✅ *User Updated Successfully!*\n\n` +
      `👤 WhatsApp ID: @${wId}\n` +
      `📋 New Plan: ${plan}\n` +
      `📊 Daily Limit: ${planInfo.dailyLimit} files\n` +
      `📅 New Expiry: ${expiry.toLocaleDateString()}`,
    mentionUser: wId,
  };
}

// ==========================
// DELETE USER
// ==========================
async function deleteUser(whatsappId) {
  const wId = String(whatsappId).trim();

  const user = await prisma.user.findUnique({
    where: { wId },
    include: { subscription: true, Request: true },
  });

  if (!user) {
    return {
      success: false,
      message: `❌ User @${wId} not found!`,
    };
  }

  // Delete related records first
  await prisma.request.deleteMany({ where: { userId: user.id } });
  await prisma.subscription.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { wId } });

  return {
    success: true,
    message:
      `✅ *User Deleted Successfully!*\n\n` +
      `👤 WhatsApp ID: @${wId}\n` +
      `📋 Plan was: ${user.subscription?.plan || "None"}\n` +
      `📊 Total Requests: ${user.Request?.length || 0}`,
  };
}

// ==========================
// CHECK USER STATUS
// ==========================
async function checkUser(whatsappId) {
  const wId = String(whatsappId).trim();

  const user = await prisma.user.findUnique({
    where: { wId },
    include: { subscription: true, Request: true },
  });

  if (!user) {
    return {
      success: false,
      message: `❌ User @${wId} not found!`,
    };
  }

  // Get today's requests
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const todayRequests = await prisma.request.count({
    where: {
      userId: user.id,
      date: { gte: today, lt: todayEnd },
    },
  });

  const subscription = user.subscription;
  const isExpired = subscription ? subscription.expiresAt < new Date() : true;
  const daysLeft = subscription
    ? Math.ceil((subscription.expiresAt - new Date()) / (1000 * 60 * 60 * 24))
    : 0;

  const planInfo = subscription ? SUBSCRIPTION_PLANS[subscription.plan] : null;

  return {
    success: true,
    message:
      `📊 *User Status*\n\n` +
      `👤 WhatsApp ID: @${wId}\n` +
      `📝 Name: ${user.name || "Not set"}\n` +
      `📋 Plan: ${subscription?.plan || "None"}\n` +
      `📊 Daily Limit: ${planInfo?.dailyLimit || 0} files\n` +
      `📈 Used Today: ${todayRequests}/${planInfo?.dailyLimit || 0}\n` +
      `📅 Expires: ${
        subscription?.expiresAt?.toLocaleDateString() || "N/A"
      }\n` +
      `⏳ Days Left: ${daysLeft > 0 ? daysLeft : "Expired"}\n` +
      `🔄 Status: ${isExpired ? "❌ Expired" : "✅ Active"}\n` +
      `📊 Total Requests: ${user.Request?.length || 0}`,
    mentionUser: wId,
  };
}

// ==========================
// LIST ALL USERS
// ==========================
async function listUsers() {
  const users = await prisma.user.findMany({
    include: { subscription: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (users.length === 0) {
    return {
      success: true,
      message: "📋 No users registered yet.",
    };
  }

  let message = `📋 *Registered Users* (${users.length})\n\n`;

  users.forEach((user, index) => {
    const isExpired = user.subscription
      ? user.subscription.expiresAt < new Date()
      : true;
    const status = isExpired ? "❌" : "✅";

    message += `${index + 1}. ${status} ${user.wId}\n`;
    message += `   📋 ${user.subscription?.plan || "No Plan"}\n`;
    message += `   📅 ${
      user.subscription?.expiresAt?.toLocaleDateString() || "N/A"
    }\n\n`;
  });

  return {
    success: true,
    message,
  };
}

// ==========================
// GET STATS
// ==========================
async function getStats() {
  const totalUsers = await prisma.user.count();

  const now = new Date();

  const activeSubscriptions = await prisma.subscription.count({
    where: { expiresAt: { gt: now } },
  });

  const expiredSubscriptions = await prisma.subscription.count({
    where: { expiresAt: { lt: now } },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRequests = await prisma.request.count({
    where: { date: { gte: today } },
  });

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRequests = await prisma.request.count({
    where: { date: { gte: monthStart } },
  });

  const planCounts = await prisma.subscription.groupBy({
    by: ["plan"],
    where: { expiresAt: { gt: now } },
    _count: { plan: true },
  });

  let planBreakdown = "";
  for (const p of planCounts) {
    planBreakdown += `   • ${p.plan}: ${p._count.plan}\n`;
  }

  return {
    success: true,
    message:
      `📊 *System Statistics*\n\n` +
      `👥 Total Users: ${totalUsers}\n` +
      `✅ Active Subscriptions: ${activeSubscriptions}\n` +
      `❌ Expired Subscriptions: ${expiredSubscriptions}\n\n` +
      `📈 *Requests*\n` +
      `   Today: ${todayRequests}\n` +
      `   This Month: ${monthRequests}\n\n` +
      `📋 *Active Plans*\n${planBreakdown || "   No active plans"}`,
  };
}

// ==========================
// GET EXPIRING USERS
// ==========================
async function getExpiringUsers(days) {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  const expiringUsers = await prisma.user.findMany({
    where: {
      subscription: {
        expiresAt: { gte: now, lte: futureDate },
      },
    },
    include: { subscription: true },
    orderBy: { subscription: { expiresAt: "asc" } },
  });

  if (expiringUsers.length === 0) {
    return {
      success: true,
      message: `✅ No subscriptions expiring in the next ${days} days.`,
    };
  }

  let message = `⚠️ *Expiring in ${days} Days* (${expiringUsers.length})\n\n`;

  expiringUsers.forEach((user, index) => {
    const daysLeft = Math.ceil(
      (user.subscription.expiresAt - now) / (1000 * 60 * 60 * 24)
    );

    message += `${index + 1}. ${user.wId}\n`;
    message += `   📋 ${user.subscription.plan}\n`;
    message += `   ⏳ ${daysLeft} day(s) left\n`;
    message += `   📅 ${user.subscription.expiresAt.toLocaleDateString()}\n\n`;
  });

  return {
    success: true,
    message,
  };
}

// ==========================
// RENEW USER
// ==========================
async function renewUser(whatsappId, days) {
  const wId = String(whatsappId).trim();

  const user = await prisma.user.findUnique({
    where: { wId },
    include: { subscription: true },
  });

  if (!user) {
    return {
      success: false,
      message: `❌ User @${wId} not found!`,
    };
  }

  if (!user.subscription) {
    return {
      success: false,
      message: `❌ User @${wId} has no subscription to renew!`,
    };
  }

  const currentExpiry = user.subscription.expiresAt;
  const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
  const newExpiry = new Date(baseDate);
  newExpiry.setDate(newExpiry.getDate() + days);

  await prisma.subscription.update({
    where: { userId: user.id },
    data: {
      expiresAt: newExpiry,
      reminderDay7Send: false,
      reminderDay4Send: false,
      reminderDay1Send: false,
    },
  });

  return {
    success: true,
    message:
      `✅ *Subscription Renewed!*\n\n` +
      `👤 WhatsApp ID: @${wId}\n` +
      `📋 Plan: ${user.subscription.plan}\n` +
      `➕ Added: ${days} days\n` +
      `📅 New Expiry: ${newExpiry.toLocaleDateString()}`,
    mentionUser: wId,
  };
}

// ==========================
// HELP MESSAGE
// ==========================
function getHelpMessage() {
  return {
    success: true,
    message:
      `📚 *Admin Commands*\n\n` +
      `*Register User (via mention):*\n` +
      `@bot @user STANDARD 2025-02-15\n\n` +
      `*Register User (via ID):*\n` +
      `@bot register 137804394799233 STANDARD 2025-02-15\n\n` +
      `*Update User:*\n` +
      `@bot update 137804394799233 PREMIUM 2025-03-15\n\n` +
      `*Renew User (add days):*\n` +
      `@bot renew 137804394799233 30\n\n` +
      `*Check User:*\n` +
      `@bot check 137804394799233\n\n` +
      `*Delete User:*\n` +
      `@bot delete 137804394799233\n\n` +
      `*List Users:*\n` +
      `@bot list\n\n` +
      `*View Stats:*\n` +
      `@bot stats\n\n` +
      `*Expiring Soon:*\n` +
      `@bot expiring 7\n\n` +
      `*Plans Available:*\n` +
      `• BASIC - 10 files/day - 299 PKR\n` +
      `• STANDARD - 20 files/day - 349 PKR\n` +
      `• PREMIUM - 30 files/day - 379 PKR\n\n` +
      `💡 *Note:* Use WhatsApp ID (shown when user sends message) for commands.`,
  };
}
