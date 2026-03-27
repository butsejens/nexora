import {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from "react-native-google-mobile-ads";

import { ENV } from "@/constants/env";

function getRewardedUnitId() {
  return ENV.ads.rewardedUnitId || TestIds.REWARDED;
}

export async function showRewardedUnlockAd(): Promise<{ rewarded: boolean; amount?: number; type?: string }> {
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