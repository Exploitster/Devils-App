/** The one monthly plan. Dodo's product must match: verifyProduct refuses any other price. */
export const MONTHLY_PRICE_INR = 200;
/** Dodo and the billing API count in paise, the smallest INR unit. */
export const MONTHLY_PRICE_PAISE = MONTHLY_PRICE_INR * 100;
export const MONTHLY_PRICE_LABEL = `₹${MONTHLY_PRICE_INR.toLocaleString('en-IN')}`;
