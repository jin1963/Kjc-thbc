// thbc-kjc.js
// THBC → KJC Auto-Stake DApp (ethers.js v5)

// ================== GLOBAL STATE ==================

let injected;          // raw injected provider (MetaMask / Binance / Bitget)
let provider;          // ethers provider
let signer;            // ethers signer
let currentAccount;    // connected address

let thbcContract;      // IERC20 THBC
let stakeContract;     // THBCtoKJCStake

let thbcDecimals = 18;           // will be fetched on-chain
let rateKjcPerThbcBN = null;     // BigNumber
let apyBpsBN = null;             // BigNumber
let lockDurationBN = null;       // BigNumber

const ZERO = ethers.constants.Zero;

// ================== DOM HELPERS ==================

function $(id) {
  return document.getElementById(id);
}

function setText(id, txt) {
  const el = $(id);
  if (el) el.textContent = txt;
}

function setMsg(elOrId, text, type) {
  const el = typeof elOrId === "string" ? $(elOrId) : elOrId;
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("success", "error");
  if (type) el.classList.add(type); // type: "success" | "error"
}

// ================== WALLET DETECTION ==================

function getInjectedProvider() {
  // ส่วนใหญ่: MetaMask, Bitget, Trust, OKX ฯลฯ
  if (window.ethereum) return window.ethereum;

  // Binance Wallet (บางเวอร์ชัน)
  if (window.BinanceChain) return window.BinanceChain;

  // BitKeep / Bitget แบบ SDK เก่า
  if (window.bitkeep && window.bitkeep.ethereum) return window.bitkeep.ethereum;
  if (window.bitget && window.bitget.ethereum) return window.bitget.ethereum;

  return null;
}

// ================== INIT ==================

async function init() {
  injected = getInjectedProvider();

  if (!injected) {
    console.warn("No injected wallet found (MetaMask / Binance / Bitget).");
  }

  // event listeners
  if ($("btnConnect")) $("btnConnect").onclick = connectWallet;
  if ($("btnApprove")) $("btnApprove").onclick = onApprove;
  if ($("btnStake")) $("btnStake").onclick = onStake;
  if ($("btnClaim")) $("btnClaim").onclick = onClaim;

  if ($("thbcAmount")) {
    $("thbcAmount").addEventListener("input", updatePreview);
  }

  // preview ค่าเริ่มต้น
  updatePreview();
}

window.addEventListener("load", init);

// ================== CONNECT WALLET ==================

async function connectWallet() {
  try {
    injected = getInjectedProvider();
    if (!injected) {
      alert("ไม่พบ Wallet (MetaMask / Binance / Bitget) ในเบราว์เซอร์นี้");
      return;
    }

    let accounts;

    // รองรับทั้งมาตรฐาน EIP-1193 (.request) และ .enable แบบเก่า
    if (injected.request) {
      accounts = await injected.request({ method: "eth_requestAccounts" });
    } else if (injected.enable) {
      accounts = await injected.enable();
    } else {
      alert("Wallet นี้ไม่รองรับการเชื่อมต่อแบบมาตรฐาน");
      return;
    }

    if (!accounts || !accounts.length) {
      alert("ไม่พบบัญชีใน Wallet");
      return;
    }

    currentAccount = accounts[0];

    provider = new ethers.providers.Web3Provider(injected, "any");
    signer = provider.getSigner();

    const net = await provider.getNetwork();
    const targetChainId = window.THBC_KJC_CONFIG?.chainId || 56;
    if (net.chainId !== targetChainId) {
      alert("กรุณาเลือก BNB Smart Chain (chainId 56) ใน Wallet ก่อน");
    }

    await initContracts();
    await loadOnchainParams();
    await refreshPosition();

    // อัปเดตปุ่ม connect
    if ($("btnConnect")) {
      const short =
        currentAccount.slice(0, 6) +
        "..." +
        currentAccount.slice(currentAccount.length - 4);
      $("btnConnect").textContent = short;
    }

    // โชว์ address ใน Your Position
    setText("addrShort", shortAddress(currentAccount));

    // auto refresh เมื่อเปลี่ยนบัญชี/เน็ตเวิร์ก
    if (injected && injected.on) {
      injected.on("accountsChanged", () => window.location.reload());
      injected.on("chainChanged", () => window.location.reload());
    }
  } catch (err) {
    console.error("connectWallet error:", err);
    alert("เชื่อมต่อกระเป๋าไม่สำเร็จ: " + (err.message || err));
  }
}

// ================== CONTRACT SETUP ==================

async function initContracts() {
  const cfg = window.THBC_KJC_CONFIG;
  if (!cfg) {
    console.error("THBC_KJC_CONFIG not found");
    return;
  }

  if (!signer) {
    provider = new ethers.providers.Web3Provider(getInjectedProvider(), "any");
    signer = provider.getSigner();
  }

  if (!thbcContract) {
    thbcContract = new ethers.Contract(cfg.thbc.address, cfg.thbc.abi, signer);
  }
  if (!stakeContract) {
    stakeContract = new ethers.Contract(
      cfg.stake.address,
      cfg.stake.abi,
      signer
    );
  }
}

