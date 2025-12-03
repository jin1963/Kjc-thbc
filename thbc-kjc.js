// thbc-kjc.js - THBC → KJC & Auto-Stake (รองรับ MetaMask / Binance / Bitget)

let injected;
let provider;
let signer;
let currentAccount = null;

let thbcWrite;   // contract สำหรับส่ง tx (ผ่าน wallet)
let stakeWrite;  // contract สำหรับส่ง tx (ผ่าน wallet)

let stakeRead;   // contract อ่านข้อมูล (ผ่าน RPC ตรง)
let thbcDecimals = 18;

let cacheRate = null;       // KJC per 1 THBC (เลขจริงไม่สเกล)
let cacheRateRaw = null;    // ค่าในสัญญา (1.9 * 1e18)
let cacheApyBps = null;
let cacheLockDuration = null; // วินาที

// ----------------- Utilities -----------------

function $(id) {
  return document.getElementById(id);
}

function getInjectedProvider() {
  if (window.ethereum) return window.ethereum;
  if (window.BinanceChain) return window.BinanceChain;
  if (window.bitkeep && window.bitkeep.ethereum) return window.bitkeep.ethereum;
  if (window.bitget && window.bitget.ethereum) return window.bitget.ethereum;
  return null;
}

function setMsg(el, text, type) {
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg" + (type ? " " + type : "");
}

// ----------------- INIT -----------------

async function init() {
  const cfg = window.THBC_KJC_CONFIG;
  if (!cfg) {
    console.error("THBC_KJC_CONFIG not found.");
    return;
  }

  // read-only provider บน BSC ใช้อ่านข้อมูลเสมอ
  const readProvider = new ethers.providers.JsonRpcProvider(cfg.rpcUrl);
  stakeRead = new ethers.Contract(cfg.stake.address, cfg.stake.abi, readProvider);

  if ($("btnConnect")) $("btnConnect").onclick = connectWallet;
  if ($("btnApprove")) $("btnApprove").onclick = onApproveTHBC;
  if ($("btnStake")) $("btnStake").onclick = onSwapAndStake;
  if ($("btnClaim")) $("btnClaim").onclick = onClaimKJC;
  if ($("thbcAmount")) $("thbcAmount").addEventListener("input", updatePreview);

  await loadOnchainConfig();
  updatePreview();
}

window.addEventListener("load", init);

// ----------------- CONNECT WALLET -----------------

async function connectWallet() {
  const cfg = window.THBC_KJC_CONFIG;
  const msgEl = $("txMessage");
  setMsg(msgEl, "", "");  

  try {
    injected = getInjectedProvider();
    if (!injected) {
      alert("ไม่พบ Wallet (MetaMask / Binance / Bitget) ในเบราว์เซอร์");
      return;
    }

    provider = new ethers.providers.Web3Provider(injected, "any");
    const accounts = await injected.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts.length) {
      alert("ไม่พบบัญชีใน Wallet");
      return;
    }
    currentAccount = accounts[0];

    // เช็ค network
    let network = await provider.getNetwork();
    if (network.chainId !== cfg.chainId) {
      // ลองสั่งให้เปลี่ยน chain (บาง wallet รองรับ)
      try {
        await injected.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + cfg.chainId.toString(16) }]
        });
        provider = new ethers.providers.Web3Provider(injected, "any");
        network = await provider.getNetwork();
      } catch (switchErr) {
        console.warn("wallet_switchEthereumChain error:", switchErr);
      }
    }

    if (network.chainId !== cfg.chainId) {
      alert("กรุณาเปลี่ยน Network ใน Wallet เป็น BNB Smart Chain (chainId 56) แล้วเชื่อมต่อใหม่");
      return;
    }

    signer = provider.getSigner();
    thbcWrite = new ethers.Contract(cfg.thbc.address, cfg.thbc.abi, signer);
    stakeWrite = new ethers.Contract(cfg.stake.address, cfg.stake.abi, signer);

    // อ่าน decimals THBC (เผื่ออนาคตเปลี่ยน)
    try {
      thbcDecimals = await thbcWrite.decimals();
    } catch (e) {
      thbcDecimals = 18;
    }

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

    // โหลดสถานะ stake ของ user
    refreshPosition();
  } catch (err) {
    console.error("connectWallet error:", err);
    setMsg(msgEl, "เชื่อมต่อกระเป๋าไม่สำเร็จ: " + (err.message || err), "error");
  }
}

