import { normalizeDateToYMD } from './seed.ts';
import type { BirthdayCampaignTracking, BirthdayOffer, CustomerRecord, SmsDeliveryStatus } from './types.ts';

export interface BirthdaySmsOption {
  option_id: 1 | 2;
  label: string;
  description: string;
  message: string;
  uses_offer_id: string | null;
  uses_offer_title: string | null;
}

export interface EnrichedBirthdayCustomer {
  customer: CustomerRecord;
  has_valid_dob: boolean;
  dob: string | null;
  next_birthday_date: string | null; // YYYY-MM-DD
  upcoming_birthday_label: string;
  days_remaining: number;
  is_today: boolean;
  is_urgent: boolean; // 0 to 7 days remaining
  leap_year_adjusted: boolean;
  sms_status: 'Not Sent' | SmsDeliveryStatus;
  last_birthday_campaign: BirthdayCampaignTracking | null;
  sms_options: [BirthdaySmsOption, BirthdaySmsOption];
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLocalToday(refDate?: Date): Date {
  const base = refDate ? new Date(refDate) : new Date();
  return new Date(base.getFullYear(), base.getMonth(), base.getDate());
}

/**
 * Computes next upcoming birthday from month & day ONLY (ignores birth year).
 * Supports both YYYY-MM-DD and DD-MM-YYYY DOB strings.
 * Feb 29 Policy: In non-leap years, Feb 29 birthdays are observed on Feb 28.
 */
export function computeBirthdayDetails(dobStr: string | null, refDate?: Date): {
  hasValidDob: boolean;
  nextBirthdayDate: string | null;
  daysRemaining: number | null;
  isToday: boolean;
  leapYearAdjusted: boolean;
  upcomingLabel: string;
} {
  const norm = normalizeDateToYMD(dobStr);
  if (!norm || !/^\d{4}-\d{2}-\d{2}$/.test(norm)) {
    return {
      hasValidDob: false,
      nextBirthdayDate: null,
      daysRemaining: null,
      isToday: false,
      leapYearAdjusted: false,
      upcomingLabel: 'No DOB',
    };
  }

  const parts = norm.split('-').map(Number);
  const birthMonth = parts[1];
  const birthDay = parts[2];
  if (birthMonth < 1 || birthMonth > 12 || birthDay < 1 || birthDay > 31) {
    return {
      hasValidDob: false,
      nextBirthdayDate: null,
      daysRemaining: null,
      isToday: false,
      leapYearAdjusted: false,
      upcomingLabel: 'Invalid DOB',
    };
  }

  const today = getLocalToday(refDate);

  const buildOccurrence = (year: number): { date: Date; adjusted: boolean } => {
    if (birthMonth === 2 && birthDay === 29 && !isLeapYear(year)) {
      return { date: new Date(year, 1, 28), adjusted: true };
    }
    return { date: new Date(year, birthMonth - 1, birthDay), adjusted: false };
  };

  let occurrence = buildOccurrence(today.getFullYear());
  if (occurrence.date.getTime() < today.getTime()) {
    occurrence = buildOccurrence(today.getFullYear() + 1);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.round((occurrence.date.getTime() - today.getTime()) / msPerDay);
  const isToday = daysRemaining === 0;

  let upcomingLabel = '';
  if (daysRemaining === 0) {
    upcomingLabel = 'Today';
  } else if (daysRemaining === 1) {
    upcomingLabel = 'Tomorrow';
  } else {
    upcomingLabel = occurrence.date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
    });
  }

  return {
    hasValidDob: true,
    nextBirthdayDate: formatDateYMD(occurrence.date),
    daysRemaining,
    isToday,
    leapYearAdjusted: occurrence.adjusted,
    upcomingLabel,
  };
}

/**
 * Generates EXACTLY TWO personalized birthday SMS options per customer.
 * Rules:
 * - Always starts with: "Hi {customer_name}, Greetings from Mother's Hut! "
 * - Uses advance birthday phrasing when daysRemaining > 0 (Tomorrow / in X days).
 * - Tailored per guest group (cluster_id).
 * - Premium Customers (cluster_id === 1) NEVER receive offers or coupons — standard VIP hospitality messages only.
 */
