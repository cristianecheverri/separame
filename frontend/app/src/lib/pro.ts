/** Data every pro screen needs, available once the route guard loaded /me with a profile. */
import type { MeResponse } from '@shared/api';
import type { ProProfile, SubscriptionStatus } from '@shared/types';
import { minPackageAmount, monthlyAmount } from './plans';
import { useBilling, useMe } from './queries';

export interface ProData {
  me: MeResponse;
  profile: ProProfile;
  subscription: SubscriptionStatus | null;
  readOnly: boolean;
  publicUrl: string;
}

export function usePro(): ProData {
  const { data } = useMe();
  if (!data?.profile) throw new Error('usePro() outside the pro guard');
  return {
    me: data,
    profile: data.profile,
    subscription: data.subscription,
    readOnly: !!data.subscription?.readOnly,
    publicUrl: data.publicUrl ?? '',
  };
}

/** Headline prices of the pro's price version ("desde $5.000/mes", "Renovar desde $15.000"), team included. */
export function usePriceHeadline() {
  const { data } = useBilling();
  const seats = data?.teamSeats ?? 0;
  return {
    price: data?.price ?? null,
    monthlyCop: monthlyAmount(data?.price, seats),
    minPackageCop: minPackageAmount(data?.price, seats),
  };
}