// ----------------- LOAD CONFIG (rate / APY / lock) -----------------

async function loadOnchainConfig() {
  const msgEl = $("txMessage");
  try {
    const [rateRaw, apyBps, lockDuration] = await Promise.all([
      stakeRead.rateKjcPerThbc(),
      stakeRead.apyBps(),
      stakeRead.lockDuration()
    ]);

    cacheRateRaw = rateRaw;
    cacheRate = parseFloat(ethers.utils.formatUnits(rateRaw, 18)); // 1.9
    cacheApyBps = apyBps.toNumber();
    cacheLockDuration = lockDuration.toNumber();

    if ($("rateText")) $("rateText").textContent = `1 THBC = ${cacheRate} KJC`;
    if ($("apyText"))
      $("apyText").textContent = (cacheApyBps / 100).toFixed(2) + " %";

    if ($("lockText")) {
      const days = Math.round(cacheLockDuration / (24 * 60 * 60));
      $("lockText").textContent = `${days} days`;
    }
  } catch (err) {
    console.error("loadOnchainConfig error:", err);
    setMsg(
      msgEl,
      "โหลดข้อมูลสัญญาไม่สำเร็จ (อาจเป็นเพราะ RPC หรือ contract address/ABI ไม่ตรง)",
      "error"
    );
  }
}

// ----------------- PREVIEW -----------------

function updatePreview() {
  const amtStr = $("thbcAmount")?.value || "0";
  const thbcFloat = parseFloat(amtStr) || 0;

  if (!cacheRate || !cacheApyBps) {
    if ($("kjcOut")) $("kjcOut").textContent = "0";
    if ($("kjcReward")) $("kjcReward").textContent = "0";
    if ($("kjcTotal")) $("kjcTotal").textContent = "0";
    return;
  }

  const principal = thbcFloat * cacheRate;
  const apy = cacheApyBps / 10000; // bps → %
  const reward = principal * apy;
  const total = principal + reward;

  if ($("kjcOut")) $("kjcOut").textContent = principal.toFixed(4);
  if ($("kjcReward")) $("kjcReward").textContent = reward.toFixed(4);
  if ($("kjcTotal")) $("kjcTotal").textContent = total.toFixed(4);
}

// ----------------- APPROVE THBC -----------------

async function onApproveTHBC() {
  const msgEl = $("txMessage");
  setMsg(msgEl, "", "");

  try {
    if (!signer || !currentAccount) {
      await connectWallet();
      if (!signer) return;
    }

    const cfg = window.THBC_KJC_CONFIG;

    // ตรวจ allowance ก่อน
    const allowance = await thbcWrite.allowance(
      currentAccount,
      cfg.stake.address
    );

    const need = ethers.utils.parseUnits("1000000000", thbcDecimals); // ให้มันเยอะๆ ไปเลย
    if (allowance.gte(need)) {
      setMsg(msgEl, "THBC ได้ approve ไว้อยู่แล้ว", "success");
      if ($("btnApprove")) $("btnApprove").textContent = "Approved ✓";
      return;
    }

    setMsg(msgEl, "Sending approve transaction...", "info");

    const max = ethers.constants.MaxUint256;
    const tx = await thbcWrite.approve(cfg.stake.address, max, {
      gasLimit: 100000 // กัน Bitget/มือถือคำนวณ gas พลาด
    });
    await tx.wait();

    setMsg(msgEl, "Unlimited THBC approval successful.", "success");
    if ($("btnApprove")) $("btnApprove").textContent = "Approved ✓";
  } catch (err) {
    console.error("Approve error:", err);
    const reason =
      err.data?.message ||
      err.error?.message ||
      err.reason ||
      err.message ||
      err;
    setMsg(msgEl, "Approve failed: " + reason, "error");
  }
}

// ----------------- SWAP & STAKE -----------------

async function onSwapAndStake() {
  const msgEl = $("txMessage");
  setMsg(msgEl, "", "");

  try {
    if (!signer || !currentAccount) {
      await connectWallet();
      if (!signer) return;
    }

    const amtStr = $("thbcAmount").value.trim();
    if (!amtStr || Number(amtStr) <= 0) {
      alert("กรุณาใส่จำนวน THBC ที่ต้องการใช้");
      return;
    }

    const thbcAmount = ethers.utils.parseUnits(amtStr, thbcDecimals);

    setMsg(msgEl, "Sending swap & stake transaction...", "info");

    // ใส่ gasLimit กัน fail บนมือถือ / Bitget
    const tx = await stakeWrite.swapAndStake(thbcAmount, {
      gasLimit: 400000
    });
    await tx.wait();

    setMsg(msgEl, "Stake success!", "success");

    // รีเฟรชสถานะ
    refreshPosition();
  } catch (err) {
    console.error("Swap & Stake error:", err);
    const reason =
      err.data?.message ||
      err.error?.message ||
      err.reason ||
      err.message ||
      err;
    setMsg(msgEl, "Stake failed: " + reason, "error");
  }
}