export function generateBirthdaySmsOptions(
  customer: CustomerRecord,
  approvedOffers: BirthdayOffer[],
  daysRemaining: number,
  upcomingLabel: string
): [BirthdaySmsOption, BirthdaySmsOption] {
  const name = customer.customer_name || 'Guest';
  const greetingPrefix = `Greetings from Mother's Hut!\nHi ${name}, `;
  const dish =
    customer.most_ordered_dish && customer.most_ordered_dish.trim()
      ? customer.most_ordered_dish.trim()
      : null;

  const advanceWish =
    daysRemaining === 0
      ? 'Wishing you a very Happy Birthday today!'
      : daysRemaining === 1
      ? 'Wishing you a very Happy Birthday in advance for tomorrow!'
      : `Wishing you a very Happy Birthday in advance as your special day arrives in ${daysRemaining} days (${upcomingLabel})!`;

  // PREMIUM CUSTOMERS (cluster_id === 1): Standard hospitality only — NO offers or coupons
  if (customer.cluster_id === 1) {
    const opt1Msg = dish
      ? `${greetingPrefix}${advanceWish} As one of our most valued guests, we would be honoured to host your celebration with priority table seating and your favourite ${dish}. Looking forward to welcoming you warmly.`
      : `${greetingPrefix}${advanceWish} As one of our most valued guests, we would be honoured to host your celebration with priority table seating and our signature hospitality. Looking forward to welcoming you warmly.`;

    const opt2Msg = dish
      ? `${greetingPrefix}${advanceWish} Our chef and hospitality team would be delighted to curate a serene, memorable celebratory dining experience for you and your loved ones featuring ${dish}. Warm regards, Mother's Hut.`
      : `${greetingPrefix}${advanceWish} Our chef and hospitality team would be delighted to curate a serene, memorable celebratory dining experience for you and your loved ones. Warm regards, Mother's Hut.`;

    return [
      {
        option_id: 1,
        label: 'Option 1 — VIP Advance Birthday & Priority Seating',
        description: 'Standard VIP hospitality wish with priority table reservation (no offers or coupons).',
        message: opt1Msg,
        uses_offer_id: null,
        uses_offer_title: 'Standard VIP Hospitality (No Offers/Coupons)',
      },
      {
        option_id: 2,
        label: "Option 2 — Chef's Personal Birthday Welcome",
        description: 'Refined celebration message tailored for Premium Customers without promotional discounts.',
        message: opt2Msg,
        uses_offer_id: null,
        uses_offer_title: 'Standard VIP Hospitality (No Offers/Coupons)',
      },
    ];
  }

  // Find active & owner-approved birthday offer for non-premium groups
  const activeApproved = approvedOffers.filter((o) => o.is_active && o.owner_approved);
  const matchingOffer =
    activeApproved.find((o) => {
      const target = o.applicable_item_or_category.toLowerCase();
      return (
        target === 'all' ||
        target === 'any' ||
        (customer.top_food_category && customer.top_food_category.toLowerCase().includes(target)) ||
        (dish && dish.toLowerCase().includes(target))
      );
    }) ||
    activeApproved[0] ||
    null;

  let option1Label = 'Option 1 — Advance Birthday Wishes & Favourite Dish';
  let option1Desc = dish
    ? `Personalized advance birthday wish featuring ${dish}.`
    : 'Personalized advance birthday wish tailored to their guest group.';
  let option1Msg = '';

  if (customer.cluster_id === 2) {
    // Family Visitors
    option1Label = 'Option 1 — Advance Family Celebration Wish';
    option1Desc = `Warm advance birthday wish inviting their family group of ${customer.avg_group_size}.`;
    option1Msg = dish
      ? `${greetingPrefix}${advanceWish} Bring your family together to celebrate at Mother's Hut with a spacious table and your favourite ${dish}. Let's make it joyful!`
      : `${greetingPrefix}${advanceWish} Bring your family together to celebrate at Mother's Hut with a warm, joyful dining gathering. We look forward to hosting you!`;
  } else if (customer.cluster_id === 3) {
    // Coupon Grabbers
    option1Label = 'Option 1 — Advance Birthday Combo Wish';
    option1Desc = `Friendly advance birthday greeting mentioning ${dish || customer.top_food_category}.`;
    option1Msg = dish
      ? `${greetingPrefix}${advanceWish} Celebrate your special week with us at Mother's Hut over your favourite ${dish} combo and great flavours!`
      : `${greetingPrefix}${advanceWish} Celebrate your special week with us at Mother's Hut over your favourite ${customer.top_food_category} dishes!`;
  } else {
    // Frequent Visitors (cluster_id === 0)
    option1Label = 'Option 1 — Loyal Guest Advance Birthday Wish';
    option1Desc = `Appreciates their ${customer.total_visits} visits with warm advance birthday wishes.`;
    option1Msg = dish
      ? `${greetingPrefix}${advanceWish} Thank you for being such a wonderful regular guest across ${customer.total_visits} visits. Come celebrate with your favourite ${dish}!`
      : `${greetingPrefix}${advanceWish} Thank you for being such a wonderful regular guest across ${customer.total_visits} visits. We would love to celebrate with you!`;
  }

  let option2Msg = '';
  let option2Desc = '';
  if (matchingOffer) {
    const dishPhrase = dish ? ` alongside your favourite ${dish}` : '';
    const minSpendNote =
      matchingOffer.min_order_amount_inr > 0
        ? ` (valid on dine-in orders ₹${matchingOffer.min_order_amount_inr}+ for ${matchingOffer.validity_days} days)`
        : ` (valid for ${matchingOffer.validity_days} days)`;

    if (customer.cluster_id === 2) {
      option2Msg = `${greetingPrefix}${advanceWish} Plan your upcoming family birthday dinner at Mother's Hut and enjoy ${matchingOffer.discount_or_benefit}${dishPhrase}${minSpendNote}.`;
    } else if (customer.cluster_id === 3) {
      option2Msg = `${greetingPrefix}${advanceWish} Make your upcoming birthday extra rewarding at Mother's Hut with ${matchingOffer.discount_or_benefit}${dishPhrase}${minSpendNote}!`;
    } else {
      option2Msg = `${greetingPrefix}${advanceWish} Celebrate your upcoming birthday at Mother's Hut and enjoy ${matchingOffer.discount_or_benefit}${dishPhrase}${minSpendNote}.`;
    }
    option2Desc = `Advance birthday wish with owner-approved offer (${matchingOffer.title}).`;
  } else {
    const dishPhrase = dish ? `your favourite ${dish}` : 'our signature dishes';
    option2Msg = `${greetingPrefix}${advanceWish} Come celebrate your upcoming birthday at Mother's Hut with ${dishPhrase} and make great memories with us!`;
    option2Desc = 'Advance birthday celebration invite (no active offer configured).';
  }

  return [
    {
      option_id: 1,
      label: option1Label,
      description: option1Desc,
      message: option1Msg,
      uses_offer_id: null,
      uses_offer_title: null,
    },
    {
      option_id: 2,
      label: matchingOffer
        ? 'Option 2 — Advance Birthday & Celebration Offer'
        : 'Option 2 — Advance Birthday Dining Invite',
      description: option2Desc,
      message: option2Msg,
      uses_offer_id: matchingOffer ? matchingOffer.id : null,
      uses_offer_title: matchingOffer ? matchingOffer.title : null,
    },
  ];
}

