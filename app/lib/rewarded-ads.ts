import { ENV } from "@/constants/env";

let adsModuleCache: any | null | undefined;

function getAdsModule() {
  if (adsModuleCache !== undefined) return adsModuleCache;
  try {
    adsModuleCache = require("react-native-google-mobile-ads");
  } catch {
    adsModuleCache = null;
  }
  return adsModuleCache;
}

function getRewardedUnitId() {
  const ads = getAdsModule();
  return ENV.ads.rewardedUnitId || ads?.TestIds?.REWARDED || "test-rewarded";
}

export async function showRewardedUnlockAd(): Promise<{ rewarded: boolean; amount?: number; type?: string }> {
  const ads = getAdsModule();
  if (!ads) {
    return { rewarded: false };
  }

  const AdEventType = ads.AdEventType;
  const RewardedAd = ads.RewardedAd;
  const RewardedAdEventType = ads.RewardedAdEventType;
  if (!AdEventType || !RewardedAd || !RewardedAdEventType) {
    return { rewarded: false };
  }

  const unitId = getRewardedUnitId();
  const rewarded = RewardedAd.createForAdRequest(unitId, {
    requestNonPersonalizedAdsOnly: true,
  });

  return await new Promise((resolve, reject) => {
    let resolved = false;
    let rewardPayload: { rewarded: boolean; amount?: number; type?: string } = { rewarded: false };

    const cleanup = () => {
      unsubscribeLoaded();
      unsubscribeEarned();
      unsubscribeClosed();
      unsubscribeError();
    };

    const finalize = (payload: { rewarded: boolean; amount?: number; type?: string }) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(payload);
    };

    const unsubscribeLoaded = rewarded.addAdEventListener(AdEventType.LOADED, () => {
      rewarded.show().catch((error) => {
        if (resolved) return;
        cleanup();
        reject(error);
      });
    });

    const unsubscribeEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
      rewardPayload = {
        rewarded: true,
        amount: reward.amount,
        type: reward.type,
      };
    });

    const unsubscribeClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      finalize(rewardPayload);
    });

    const unsubscribeError = rewarded.addAdEventListener(AdEventType.ERROR, (error) => {
      if (resolved) return;
      cleanup();
      reject(error);
    });

    rewarded.load();
  });
}