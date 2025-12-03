// thbc-kjc.js - frontend THBC → KJC auto stake

let injected;
let provider;
let signer;
let currentAccount = null;

let thbcToken;
let stakeContract;
let thbcDecimals = 18; // สมมติ ถ้าของจริงไม่ใช่ ปรับได้

const zeroAddress = "0x0000000000000000000000000000000000000000";

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

async function init() {
  injected = getInjectedProvider();
  if (!injected) {
    console.warn("No injected wallet found (MetaMask / Bitget)");
  }

  if ($("thbcAmount")) $("thbcAmount").addEventListener("input", updatePreview);

  if ($("btnConnect")) $("btnConnect").onclick = connectWallet;
  if ($("btnApprove")) $("btnApprove").onclick = onApproveTHBC;
  if ($("btnStake")) $("btnStake").onclick = onStake;
  if ($("btnClaim")) $("btnClaim").onclick = onClaim;

  await loadGlobalParams(); // ดึง rate / apy / lockDuration ถ้ามี provider อยู่แล้ว
  updatePreview();
}

/* ===================== LOAD GLOBAL PARAMS ===================== */

async function loadGlobalParams() {
  try {
    // ใช้ public provider จาก injected (ถ้าเปิด wallet อยู่)
    const cfg = window.THBC_KJC_CONFIG;
    let tempProvider;

    if (getInjectedProvider()) {
      tempProvider = new ethers.providers.Web3Provider(getInjectedProvider(), "any");
    } else {
      // ถ้าไม่มี wallet ก็ข้ามไป แค่ยังโชว์ "–" ไว้
      return;
    }

    const contract = new ethers.Contract(
      cfg.stake.address,
      cfg.stake.abi,
      tempProvider
    );

    const [rate, apyBps, lockDuration] = await Promise.all([
      contract.rateKjcPerThbc(),
      contract.apyBps(),
      contract.lockDuration()
    ]);

    // rate ใช้ scale 1e18
    const rateFloat = Number(ethers.utils.formatUnits(rate, 18));
    if ($("rateText")) $("rateText").textContent = `1 THBC = ${rateFloat} KJC`;

    const apy = Number(apyBps) / 100;
    if ($("apyText")) $("apyText").textContent = `${apy.toFixed(2)} %`;

    const days = Math.floor(Number(lockDuration) / (24 * 60 * 60));
    if ($("lockText")) $("lockText").textContent = `${days} days`;
  } catch (err) {
    console.warn("loadGlobalParams error:", err);
  }
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

    const network = await provider.getNetwork();
    const cfg = window.THBC_KJC_CONFIG;
    if (network.chainId !== cfg.chainId) {
      alert("กรุณาเลือก BNB Smart Chain (chainId 56) ใน Wallet ก่อน");
      // ให้ผู้ใช้เปลี่ยนเองแล้วกดใหม่
    }

    signer = provider.getSigner();

    thbcToken = new ethers.Contract(cfg.thbc.address, cfg.thbc.abi, signer);
    stakeContract = new ethers.Contract(cfg.stake.address, cfg.stake.abi, signer);

    // อ่าน decimals (กันพลาด)
    try {
      thbcDecimals = await thbcToken.decimals();
    } catch (e) {
      console.warn("cannot read THBC decimals, using 18");
      thbcDecimals = 18;
    }

    // เปลี่ยนข้อความบนปุ่ม Connect
    if ($("btnConnect")) {
      const short =
        currentAccount.slice(0, 6) +
        "..." +
        currentAccount.slice(currentAccount.length - 4);
      $("btnConnect").textContent = short;
    }

    if ($("addrShort")) {
      $("addrShort").textContent =
        currentAccount.slice(0, 6) +
        "..." +
        currentAccount.slice(currentAccount.length - 4);
    }

    await refreshPosition();

    if (injected && injected.on) {
      injected.on("accountsChanged", () => window.location.reload());
      injected.on("chainChanged", () => window.location.reload());
    }
  } catch (err) {
    console.error("connectWallet error:", err);
    alert("เชื่อมต่อกระเป๋าไม่สำเร็จ: " + (err.message || err));
  }
}

/* ======================== PREVIEW OUTPUT ====================== */

function updatePreview() {
  const amountStr = $("thbcAmount")?.value || "0";
  const num = parseFloat(amountStr) || 0;

  const rateText = $("rateText")?.textContent || "";
  // พยายามดึงค่าจำนวนจาก "1 THBC = X KJC"
  let rate = 0;
  const parts = rateText.split("=");
  if (parts.length === 2) {
    const rhs = parts[1].trim().split(" ")[0];
    rate = parseFloat(rhs) || 0;
  }

  const kjc = num * rate;
  if ($("kjcOut")) $("kjcOut").textContent = kjc.toFixed(4);

  const apyText = $("apyText")?.textContent || "";
  let apy = 0;
  if (apyText.endsWith("%")) {
    apy = parseFloat(apyText.replace("%", "")) || 0;
  }

  const reward = kjc * (apy / 100); // คิดง่าย ๆ ทั้งปีจ่ายทีเดียว
  if ($("kjcReward")) $("kjcReward").textContent = reward.toFixed(4);
  if ($("kjcTotal")) $("kjcTotal").textContent = (kjc + reward).toFixed(4);
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

    if (!thbcToken) {
      thbcToken = new ethers.Contract(cfg.thbc.address, cfg.thbc.abi, signer);
    }

    if (msgEl) msgEl.textContent = "Sending approve transaction...";

    const max = ethers.constants.MaxUint256;
    const tx = await thbcToken.approve(cfg.stake.address, max);
    await tx.wait();

    if (msgEl) {
      msgEl.style.color = "#00ff88";
      msgEl.textContent = "Unlimited THBC approval successful.";
    }
    if ($("btnApprove")) $("btnApprove").textContent = "Approved ✓";
  } catch (err) {
    console.error("Approve error:", err);
    if ($("txMessage")) {
      $("txMessage").style.color = "#ff4d4f";
      $("txMessage").textContent =
        "Approve failed: " +
        (err.data?.message || err.error?.message || err.message || err);
    }
  }
}

