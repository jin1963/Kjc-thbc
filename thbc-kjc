// thbc-kjc.js – Swap THBC → KJC & Auto-Stake (ใช้กับ THBCtoKJCStake)

let injected;
let provider;
let signer;
let currentAccount = null;

let thbcContract;
let stakeContract;

let thbcDecimals = 18;
let rateKjcPerThbc = null;   // 18 decimals
let apyBps = null;           // e.g. 1500 = 15%
let lockDuration = null;     // seconds

function $(id) {
  return document.getElementById(id);
}

function getInjectedProvider() {
  if (window.ethereum) return window.ethereum;
  if (window.bitkeep && window.bitkeep.ethereum) return window.bitkeep.ethereum;
  if (window.bitget && window.bitget.ethereum) return window.bitget.ethereum;
  return null;
}

/* ============================ INIT ============================ */

window.addEventListener("load", () => {
  injected = getInjectedProvider();
  if (!injected) {
    console.warn("No injected wallet found (MetaMask / Bitget)");
  }

  if ($("btnConnect")) $("btnConnect").onclick = connectWallet;
  if ($("btnApprove")) $("btnApprove").onclick = onApproveTHBC;
  if ($("btnStake")) $("btnStake").onclick = onSwapAndStake;
  if ($("btnClaim")) $("btnClaim").onclick = onClaimAll;

  const input = $("thbcAmount");
  if (input) input.addEventListener("input", updatePreview);

  // ข้อมูล default ก่อนโหลดจาก contract
  setStaticTextsFallback();
  updatePreview();
});

/* ===================== STATIC TEXTS / PREVIEW ===================== */

function setStaticTextsFallback() {
  if ($("rateText")) $("rateText").textContent = "1 THBC = 1.9 KJC";
  if ($("apyText")) $("apyText").textContent = "15.00 %";
  if ($("lockText")) $("lockText").textContent = "365 days";
}

function updatePreview() {
  const amtStr = $("thbcAmount")?.value || "0";
  const amt = parseFloat(amtStr) || 0;

  // ใช้ rate จริงจาก contract ถ้ามีแล้ว ไม่งั้น fallback 1.9
  let rateFloat = 1.9;
  if (rateKjcPerThbc) {
    rateFloat = parseFloat(ethers.utils.formatUnits(rateKjcPerThbc, 18));
  }

  let apyPercent = 15;
  if (apyBps !== null) apyPercent = apyBps / 100;

  const kjcStake = amt * rateFloat;
  const reward = kjcStake * apyPercent / 100;
  const total = kjcStake + reward;

  if ($("kjcOut")) $("kjcOut").textContent = kjcStake.toFixed(4);
  if ($("kjcReward")) $("kjcReward").textContent = reward.toFixed(4);
  if ($("kjcTotal")) $("kjcTotal").textContent = total.toFixed(4);
}

/* ======================= CONNECT WALLET ======================= */

async function connectWallet() {
  try {
    injected = getInjectedProvider();
    if (!injected) {
      alert("ไม่พบ Wallet (MetaMask / Bitget) ในเบราว์เซอร์");
      return;
    }

    provider = new ethers.providers.Web3Provider(injected, "any");

    const accounts = await injected.request({
      method: "eth_requestAccounts"
    });
    if (!accounts || !accounts.length) {
      alert("ไม่พบบัญชีใน Wallet");
      return;
    }
    currentAccount = accounts[0];

    const net = await provider.getNetwork();
    const cfg = window.THBC_KJC_CONFIG;
    if (net.chainId !== cfg.chainId) {
      alert("กรุณาเลือก BNB Smart Chain (chainId 56) ใน Wallet ก่อน");
      return;
    }

    signer = provider.getSigner();

    thbcContract = new ethers.Contract(
      cfg.thbc.address,
      cfg.thbc.abi,
      signer
    );
    stakeContract = new ethers.Contract(
      cfg.stake.address,
      cfg.stake.abi,
      signer
    );

    // ปุ่ม connect + address ใน "Your Position"
    const short =
      currentAccount.slice(0, 6) +
      "..." +
      currentAccount.slice(currentAccount.length - 4);

    if ($("btnConnect")) $("btnConnect").textContent = short;
    if ($("addrShort")) $("addrShort").textContent = short;

    if (injected && injected.on) {
      injected.on("accountsChanged", () => window.location.reload());
      injected.on("chainChanged", () => window.location.reload());
    }

    await loadContractConfig();
    await refreshPosition();
  } catch (err) {
    console.error("connectWallet error:", err);
    alert("เชื่อมต่อกระเป๋าไม่สำเร็จ: " + (err.message || err));
  }
}

