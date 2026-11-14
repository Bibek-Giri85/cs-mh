export const BRAND_LOGO_URL ='https://yt3.googleusercontent.com/OzfkvM2ORpE_XansLC5-1ZmtenevjixKSvRQLthjivhjWUdJ-3uUtSiCF2Fn93npbM5tN19BZw=s900-c-k-c0x00ffffff-no-rj';
import type { CustomerRecord } from '../types';

export const HELPLINE_NUMBER = '7894561233';
export const REVENUE_PASSWORD = '2004';

export const BN_CATEGORY_MAP: Record<string, string> = {
  Chicken: 'চিকেন',
  Veg: 'ভেজ',
  Mutton: 'মাটন',
  Seafood: 'সি-ফুড',
  'Biryani & Rice': 'বিরিয়ানি ও রাইস',
  'Chinese & Fast Food': 'চাইনিজ ও ফাস্ট ফুড',
  'Dessert & Beverage': 'ডেজার্ট ও বেভারেজ',
};

export const BN_MEAL_MAP: Record<string, string> = {
  Lunch: 'লাঞ্চ',
  Dinner: 'ডিনার',
  'Evening Snacks': 'সন্ধ্যার স্ন্যাকস',
  'Late Night': 'লেট নাইট',
  Breakfast: 'ব্রেকফাস্ট',
};

export interface ClusterTemplateItem {
  badge: string;
  coupon: string | null;
  title: string;
  note: string;
  text: string;
}

export interface ClusterTemplateConfig {
  id: number;
  name: string;
  subtitle: string;
  color: string;
  templates: {
    en: ClusterTemplateItem[];
    bn: ClusterTemplateItem[];
  };
}

