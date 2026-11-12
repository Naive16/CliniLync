export const SUPPORTED_CURRENCY_CODES = ['MWK', 'USD', 'GBP', 'EUR', 'ZAR', 'KES', 'TZS', 'BWP', 'NGN', 'CAD', 'AUD', 'CHF', 'INR'] as const;
export type SupportedCurrencyCode = typeof SUPPORTED_CURRENCY_CODES[number];

export const SUPPORTED_COUNTRY_CODES = ['MWI', 'USA', 'GBR', 'ZAF', 'KEN', 'TZA', 'BWA', 'NGA', 'CAN', 'AUS', 'CHE', 'IND'] as const;

export const CURRENCY_LABELS: Record<SupportedCurrencyCode, string> = {
  MWK: 'Malawian kwacha', USD: 'US dollar', GBP: 'Pound sterling', EUR: 'Euro', ZAR: 'South African rand',
  KES: 'Kenyan shilling', TZS: 'Tanzanian shilling', BWP: 'Botswana pula', NGN: 'Nigerian naira', CAD: 'Canadian dollar',
  AUD: 'Australian dollar', CHF: 'Swiss franc', INR: 'Indian rupee'
};
