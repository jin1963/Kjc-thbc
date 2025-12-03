// config.js - THBC → KJC Auto Stake (BSC)

// ---------------- BASIC CHAIN CONFIG ----------------
const CHAIN_ID = 56; // BNB Smart Chain mainnet
const BSC_RPC = "https://bsc-dataseed.binance.org/";

// THBC token (BEP-20, 18 decimals)
const THBC_ADDRESS = "0xe8d4687b77B5611eF1828FDa7428034FA12a1Beb";

// THBCtoKJCStake contract
const STAKE_CONTRACT_ADDRESS = "0xc715253f8De35707Bd69bBE065FA561778cfA094";

// ---------------- ERC20 ABI (ย่อ) ----------------
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

// ---------------- Stake Contract ABI (ย่อให้ตรงของจริง) -------------
const STAKE_ABI = [
  "function rateKjcPerThbc() view returns (uint256)",
  "function apyBps() view returns (uint256)",
  "function lockDuration() view returns (uint256)",

  // swap & stake
  "function swapAndStake(uint256 thbcAmount) external",

  // อ่านจำนวน stake และรายละเอียด stake ตาม index
  "function getStakeCount(address user) view returns (uint256)",
  "function getStake(address user, uint256 index) view returns (uint256 principal, uint256 reward, uint256 startTime, bool claimed)",

  // อ่าน reward ตอนนี้
  "function pendingReward(address user, uint256 index) view returns (uint256)",

  // ใช้คำนวณ payout ทั้ง principal+reward (ในสัญญามีฟังก์ชันนี้)
  "function pendingPayout(address user, uint256 index) view returns (uint256)"
];

// ---------------- GLOBAL CONFIG OBJECT ----------------
window.THBC_KJC_CONFIG = {
  chainId: CHAIN_ID,
  rpcUrl: BSC_RPC,
  thbc: {
    address: THBC_ADDRESS,
    abi: ERC20_ABI
  },
  stake: {
    address: STAKE_CONTRACT_ADDRESS,
    abi: STAKE_ABI
  }
};
