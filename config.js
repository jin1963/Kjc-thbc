// config.js - THBC → KJC Auto Stake (เวอร์ชันใช้กับ THBCtoKJCStake จริงบน BSC)

// --- Chain ---
const CHAIN_ID = 56; // BNB Smart Chain mainnet

// --- THBC token (18 decimals) ---
const THBC_ADDRESS = "0xe8d4687b77B5611eF1828FDa7428034FA12a1Beb";

// --- THBCtoKJCStake contract ---
const STAKE_CONTRACT_ADDRESS = "0xc715253f8De35707Bd69bBE065FA561778cfA094";

// --- Minimal ERC20 ABI (สำหรับ THBC) ---
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

// --- THBCtoKJCStake ABI (ย่อให้เหลือเฉพาะที่ DApp ใช้จริง) ---
const STAKE_ABI = [
  // ข้อมูล config
  "function rateKjcPerThbc() view returns (uint256)",   // อัตรา KJC ต่อ 1 THBC (มี 18 decimals)
  "function apyBps() view returns (uint256)",           // APY เป็น basis points เช่น 1500 = 15%
  "function lockDuration() view returns (uint256)",     // วินาทีที่ล็อก เช่น 365 วัน

  // ฟังก์ชัน swap + auto stake หลัก
  "function swapAndStake(uint256 thbcAmount) external",

  // อ่านข้อมูล stake ของ user
  "function getStakeCount(address user) view returns (uint256)",
  "function getStake(address user, uint256 index) view returns (uint256 principal, uint256 reward, uint256 startTime, bool claimed)",

  // reward รวมทั้งหมด (ทุก stake) ของ user
  "function pendingRewardAll(address user) view returns (uint256 totalReward)",

  // claim รางวัล (และ principal) หลังครบกำหนด
  "function claim(uint256 index) external",
  "function claimAll() external",

  // ใช้เช็ค owner ถ้าทำหน้า admin ในอนาคต
  "function owner() view returns (address)"
];

// export config ไว้ใช้ใน app.js
window.THBC_KJC_CONFIG = {
  chainId: CHAIN_ID,
  thbc: {
    address: THBC_ADDRESS,
    abi: ERC20_ABI
  },
  stake: {
    address: STAKE_CONTRACT_ADDRESS,
    abi: STAKE_ABI
  }
};
