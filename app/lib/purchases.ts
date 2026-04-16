import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";

import { ENV } from "@/constants/env";

const CUSTOMER_INFO_CACHE_KEY = "nexora_customer_info_cache_v1";

let purchasesConfigured = false;
let purchasesModuleCache: any | null | undefined;

function getPurchasesModule() {
  if (purchasesModuleCache !== undefined) return purchasesModuleCache;
  try {
    const mod = require("react-native-purchases");
    purchasesModuleCache = mod?.default || mod;
  } catch {
    purchasesModuleCache = null;
  }
  return purchasesModuleCache;
}

function isUsablePurchasesModule(Purchases: any) {
  if (!Purchases) return false;
  return (
    typeof Purchases.configure === "function" &&
    typeof Purchases.getCustomerInfo === "function"
  );
}

function getRevenueCatApiKey() {
  return Platform.OS === "ios"
    ? ENV.purchases.iosApiKey
    : ENV.purchases.androidApiKey;
}

export function isPurchasesConfigured() {
  return Boolean(getRevenueCatApiKey());
}

/** Returns true only after the SDK has been successfully initialised. */
export function isPurchasesReady() {
  return purchasesConfigured;
}

export async function configurePurchases(appUserId?: string | null) {
  const Purchases = getPurchasesModule();
  const apiKey = getRevenueCatApiKey();
  if (!apiKey || purchasesConfigured || !isUsablePurchasesModule(Purchases)) return;

  if (Purchases.LOG_LEVEL?.WARN != null && typeof Purchases.setLogLevel === "function") {
    Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN);
  }
  try {
    await Purchases.configure({ apiKey, appUserID: appUserId || undefined });
    purchasesConfigured = true;
  } catch {
    purchasesConfigured = false;
  }
}

export async function identifyPurchasesUser(appUserId?: string | null) {
  const Purchases = getPurchasesModule();
  if (!isUsablePurchasesModule(Purchases)) return;
  if (!isPurchasesConfigured()) return;
  await configurePurchases(appUserId);
  if (!appUserId || typeof Purchases.logIn !== "function") return;
  await Purchases.logIn(appUserId).catch(() => undefined);
}

export async function getCachedCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOMER_INFO_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function cacheCustomerInfo(info: CustomerInfo | null) {
  try {
    if (!info) {
      await AsyncStorage.removeItem(CUSTOMER_INFO_CACHE_KEY);
      return;
    }
    await AsyncStorage.setItem(CUSTOMER_INFO_CACHE_KEY, JSON.stringify(info));
  } catch {
    // non-fatal cache write
  }
}

export async function fetchCustomerInfo(): Promise<CustomerInfo | null> {
  const Purchases = getPurchasesModule();
  if (!isUsablePurchasesModule(Purchases)) {
    return await getCachedCustomerInfo();
  }
  if (!isPurchasesConfigured()) {
    return await getCachedCustomerInfo();
  }

  try {
    const info = await Purchases.getCustomerInfo();
    await cacheCustomerInfo(info);
    return info;
  } catch {
    return await getCachedCustomerInfo();
  }
}

export function hasPremiumEntitlement(customerInfo: CustomerInfo | null) {
  if (!customerInfo) return false;
  const entitlement = customerInfo.entitlements.active[ENV.purchases.entitlementId];
  return Boolean(entitlement);
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  const Purchases = getPurchasesModule();
  if (!isUsablePurchasesModule(Purchases)) return null;
  if (!isPurchasesConfigured()) return null;
  await configurePurchases();
  if (!purchasesConfigured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current || null;
  } catch {
    return null;
  }
}

function pickPackageFromOffering(offering: PurchasesOffering | null, plan: "weekly" | "monthly" | "yearly") {
  if (!offering) return null;
  if (plan === "weekly") return offering.weekly || null;
  if (plan === "monthly") return offering.monthly || null;
  return offering.annual || null;
}

export async function purchasePremiumPlan(plan: "weekly" | "monthly" | "yearly") {
  const Purchases = getPurchasesModule();
  if (!isUsablePurchasesModule(Purchases)) {
    throw new Error("Purchases module is unavailable in this app build.");
  }
  if (!isPurchasesConfigured()) {
    throw new Error("Purchases are not configured.");
  }
  await configurePurchases();
  if (!purchasesConfigured) {
    throw new Error("Purchases SDK could not be initialised.");
  }

  const offering = await getCurrentOffering();
  const selectedPackage: PurchasesPackage | null = pickPackageFromOffering(offering, plan);
  if (!selectedPackage) {
    throw new Error("Selected purchase plan is not available in the current offering.");
  }

  const result = await Purchases.purchasePackage(selectedPackage);
  await cacheCustomerInfo(result.customerInfo);
  return result.customerInfo;
}

export async function restorePremiumPurchases() {
  const Purchases = getPurchasesModule();
  if (!isUsablePurchasesModule(Purchases)) {
    throw new Error("Purchases module is unavailable in this app build.");
  }
  if (!isPurchasesConfigured()) {
    throw new Error("Purchases are not configured.");
  }
  await configurePurchases();
  if (!purchasesConfigured) {
    throw new Error("Purchases SDK could not be initialised.");
  }

  const info = await Purchases.restorePurchases();
  await cacheCustomerInfo(info);
  return info;
}

export async function logoutPurchasesUser() {
  const Purchases = getPurchasesModule();
  if (!isUsablePurchasesModule(Purchases)) return;
  if (!isPurchasesConfigured()) return;
  if (typeof Purchases.logOut === "function") {
    await Purchases.logOut().catch(() => undefined);
  }
  await cacheCustomerInfo(null);
}

export function isPurchaseCancelled(error: unknown) {
  const Purchases = getPurchasesModule();
  const cancelledCode = Number(Purchases?.PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR);
  const code = Number((error as any)?.code);
  return Number.isFinite(cancelledCode) ? code === cancelledCode : false;
}