async function loadContractConfig() {
  try {
    if (!stakeContract) return;

    [rateKjcPerThbc, apyBps, lockDuration] = await Promise.all([
      stakeContract.rateKjcPerThbc(),
      stakeContract.apyBps(),
      stakeContract.lockDuration()
    ]);

    // decimals THBC (ควรเป็น 18)
    thbcDecimals = await thbcContract.decimals();

    // แสดงบนหน้า
    if ($("rateText")) {
      const rateStr = ethers.utils.formatUnits(rateKjcPerThbc, 18);
      $("rateText").textContent = `1 THBC = ${rateStr} KJC`;
    }

    if ($("apyText")) {
      const apy = (apyBps / 100).toFixed(2);
      $("apyText").textContent = `${apy} %`;
    }

    if ($("lockText")) {
      const days = (lockDuration / 86400).toFixed(0);
      $("lockText").textContent = `${days} days`;
    }

    updatePreview();
  } catch (err) {
    console.error("loadContractConfig error:", err);
  }
}

/* ========================= APPROVE THBC ======================= */

async function onApproveTHBC() {
  const msgEl = $("txMessage");
  if (msgEl) msgEl.textContent = "";

  try {
    if (!signer || !currentAccount) {
      await connectWallet();
      if (!signer) return;
    }
    const cfg = window.THBC_KJC_CONFIG;

    if (!thbcContract) {
      thbcContract = new ethers.Contract(
        cfg.thbc.address,
        cfg.thbc.abi,
        signer
      );
    }

    if (msgEl) msgEl.textContent = "Sending approve transaction...";

    const tx = await thbcContract.approve(
      cfg.stake.address,
      ethers.constants.MaxUint256
    );
    await tx.wait();

    if (msgEl) msgEl.textContent = "Unlimited THBC approval successful.";
    if ($("btnApprove")) $("btnApprove").textContent = "Approved ✓";
  } catch (err) {
    console.error("Approve error:", err);
    if (msgEl) {
      msgEl.textContent =
        "Approve failed: " +
        (err.data?.message ||
          err.error?.message ||
          err.reason ||
          err.message ||
          err);
    }
  }
}

/* ======================= SWAP & STAKE ========================= */

async function onSwapAndStake() {
  const msgEl = $("txMessage");
  if (msgEl) msgEl.textContent = "";

  try {
    if (!signer || !currentAccount) {
      await connectWallet();
      if (!signer) return;
    }

    const amtStr = $("thbcAmount")?.value.trim();
    if (!amtStr || Number(amtStr) <= 0) {
      alert("กรุณาใส่จำนวน THBC ที่ต้องการใช้");
      return;
    }

    const thbcAmount = ethers.utils.parseUnits(amtStr, thbcDecimals);

    if (!stakeContract) {
      const cfg = window.THBC_KJC_CONFIG;
      stakeContract = new ethers.Contract(
        cfg.stake.address,
        cfg.stake.abi,
        signer
      );
    }

    if (msgEl) msgEl.textContent = "Sending swap & stake transaction...";

    const tx = await stakeContract.swapAndStake(thbcAmount);
    await tx.wait();

    if (msgEl) msgEl.textContent = "Stake success!";
    await refreshPosition();
  } catch (err) {
    console.error("Swap&Stake error:", err);
    if (msgEl) {
      msgEl.textContent =
        "Stake failed: " +
        (err.data?.message ||
          err.error?.message ||
          err.reason ||
          err.message ||
          err);
    }
  }
}