export const CLUSTER_CONFIG: Record<number, ClusterTemplateConfig> = {
  0: {
    id: 0,
    name: 'Frequent Visitors',
    subtitle: 'Regular diners with strong loyalty potential',
    color: '#ab6446',
    templates: {
      en: [
        {
          badge: '2X Loyalty Points',
          coupon: 'MH2XPTS',
          title: 'Message 1 – Regular Guest Loyalty Bonus',
          note: 'Rewards repeat guests with double loyalty points on their favorite dish.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, thank you for being a regular guest with us. Use coupon code MH2XPTS on your next {most_ordered_dish} order to earn 2X loyalty points. For any query, contact us at ${HELPLINE_NUMBER}.`,
        },
        {
          badge: 'Complimentary Treat',
          coupon: 'MHTREAT',
          title: 'Message 2 – Favorite Dish Appreciation',
          note: 'Offers a complimentary starter or dessert on their next visit.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, thank you for your {total_visits} wonderful visits. Mention coupon code MHTREAT on your next {preferred_meal_time} visit to enjoy a complimentary {top_food_category} starter or dessert. For any query, contact us at ${HELPLINE_NUMBER}.`,
        },
      ],
      bn: [
        {
          badge: '২X লয়্যালটি পয়েন্ট',
          coupon: 'MH2XPTS',
          title: 'বার্তা ১ – নিয়মিত অতিথির লয়্যালটি বোনাস',
          note: 'নিয়মিত অতিথিদের পছন্দের খাবারে দ্বিগুণ লয়্যালটি পয়েন্টের অফার।',
          text: `Greetings from Mother's Hut!\nনমস্কার {customer_name}, আমাদের রেস্তোরাঁয় নিয়মিত আসার জন্য আন্তরিক ধন্যবাদ! আপনার পরবর্তী {most_ordered_dish} অর্ডারে কুপন কোড MH2XPTS ব্যবহার করে জিতে নিন ২X লয়্যালটি পয়েন্ট। যেকোনো প্রয়োজনে আমাদের ${HELPLINE_NUMBER} নম্বরে যোগাযোগ করুন।`,
        },
        {
          badge: 'কমপ্লিমেন্টারি ট্রিট',
          coupon: 'MHTREAT',
          title: 'বার্তা ২ – প্রিয় খাবারের বিশেষ উপহার',
          note: 'পরবর্তী ভিজিটে থাকছে ফ্রি স্টার্টার বা ডেজার্টের বিশেষ উপহার।',
          text: `Greetings from Mother's Hut!\nপ্রিয় {customer_name}, আপনার {total_visits} বারের ভালোবাসার জন্য ধন্যবাদ! পরবর্তী {preferred_meal_time}-এ কুপন কোড MHTREAT বললেই {top_food_category}-এর সাথে পাচ্ছেন একটি ফ্রি স্টার্টার বা ডেজার্ট। যেকোনো প্রয়োজনে আমাদের ${HELPLINE_NUMBER} নম্বরে যোগাযোগ করুন।`,
        },
      ],
    },
  },
  1: {
    id: 1,
    name: 'Premium Customers',
    subtitle: 'High-spending guests who value curated hospitality',
    color: '#0284c7',
    templates: {
      en: [
        {
          badge: 'Priority Hospitality',
          coupon: null,
          title: 'Message 1 – Reserved Table & Personal Welcome',
          note: 'Standard VIP hospitality message with priority seating (no coupons or discounts).',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, we are delighted to reserve priority table seating for your next {preferred_meal_time} visit so you can comfortably enjoy your favourite {most_ordered_dish} with our signature hospitality. For table reservations, reach us at ${HELPLINE_NUMBER}.`,
        },
        {
          badge: "Chef's Curated Menu",
          coupon: null,
          title: "Message 2 – Chef's Special Dining Invitation",
          note: 'Refined, coupon-free invitation tailored for high-spending guests.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, this week our chef has prepared our finest {top_food_category} selections alongside your favourite {most_ordered_dish}. We would be honoured to host you for a serene dining experience. For reservations, contact ${HELPLINE_NUMBER}.`,
        },
      ],
      bn: [
        {
          badge: 'প্রাইয়োরিটি সিটিং',
          coupon: null,
          title: 'বার্তা ১ – স্পেশাল টেবিল ও আতিথেয়তা',
          note: 'প্রিমিয়াম অতিথিদের জন্য কোনো কুপন বা ছাড় ছাড়াই বিশেষ টেবিল ও আতিথেয়তার আমন্ত্রণ।',
          text: `Greetings from Mother's Hut!\nনমস্কার {customer_name}, আমাদের বিশেষ অতিথি হিসেবে আপনার পরবর্তী {preferred_meal_time} ভিজিটে পছন্দের {most_ordered_dish} উপভোগ করার জন্য প্রাইয়োরিটি টেবিল রিজার্ভ থাকছে। টেবিল বুকিংয়ের জন্য ${HELPLINE_NUMBER} নম্বরে যোগাযোগ করুন।`,
        },
        {
          badge: 'শেফ স্পেশাল মেনু',
          coupon: null,
          title: 'বার্তা ২ – শেফের স্পেশাল ডাইনিং আমন্ত্রণ',
          note: 'কোনো কুপন ছাড়া মার্জিত ও বিশেষ ডাইনিং অভিজ্ঞতার আমন্ত্রণ।',
          text: `Greetings from Mother's Hut!\nপ্রিয় {customer_name}, এই সপ্তাহে আমাদের শেফ আপনার পছন্দের {top_food_category} এবং {most_ordered_dish} বিশেষ যত্নে তৈরি করছেন। পরিবার ও প্রিয়জনদের নিয়ে আমাদের আতিথেয়তা উপভোগ করতে আমন্ত্রিত। যোগাযোগ: ${HELPLINE_NUMBER}।`,
        },
      ],
    },
  },
  2: {
    id: 2,
    name: 'Family Visitors',
    subtitle: 'Family groups & weekend celebration diners',
    color: '#d97706',
    templates: {
      en: [
        {
          badge: "Kids' Treat Free",
          coupon: 'MHKIDSFREE',
          title: 'Message 1 – Weekend Family Feast',
          note: "Encourages weekend family visits with complimentary kids' desserts.",
          text: `Greetings from Mother's Hut!\nHi {customer_name}, bring your family of {avg_group_size} this weekend for our Grand {top_food_category} Feast. Claim coupon code MHKIDSFREE at your table for complimentary kids' ice cream & treats! For any query, contact us at ${HELPLINE_NUMBER}.`,
        },
        {
          badge: '15% Family Combo',
          coupon: 'MHFAM15',
          title: 'Message 2 – Family Dining Bundle',
          note: 'Provides 15% savings on family table platters for group outings.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, make your next family {preferred_meal_time} memorable with us. Use coupon code MHFAM15 to get 15% OFF on our curated {most_ordered_dish} family platter. For any query, contact us at ${HELPLINE_NUMBER}.`,
        },
      ],
      bn: [
        {
          badge: 'কিডস ট্রিট ফ্রি',
          coupon: 'MHKIDSFREE',
          title: 'বার্তা ১ – উইকেন্ড ফ্যামিলি ফিস্ট',
          note: 'সপ্তাহান্তে পরিবার নিয়ে এলে বাচ্চাদের জন্য থাকছে ফ্রি আইসক্রিম ও ট্রিট।',
          text: `Greetings from Mother's Hut!\nনমস্কার {customer_name}, এই উইকেন্ডে পরিবারের সবাইকে ({avg_group_size} জন) নিয়ে চলে আসুন। আমাদের স্পেশাল {top_food_category} ফিস্টের সাথে কুপন কোড MHKIDSFREE দেখালেই বাচ্চাদের আইসক্রিম ও ট্রিট একদম ফ্রি! যেকোনো প্রয়োজনে আমাদের ${HELPLINE_NUMBER} নম্বরে যোগাযোগ করুন।`,
        },
        {
          badge: '১৫% ফ্যামিলি সেভার',
          coupon: 'MHFAM15',
          title: 'বার্তা ২ – ফ্যামিলি ডাইনিং প্ল্যাটার',
          note: 'ফ্যামিলি প্ল্যাটার বুকিংয়ে ১৫% ছাড়ের সহজ অফার।',
          text: `Greetings from Mother's Hut!\nপ্রিয় {customer_name}, পরিবারের সাথে আপনার পরবর্তী {preferred_meal_time} আনন্দময় করতে চলে আসুন! কুপন কোড MHFAM15 ব্যবহার করলে {most_ordered_dish} ফ্যামিলি প্ল্যাটারে পাচ্ছেন ১৫% ছাড়। যেকোনো প্রয়োজনে আমাদের ${HELPLINE_NUMBER} নম্বরে যোগাযোগ করুন।`,
        },
      ],
    },
  },
  3: {
    id: 3,
    name: 'Coupon Grabbers',
    subtitle: 'Guests who love combo savings & flash deals',
    color: '#7c3aed',
    templates: {
      en: [
        {
          badge: 'Flat ₹75 Off',
          coupon: 'MHSAVE75',
          title: 'Message 1 – Special Combo Discount',
          note: 'Direct ₹75 instant savings on their most ordered combo dish.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, enjoy a special treat—use coupon code MHSAVE75 to get Flat ₹75 OFF on your favorite {most_ordered_dish} combo this week. For any query, contact us at ${HELPLINE_NUMBER}.`,
        },
        {
          badge: '20% Weekday Saver',
          coupon: 'MHWEEK20',
          title: 'Message 2 – Weekday Dining Offer',
          note: 'Drives weekday traffic with a simple 20% discount code.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, craving {top_food_category}? Visit us on weekdays and apply coupon code MHWEEK20 to get an instant 20% OFF on your bill! For any query, contact us at ${HELPLINE_NUMBER}.`,
        },
      ],
      bn: [
        {
          badge: 'ফ্ল্যাট ₹৭৫ ছাড়',
          coupon: 'MHSAVE75',
          title: 'বার্তা ১ – স্পেশাল কম্বো ডিসকাউন্ট',
          note: 'পছন্দের কম্বো অর্ডারে সরাসরি ₹৭৫ ছাড়ের কুপন অফার।',
          text: `Greetings from Mother's Hut!\nহ্যালো {customer_name}, দারুণ অফার—এই সপ্তাহে আপনার পছন্দের {most_ordered_dish} কম্বোতে কুপন কোড MHSAVE75 ব্যবহার করে পান ফ্ল্যাট ₹৭৫ ছাড়! যেকোনো প্রয়োজনে আমাদের ${HELPLINE_NUMBER} নম্বরে যোগাযোগ করুন।`,
        },
        {
          badge: 'উইকডে ২০% ছাড়',
          coupon: 'MHWEEK20',
          title: 'বার্তা ২ – উইকডে সেভার অফার',
          note: 'সপ্তাহের কর্মদিবসে বিলের ওপর ২০% ছাড়ের সহজ ডিল।',
          text: `Greetings from Mother's Hut!\nনমস্কার {customer_name}, {top_food_category} খেতে ইচ্ছে করছে? সপ্তাহের যেকোনো কর্মদিবসে এসে কুপন কোড MHWEEK20 ব্যবহার করলে বিলের ওপর পাচ্ছেন ২০% ছাড়! যেকোনো প্রয়োজনে আমাদের ${HELPLINE_NUMBER} নম্বরে যোগাযোগ করুন।`,
        },
      ],
    },
  },
};

