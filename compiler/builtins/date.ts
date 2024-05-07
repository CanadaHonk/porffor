// @porf -funsafe-no-unlikely-proto-checks

export const __Date_now = (): number => Math.trunc(performance.timeOrigin + performance.now());

export const Date = (): bytestring => {
  // todo
};

export const Date$constructor = (): Date => __Date_now();