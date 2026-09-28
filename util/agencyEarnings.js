const buildAgencyEarningUpdate = (commission, hostCoin) => {
  const inc = {};
  const commissionAmount = Math.abs(Number(commission) || 0);
  const hostCoinAmount = Math.abs(Number(hostCoin) || 0);

  // All agency earning fields use $inc only — values accumulate, never reset.
  if (commissionAmount > 0) {
    inc.hostCoins = hostCoinAmount;
    inc.totalEarnings = commissionAmount;
    inc.netAvailableEarnings = commissionAmount;
  }

  return Object.keys(inc).length > 0 ? { $inc: inc } : null;
};

const buildAgencyWithdrawalUpdate = (coin, amount) => ({
  $inc: {
    totalWithdrawn: coin,
    totalWithdrawnAmount: amount,
    netAvailableEarnings: -coin,
  },
});

module.exports = {
  buildAgencyEarningUpdate,
  buildAgencyWithdrawalUpdate,
};