// อ่านค่าบน chain: rate, apy, lockDuration, decimals
async function loadOnchainParams() {
  try {
    if (!thbcContract || !stakeContract) await initContracts();

    // decimals ของ THBC
    try {
      thbcDecimals = await thbcContract.decimals();
    } catch {
      thbcDecimals = 18;
    }

    // rate (KJC per THBC) เป็น BigNumber 18 decimals
    rateKjcPerThbcBN = await stakeContract.rateKjcPerThbc();
    apyBpsBN = await stakeContract.apyBps(); // basis points, เช่น 1500 = 15%
    lockDurationBN = await stakeContract.lockDuration(); // seconds

    // แสดงบน UI
    const rateFloat = parseFloat(
      ethers.utils.formatUnits(rateKjcPerThbcBN, 18)
    );
    setText("rateText", `1 THBC = ${rateFloat.toFixed(4)} KJC`);

    const apyBpsNum = apyBpsBN.toNumber();
    const apyPercent = apyBpsNum / 100.0;
    setText("apyText", `${apyPercent.toFixed(2)} %`);

    const lockSec = lockDurationBN.toNumber();
    const lockDays = lockSec / 86400;
    setText("lockText", `${lockDays} days`);

    // อัปเดต preview
    updatePreview();
  } catch (err) {
    console.error("loadOnchainParams error:", err);
  }
}

// ================== PREVIEW CALC ==================

function shortAddress(addr) {
  if (!addr) return "–";
  return addr.slice(0, 6) + "..." + addr.slice(addr.length - 4);
}

function updatePreview() {
  const amtStr = $("thbcAmount")?.value || "0";
  const amount = parseFloat(amtStr) || 0;

  if (!rateKjcPerThbcBN || !apyBpsBN) {
    // ยังไม่ได้โหลดค่าจาก chain
    setText("kjcOut", "0");
    setText("kjcReward", "0");
    setText("kjcTotal", "0");
    return;
  }

  if (amount <= 0) {
    setText("kjcOut", "0");
    setText("kjcReward", "0");
    setText("kjcTotal", "0");
    return;
  }

  try {
    const amtWei = ethers.utils.parseUnits(
      amtStr || "0",
      thbcDecimals || 18
    );

    // KJC principal = THBC * rateKjcPerThbc / 1e18
    const principalBN = amtWei.mul(rateKjcPerThbcBN).div(
      ethers.constants.WeiPerEther
    );

    const apyBpsNum = apyBpsBN.toNumber();
    const rewardBN = principalBN.mul(apyBpsNum).div(10000);

    const totalBN = principalBN.add(rewardBN);

    const principal = parseFloat(ethers.utils.formatUnits(principalBN, 18));
    const reward = parseFloat(ethers.utils.formatUnits(rewardBN, 18));
    const total = parseFloat(ethers.utils.formatUnits(totalBN, 18));

    setText("kjcOut", principal.toFixed(4));
    setText("kjcReward", reward.toFixed(4));
    setText("kjcTotal", total.toFixed(4));
  } catch (err) {
    console.error("updatePreview parse error:", err);
    setText("kjcOut", "0");
    setText("kjcReward", "0");
    setText("kjcTotal", "0");
  }
}

// ================== APPROVE THBC ==================

async function onApprove() {
  const msgEl = $("txMessage");
  setMsg(msgEl, "", null);

  try {
    if (!signer || !currentAccount) {
      await connectWallet();
      if (!signer) return;
    }
    await initContracts();

    const amtStr = $("thbcAmount")?.value || "0";
    const amount = parseFloat(amtStr) || 0;
    if (amount <= 0) {
      alert("กรุณาใส่จำนวน THBC ที่ต้องการใช้ stake ก่อน");
      return;
    }

    const needWei = ethers.utils.parseUnits(
      amtStr,
      thbcDecimals || 18
    );

    const cfg = window.THBC_KJC_CONFIG;
    const currentAllowance = await thbcContract.allowance(
      currentAccount,
      cfg.stake.address
    );

    if (currentAllowance.gte(needWei)) {
      setMsg(msgEl, "คุณได้ Approve THBC เพียงพอแล้ว", "success");
      $("btnApprove").textContent = "Approved ✓";
      return;
    }

    setMsg(msgEl, "Sending approve transaction...", null);

    const tx = await thbcContract.approve(
      cfg.stake.address,
      ethers.constants.MaxUint256
    );
    await tx.wait();

    setMsg(msgEl, "Unlimited THBC approval successful.", "success");
    $("btnApprove").textContent = "Approved ✓";
  } catch (err) {
    console.error("Approve error:", err);
    setMsg(
      msgEl,
      "Approve failed: " +
        (err.data?.message ||
          err.error?.message ||
          err.reason ||
          err.message ||
          err),
      "error"
    );
  }
}

