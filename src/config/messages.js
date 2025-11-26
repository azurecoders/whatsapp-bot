export const RENEWAL_MESSAGE = `Assalam-o-Alaikum, Dear Member,

Your subscription to "Freepik Premium by Mubashir Awan" is about to expire. To continue accessing our files, please renew your subscription.

Plans Available:
✨ Basic – 10 files/day | 299 PKR
✨ Standard (Most Popular) 20 files/day | 349 PKR
✨ Premium – 30 files/day | 379 PKR

Payment Details:
JazzCash: 03319818561
Name: Mubashir Mehmood Awan

Note: Payment will only be accepted with a valid screenshot.

Admin Mubashir Awan
Thank you for being part of our community.`;

export const NOT_REGISTERED_MESSAGE = `Assalam-o-Alaikum, Dear User,

You are not registered in our system. Please contact the admin to get registered and start using our services.

If you wish to join our premium plans, please see the details below:

Your subscription to "Freepik Premium by Mubashir Awan" gives you access to high-quality premium files.

Plans Available:
✨ Basic – 10 files/day | 299 PKR
✨ Standard (Most Popular) – 20 files/day | 349 PKR
✨ Premium – 30 files/day | 379 PKR

Payment Details:
JazzCash: 03319818561
Name: Mubashir Mehmood Awan

Note: Payment will only be accepted with a valid screenshot.

Please contact Admin Mubashir Awan to complete your registration.

Thank you for your interest in our community.`;

export const getSubscriptionErrorMessage = (senderNumber, reason, sub) => {
  let msgText = `@${senderNumber}! `;

  switch (reason) {
    case "User not found":
      msgText += NOT_REGISTERED_MESSAGE;
      break;
    case "No active subscription":
      msgText += "You don't have an active subscription.";
      break;
    case "Daily limit exceeded":
      msgText += `Limit ${sub.limit} reached (${sub.requestsToday} used).`;
      break;
    case "Subscription expired":
      msgText += "Your subscription expired.";
      break;
    default:
      msgText += "Subscription check failed.";
      break;
  }

  return msgText;
};