/* ============================ STAKE =========================== */

async function onStake() {
  const msgEl = $("txMessage");
  if (msgEl) {
    msgEl.style.color = "#fff";
    msgEl.textContent = "";
  }

  try {
    if (!signer || !currentAccount) {
      await connectWallet();
      if (!signer) return;
    }

    const amountStr = $("thbcAmount").value.trim();
    if (!amountStr || Number(amountStr) <= 0) {
      alert("กรุณาใส่จำนวน THBC ที่ต้องการใช้แลกและ Stake");
      return;
    }

    const thbcAmount = ethers.utils.parseUnits(amountStr, thbcDecimals);
    const cfg = window.THBC_KJC_CONFIG;

    if (!stakeContract) {
      stakeContract = new ethers.Contract(
        cfg.stake.address,
        cfg.stake.abi,
        signer
      );
    }

    if (msgEl) msgEl.textContent = "Sending stake transaction...";

    // >>> ถ้าชื่อฟังก์ชันใน contract ไม่ใช่ stakeWithTHBC ให้แก้ตรงนี้ใน STAKE_ABI + ฟังก์ชันนี้ <<<
    const tx = await stakeContract.stakeWithTHBC(thbcAmount);
    await tx.wait();

    if (msgEl) {
      msgEl.style.color = "#00ff88";
      msgEl.textContent = "Swap & Stake success!";
    }

    await refreshPosition();
  } catch (err) {
    console.error("Stake error:", err);
    if ($("txMessage")) {
      $("txMessage").style.color = "#ff4d4f";
      $("txMessage").textContent =
        "Stake failed: " +
        (err.data?.message ||
          err.error?.message ||
          err.reason ||
          err.message ||
          err);
    }
  }
}

/* ============================ CLAIM =========================== */

async function onClaim() {
  const msgEl = $("claimMessage");
  if (msgEl) {
    msgEl.style.color = "#fff";
    msgEl.textContent = "";
  }

  try {
    if (!signer || !currentAccount) {
      await connectWallet();
      if (!signer) return;
    }

    const cfg = window.THBC_KJC_CONFIG;
    if (!stakeContract) {
      stakeContract = new ethers.Contract(
        cfg.stake.address,
        cfg.stake.abi,
        signer
      );
    }

    if (msgEl) msgEl.textContent = "Sending claim transaction...";

    const tx = await stakeContract.claim();
    await tx.wait();

    if (msgEl) {
      msgEl.style.color = "#00ff88";
      msgEl.textContent = "Claim success! 🎉";
    }

    await refreshPosition();
  } catch (err) {
    console.error("Claim error:", err);
    if ($("claimMessage")) {
      $("claimMessage").style.color = "#ff4d4f";
      $("claimMessage").textContent =
        "Claim failed: " +
        (err.data?.message ||
          err.error?.message ||
          err.reason ||
          err.message ||
          err);
    }
  }
}

/* ======================= LOAD USER POSITION =================== */

async function refreshPosition() {
  if (!signer || !currentAccount || !stakeContract) return;

  try {
    const pos = await stakeContract.positions(currentAccount);
    // pos = [thbcSpent, kjcStaked, rewardKjc, startTime, unlockTime, claimed]

    const thbcSpent = Number(
      ethers.utils.formatUnits(pos.thbcSpent || pos[0], thbcDecimals)
    );
    const kjcStaked = Number(
      ethers.utils.formatUnits(pos.kjcStaked || pos[1], 18)
    );
    const rewardKjc = Number(
      ethers.utils.formatUnits(pos.rewardKjc || pos[2], 18)
    );
    const unlockTs = Number(pos.unlockTime || pos[4]);
    const claimed = Boolean(pos.claimed || pos[5]);

    if ($("posThbc")) $("posThbc").textContent = thbcSpent.toFixed(4);
    if ($("posKjc")) $("posKjc").textContent = kjcStaked.toFixed(4);
    if ($("posReward")) $("posReward").textContent = rewardKjc.toFixed(4);

    if (unlockTs > 0) {
      const d = new Date(unlockTs * 1000);
      if ($("posUnlock")) $("posUnlock").textContent = d.toLocaleString();
    } else {
      if ($("posUnlock")) $("posUnlock").textContent = "–";
    }

    let status = "No position";
    const now = Math.floor(Date.now() / 1000);
    if (thbcSpent > 0) {
      if (claimed) status = "Claimed";
      else if (unlockTs > 0 && now >= unlockTs) status = "Unlockable";
      else status = "Locked";
    }
    if ($("posStatus")) $("posStatus").textContent = status;
  } catch (err) {
    console.warn("refreshPosition error:", err);
  }
}

/* ============================ START =========================== */

window.addEventListener("load", init);