// ================== STAKE ==================

async function onStake() {
  const msgEl = $("txMessage");
  setMsg(msgEl, "", null);

  try {
    if (!signer || !currentAccount) {
      await connectWallet();
      if (!signer) return;
    }
    await initContracts();

    const amtStr = $("thbcAmount")?.value || "0";
    const amount = parseFloat(amtStr) || 0;
    if (amount <= 0) {
      alert("กรุณาใส่จำนวน THBC ที่ต้องการ stake");
      return;
    }

    const amtWei = ethers.utils.parseUnits(
      amtStr,
      thbcDecimals || 18
    );

    setMsg(msgEl, "Sending stake transaction...", null);

    // IMPORTANT: ใช้ชื่อฟังก์ชันตาม ABI ใหม่ -> swapAndStake(uint256)
    const tx = await stakeContract.swapAndStake(amtWei);
    await tx.wait();

    setMsg(msgEl, "Stake success!", "success");
    await refreshPosition();
  } catch (err) {
    console.error("Stake error:", err);
    setMsg(
      msgEl,
      "Stake failed: " +
        (err.data?.message ||
          err.error?.message ||
          err.reason ||
          err.message ||
          err),
      "error"
    );
  }
}

// ================== POSITION DISPLAY ==================

async function refreshPosition() {
  try {
    if (!signer || !currentAccount) return;
    await initContracts();

    const user = currentAccount;

    // ใช้ getStakeCount / getStake ตาม ABI ใหม่
    const count = await stakeContract.getStakeCount(user);
    const stakeCount = count.toNumber();

    if (stakeCount === 0) {
      setText("posThbc", "0");
      setText("posKjc", "0");
      setText("posReward", "0");
      setText("posUnlock", "–");
      setText("posStatus", "–");
      setText("addrShort", shortAddress(user));
      return;
    }

    const lastIndex = stakeCount - 1;
    const stakeData = await stakeContract.getStake(user, lastIndex);
    // stakeData: [principal, reward, startTime, claimed]
    const principalBN = stakeData.principal || stakeData[0];
    const rewardBN = stakeData.reward || stakeData[1];
    const startTimeBN = stakeData.startTime || stakeData[2];
    const claimed = stakeData.claimed ?? stakeData[3];

    // unlockTime = startTime + lockDuration
    if (!lockDurationBN) {
      lockDurationBN = await stakeContract.lockDuration();
    }
    const unlockTimeBN = startTimeBN.add(lockDurationBN);

    // principal / reward เป็น KJC 18 decimals
    const principal = parseFloat(
      ethers.utils.formatUnits(principalBN, 18)
    );
    const reward = parseFloat(
      ethers.utils.formatUnits(rewardBN, 18)
    );

    // คำนวณ THBC spent กลับจาก rate
    let thbcSpent = 0;
    if (rateKjcPerThbcBN && !rateKjcPerThbcBN.isZero()) {
      const invBN = principalBN
        .mul(ethers.constants.WeiPerEther)
        .div(rateKjcPerThbcBN);
      thbcSpent = parseFloat(
        ethers.utils.formatUnits(invBN, thbcDecimals || 18)
      );
    }

    setText("addrShort", shortAddress(user));
    setText("posThbc", thbcSpent.toFixed(4));
    setText("posKjc", principal.toFixed(4));
    setText("posReward", reward.toFixed(4));

    const unlockSec = unlockTimeBN.toNumber();
    const unlockDate = new Date(unlockSec * 1000);
    setText("posUnlock", unlockDate.toLocaleString());

    const nowSec = Math.floor(Date.now() / 1000);
    let status = "";
    if (claimed) {
      status = "Claimed";
    } else if (nowSec < unlockSec) {
      status = "Locked";
    } else {
      status = "Unlocked (claimable)";
    }
    setText("posStatus", status);
  } catch (err) {
    console.error("refreshPosition error:", err);
  }
}

// ================== CLAIM ==================

async function onClaim() {
  const msgEl = $("claimMessage");
  setMsg(msgEl, "", null);

  try {
    if (!signer || !currentAccount) {
      await connectWallet();
      if (!signer) return;
    }
    await initContracts();

    // ไม่เช็คเงื่อนไขปล่อยให้ contract เป็นคน revert เอง
    setMsg(msgEl, "Sending claim transaction...", null);

    // ใช้ claimAll() ตาม ABI ใหม่
    const tx = await stakeContract.claimAll();
    await tx.wait();

    setMsg(msgEl, "Claim successful!", "success");
    await refreshPosition();
  } catch (err) {
    console.error("Claim error:", err);
    setMsg(
      msgEl,
      "Claim failed: " +
        (err.data?.message ||
          err.error?.message ||
          err.reason ||
          err.message ||
          err),
      "error"
    );
  }
}