// ----------------- REFRESH POSITION -----------------

async function refreshPosition() {
  const cfg = window.THBC_KJC_CONFIG;
  const posThbc = $("posThbc");
  const posKjc = $("posKjc");
  const posReward = $("posReward");
  const posUnlock = $("posUnlock");
  const posStatus = $("posStatus");

  if (!currentAccount || !stakeRead) {
    if (posThbc) posThbc.textContent = "0";
    if (posKjc) posKjc.textContent = "0";
    if (posReward) posReward.textContent = "0";
    if (posUnlock) posUnlock.textContent = "–";
    if (posStatus) posStatus.textContent = "–";
    return;
  }

  try {
    const count = await stakeRead.getStakeCount(currentAccount);
    if (count.eq(0)) {
      if (posThbc) posThbc.textContent = "0";
      if (posKjc) posKjc.textContent = "0";
      if (posReward) posReward.textContent = "0";
      if (posUnlock) posUnlock.textContent = "–";
      if (posStatus) posStatus.textContent = "–";
      return;
    }

    const lastIndex = count.sub(1);
    const [principal, rewardOriginal, startTime, claimed] =
      await stakeRead.getStake(currentAccount, lastIndex);

    // ใช้ pendingReward/pendingPayout เผื่ออนาคตมีคำนวณแบบยืดหยุ่น
    let rewardNow;
    try {
      rewardNow = await stakeRead.pendingReward(currentAccount, lastIndex);
    } catch {
      rewardNow = rewardOriginal;
    }

    const unlockTimeBN = startTime.add(cacheLockDuration || 0);
    const nowSec = Math.floor(Date.now() / 1000);

    // THBC ที่ใช้ = principal / rate
    let thbcSpentFloat = 0;
    if (cacheRateRaw && principal.gt(0)) {
      // principal / rateKjcPerThbc  (ทั้งคู่ 1e18)
      const thbcBN = principal.mul(ethers.constants.WeiPerEther).div(
        cacheRateRaw
      );
      thbcSpentFloat = parseFloat(
        ethers.utils.formatUnits(thbcBN, thbcDecimals)
      );
    }

    const kjcStakedFloat = parseFloat(
      ethers.utils.formatUnits(principal, 18)
    );
    const rewardFloat = parseFloat(
      ethers.utils.formatUnits(rewardNow, 18)
    );

    if (posThbc) posThbc.textContent = thbcSpentFloat.toFixed(4);
    if (posKjc) posKjc.textContent = kjcStakedFloat.toFixed(4);
    if (posReward) posReward.textContent = rewardFloat.toFixed(4);

    if (posUnlock) {
      const date = new Date(unlockTimeBN.toNumber() * 1000);
      posUnlock.textContent = date.toLocaleString();
    }

    if (posStatus) {
      let status = "Locked";
      if (claimed) status = "Claimed";
      else if (nowSec >= unlockTimeBN.toNumber()) status = "Unlockable";
      posStatus.textContent = status;
    }
  } catch (err) {
    console.error("refreshPosition error:", err);
  }
}

// ----------------- CLAIM KJC -----------------

async function onClaimKJC() {
  const msgEl = $("claimMessage");
  setMsg(msgEl, "", "");

  try {
    if (!signer || !currentAccount) {
      await connectWallet();
      if (!signer) return;
    }

    // ตอนนี้ใช้ claimAll ไปเลย (ถ้าอยากเปลี่ยนเป็น claim(index) ค่อยปรับ)
    const tx = await stakeWrite.claimAll({
      gasLimit: 300000
    });
    await tx.wait();

    setMsg(msgEl, "Claim success!", "success");
    refreshPosition();
  } catch (err) {
    console.error("Claim error:", err);
    const reason =
      err.data?.message ||
      err.error?.message ||
      err.reason ||
      err.message ||
      err;
    setMsg(msgEl, "Claim failed: " + reason, "error");
  }
}