export function cleanLabel(str: string | null | undefined): string {
  return String(str || '').replace(/_/g, ' ');
}

export function formatPhone(raw: string | null | undefined): string {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : raw || 'N/A';
}

export function formatINR(v: number | string | null | undefined): string {
  return '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN');
}

export function getInitials(name: string | null | undefined): string {
  return (name || 'G')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export function applyPlaceholders(template: string, c: CustomerRecord, lang: 'en' | 'bn' = 'en'): string {
  const rawMeal = cleanLabel(c.preferred_meal_time || 'Dinner');
  const rawCat = c.top_food_category || 'Signature Food';
  const mealText = lang === 'bn' ? BN_MEAL_MAP[rawMeal] || rawMeal : rawMeal;
  const catText = lang === 'bn' ? BN_CATEGORY_MAP[rawCat] || rawCat : rawCat;
  const dishText = c.most_ordered_dish && c.most_ordered_dish.trim() ? c.most_ordered_dish : 'our house specials';

  return template
    .replaceAll('{customer_name}', c.customer_name || 'Guest')
    .replaceAll('{customer_id}', c.customer_id || '')
    .replaceAll('{total_visits}', String(c.total_visits))
    .replaceAll('{most_ordered_dish}', dishText)
    .replaceAll('{top_food_category}', catText)
    .replaceAll('{preferred_order_channel}', cleanLabel(c.preferred_order_channel || 'Dine-In'))
    .replaceAll('{preferred_meal_time}', mealText)
    .replaceAll('{preferred_day_type}', c.preferred_day_type || 'Weekend')
    .replaceAll('{avg_group_size}', String(c.avg_group_size || 2))
    .replaceAll('{phone_no}', HELPLINE_NUMBER);
}

export function getRealisticOffer(c: CustomerRecord): {
  coupon: string | null;
  offerTitle: string;
  reason: string;
  messageEn: string;
  messageBn: string;
} {
  const name = c.customer_name || 'Guest';
  const dish = c.most_ordered_dish && c.most_ordered_dish.trim() ? c.most_ordered_dish : "Chef's Special";
  const cat = c.top_food_category || 'Signature';
  const meal = cleanLabel(c.preferred_meal_time || 'Dinner');
  const channel = cleanLabel(c.preferred_order_channel || 'Dine-In');
  const bnCat = BN_CATEGORY_MAP[cat] || cat;
  const bnMeal = BN_MEAL_MAP[meal] || meal;

  const prefixEn = `Greetings from Mother's Hut!\nHi ${name}, `;
  const prefixBn = `Greetings from Mother's Hut!\nনমস্কার ${name}, `;
  const reason = `${c.cluster_name} guest with ${c.total_visits} visits (avg ${formatINR(
    c.avg_spend_per_visit_inr
  )}/visit), ordered ${cat} ${c.top_food_orders}/${c.total_visits} times, and last visited ${c.days_since_last_visit} days ago.`;

  // Premium Customers (cluster_id === 1): Standard hospitality only — NO offers or coupons
  if (c.cluster_id === 1) {
    const offerTitle = `Priority ${meal} Table & Signature ${dish} Hospitality`;
    const messageEn = `${prefixEn}We have missed hosting you. Your preferred ${meal} table and our freshly prepared ${dish} (${cat}) await you on your next visit. For priority table reservations, call us at ${HELPLINE_NUMBER}.`;
    const messageBn = `${prefixBn}অনেকদিন আপনাকে আমাদের রেস্তোরাঁয় দেখিনি। আপনার পরবর্তী ${bnMeal} ভিজিটে পছন্দের ${dish} (${bnCat}) এবং প্রাইয়োরিটি টেবিল প্রস্তুত থাকবে। রিজার্ভেশনের জন্য ${HELPLINE_NUMBER} নম্বরে যোগাযোগ করুন।`;
    return { coupon: null, offerTitle, reason, messageEn, messageBn };
  }

  let coupon = 'MHMISS20';
  let offerTitle = '';
  let offerShortEn = '';
  let offerShortBn = '';

  if (c.cluster_id === 2) {
    coupon = 'MHFAM20';
    offerTitle = `20% Off Family ${cat} Feast + Free Kids' Treat with ${dish}`;
    offerShortEn = `20% OFF on our Family ${cat} Feast along with complimentary kids' treats on ${dish}`;
    offerShortBn = `ফ্যামিলি ${bnCat} ফিস্টে ২০% ছাড় এবং ${dish}-এর সাথে বাচ্চাদের জন্য ফ্রি ট্রিট`;
  } else if (c.cluster_id === 3) {
    coupon = 'MHBACK100';
    offerTitle = `Flat ₹100 Off on ${dish} & ${cat} Combo`;
    offerShortEn = `Flat ₹100 OFF on your favorite ${dish} & ${cat} combo`;
    offerShortBn = `আপনার পছন্দের ${dish} এবং ${bnCat} কম্বোতে ফ্ল্যাট ₹১০০ ছাড়`;
  } else {
    coupon = 'MHMISS20';
    offerTitle = `Exclusive 20% Off on ${dish} (${cat} Combo)`;
    offerShortEn = `an exclusive 20% OFF on your favorite ${dish} (${cat} Combo)`;
    offerShortBn = `আপনার প্রিয় ${dish} (${bnCat} কম্বো)-এ বিশেষ ২০% ছাড়`;
  }

  const messageEn = `${prefixEn}We've missed seeing you! Since you enjoy ${dish}, use coupon code ${coupon} to claim ${offerShortEn} on your next ${meal} (${channel}). For any query, contact us at ${HELPLINE_NUMBER}.`;
  const messageBn = `${prefixBn}অনেকদিন আপনাকে আমাদের রেস্তোরাঁয় দেখিনি! আপনার পছন্দের ${dish}-এর কথা মাথায় রেখে, পরবর্তী ${bnMeal}-এ কুপন কোড ${coupon} ব্যবহার করলে পাচ্ছেন ${offerShortBn}। যেকোনো প্রয়োজনে আমাদের ${HELPLINE_NUMBER} নম্বরে যোগাযোগ করুন।`;

  return { coupon, offerTitle, reason, messageEn, messageBn };
}