/* ========================= CLAIM REWARD ======================= */

async function onClaimAll() {
  const msgEl = $("claimMessage");
  if (msgEl) msgEl.textContent = "";

  try {
    if (!signer || !currentAccount) {
      await connectWallet();
      if (!signer) return;
    }

    if (!stakeContract) {
      const cfg = window.THBC_KJC_CONFIG;
      stakeContract = new ethers.Contract(
        cfg.stake.address,
        cfg.stake.abi,
        signer
      );
    }

    if (msgEl) msgEl.textContent = "Sending claim transaction...";

    const tx = await stakeContract.claimAll();
    await tx.wait();

    if (msgEl) msgEl.textContent = "Claim success!";
    await refreshPosition();
  } catch (err) {
    console.error("Claim error:", err);
    if (msgEl) {
      msgEl.textContent =
        "Claim failed: " +
        (err.data?.message ||
          err.error?.message ||
          err.reason ||
          err.message ||
          err);
    }
  }
}

/* ======================= YOUR POSITION ======================== */

async function refreshPosition() {
  try {
    if (!stakeContract || !currentAccount) return;

    const countBN = await stakeContract.getStakeCount(currentAccount);
    const count = countBN.toNumber();

    // address
    if ($("addrShort")) {
      const short =
        currentAccount.slice(0, 6) +
        "..." +
        currentAccount.slice(currentAccount.length - 4);
      $("addrShort").textContent = short;
    }

    if (count === 0) {
      setPositionTexts("0", "0", "0", "–", "–");
      return;
    }

    const index = count - 1; // ใช้ stake ล่าสุด
    const [principal, reward, startTime, claimed] =
      await stakeContract.getStake(currentAccount, index);

    // principal = KJC ที่ stake (18 decimals)
    const principalKjc = principal;

    // แสดง KJC staked
    const kjcStakedStr = ethers.utils.formatUnits(principalKjc, 18);

    // แสดง Reward
    const rewardStr = ethers.utils.formatUnits(reward, 18);

    // คำนวณ THBC ที่ใช้ = KJC / rate
    let thbcSpentStr = "0";
    if (rateKjcPerThbc && !rateKjcPerThbc.isZero()) {
      const thbcSpent = principalKjc
        .mul(ethers.constants.WeiPerEther)
        .div(rateKjcPerThbc);
      thbcSpentStr = ethers.utils.formatUnits(thbcSpent, thbcDecimals);
    }

    const startTs = startTime.toNumber();
    let unlockTs = startTs;
    if (lockDuration) {
      unlockTs = startTs + lockDuration.toNumber();
    }
    const unlockStr = new Date(unlockTs * 1000).toLocaleString();

    let statusStr = "Locked";
    const nowSec = Math.floor(Date.now() / 1000);
    if (claimed) statusStr = "Claimed";
    else if (nowSec >= unlockTs) statusStr = "Unlocked";

    setPositionTexts(thbcSpentStr, kjcStakedStr, rewardStr, unlockStr, statusStr);
  } catch (err) {
    console.error("refreshPosition error:", err);
    const msgEl = $("txMessage");
    if (msgEl) {
      msgEl.textContent =
        "Refresh position error: " +
        (err.data?.message ||
          err.error?.message ||
          err.reason ||
          err.message ||
          err);
    }
  }
}

function setPositionTexts(thbc, kjc, reward, unlock, status) {
  if ($("posThbc")) $("posThbc").textContent = thbc;
  if ($("posKjc")) $("posKjc").textContent = kjc;
  if ($("posReward")) $("posReward").textContent = reward;
  if ($("posUnlock")) $("posUnlock").textContent = unlock;
  if ($("posStatus")) $("posStatus").textContent = status;
}