export function buildBirthdayList(
  customers: CustomerRecord[],
  offers: BirthdayOffer[],
  trackings: BirthdayCampaignTracking[],
  refDate?: Date
): EnrichedBirthdayCustomer[] {
  const results: EnrichedBirthdayCustomer[] = [];

  for (const c of customers) {
    const info = computeBirthdayDetails(c.dob, refDate);
    if (!info.hasValidDob || info.daysRemaining === null || !info.nextBirthdayDate) {
      continue;
    }

    const tracking =
      trackings
        .filter((t) => t.customer_id === c.customer_id && t.birthday_occurrence === info.nextBirthdayDate)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;

    results.push({
      customer: c,
      has_valid_dob: true,
      dob: c.dob,
      next_birthday_date: info.nextBirthdayDate,
      upcoming_birthday_label: info.upcomingLabel,
      days_remaining: info.daysRemaining,
      is_today: info.isToday,
      is_urgent: info.daysRemaining >= 0 && info.daysRemaining <= 7,
      leap_year_adjusted: info.leapYearAdjusted,
      sms_status: tracking ? tracking.sms_status : 'Not Sent',
      last_birthday_campaign: tracking,
      sms_options: generateBirthdaySmsOptions(c, offers, info.daysRemaining, info.upcomingLabel),
    });
  }

  // Strictly sort ascending by days_remaining
  results.sort((a, b) => a.days_remaining - b.days_remaining);
  return results;
}
