// config.js - THBC → KJC Auto Stake

// BNB Smart Chain
const CHAIN_ID = 56;

// THBC token (BEP-20, 18 decimals)
const THBC_ADDRESS = "0xe8d4687b77B5611eF1828FDa7428034FA12a1Beb";

// KJC token ใช้แค่เดาซะว่า 18 decimals ไม่จำเป็นต้องรู้ address ใน DApp ตัวนี้
// ถ้าอยากแสดง balance KJC ในอนาคต ค่อยเพิ่ม address + ABI ได้

// THBCtoKJCStake contract
const STAKE_CONTRACT_ADDRESS = "0xc715253f8De35707Bd69bBE065FA561778cfA094";

// --- ERC20 ABI (ย่อ) ---
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

// --- THBCtoKJCStake ABI (ต้องให้ตรงกับบน BscScan ---
// ถ้าบน BscScan ชื่อฟังก์ชันไม่ตรง แก้ string ด้านล่างให้ตรงได้เลย
const STAKE_ABI = [
  "function rateKjcPerThbc() view returns (uint256)",
  "function apyBps() view returns (uint256)",
  "function lockDuration() view returns (uint256)",

  // ฟังก์ชัน swap+stake หลัก
  "function stakeWithTHBC(uint256 thbcAmount) external",

  // เคลมหลังครบกำหนด
  "function claim() external",

  // ข้อมูลของผู้ใช้ 1 คน
  // struct Position {
  //   uint256 thbcSpent;
  //   uint256 kjcStaked;
  //   uint256 rewardKjc;
  //   uint256 startTime;
  //   uint256 unlockTime;
  //   bool claimed;
  // }
  "function positions(address user) view returns (uint256 thbcSpent, uint256 kjcStaked, uint256 rewardKjc, uint256 startTime, uint256 unlockTime, bool claimed)"
];

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
