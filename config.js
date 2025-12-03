// config.js - THBC → KJC Auto Stake (BSC mainnet)

// --------- NETWORK SETTINGS ----------
const CHAIN_ID = 56; // BNB Smart Chain mainnet
const BSC_RPC_URL = "https://bsc-dataseed.binance.org/";

// --------- TOKEN & CONTRACT ----------
const THBC_ADDRESS = "0xe8d4687b77B5611eF1828FDa7428034FA12a1Beb";
const STAKE_CONTRACT_ADDRESS = "0xc715253f8De35707Bd69bBE065FA561778cfA094";

// ใช้ 18 ทศนิยมทั้ง THBC และ KJC
const TOKEN_DECIMALS = 18;

// --- ERC20 ABI (ย่อ) ---
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

// --- THBCtoKJCStake ABI (ตรงกับที่คุณส่งมา) ---
const STAKE_ABI = [
  "function rateKjcPerThbc() view returns (uint256)",
  "function apyBps() view returns (uint256)",
  "function lockDuration() view returns (uint256)",

  "function swapAndStake(uint256 thbcAmount) external",
  "function claim(uint256 index) external",
  "function claimAll() external",

  "function getStake(address user, uint256 index) view returns (uint256 principal, uint256 reward, uint256 startTime, bool claimed)",
  "function getStakeCount(address user) view returns (uint256)",
  "function pendingRewardAll(address user) view returns (uint256)",

  "function thbc() view returns (address)",
  "function kjc() view returns (address)"
];

window.THBC_KJC_CONFIG = {
  chainId: CHAIN_ID,
  rpcUrl: BSC_RPC_URL,
  tokenDecimals: TOKEN_DECIMALS,
  thbc: {
    address: THBC_ADDRESS,
    abi: ERC20_ABI
  },
  stake: {
    address: STAKE_CONTRACT_ADDRESS,
    abi: STAKE_ABI
  }
};
