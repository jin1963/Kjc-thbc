// thbc-kjc.js - THBC → KJC Auto Stake frontend

let injected;            // wallet provider (MetaMask / Bitget / Binance wallet)
let web3Provider;        // ethers Web3Provider (สำหรับส่ง tx)
let signer;              // current signer
let currentAccount = ""; // address ของ user

// read-only provider ใช้ RPC ตรง (ไม่ต้องพึ่ง wallet)
let readProvider;
let thbcRead;
let stakeRead;

// contracts แบบใช้ signer (เขียนข้อมูล)
let thbcWrite;
let stakeWrite;

// ค่า global จาก contract
let gRate = 0;        // KJC per 1 THBC
let gApy = 0;         // %
let gLockSeconds = 0; // วินาที

const CFG = window.THBC_KJC_CONFIG;
const DECIMALS = CFG.tokenDecimals || 18;

// ------- UTIL -------

function $(id) {
  return document.getElementById(id);
}

function shortAddr(addr) {
  if (!addr) return "–";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function setTxMessage(text, isError = false) {
  const el = $("txMessage");
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (text ? (isError ? "msg-error" : "msg-success") : "");
}

function setClaimMessage(text, isError = false) {
  const el = $("claimMessage");
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (text ? (isError ? "msg-error" : "msg-success") : "");
}

function clearMessages() {
  setTxMessage("");
  setClaimMessage("");
}

function getInjectedProvider() {
  if (window.ethereum) return window.ethereum;
  if (window.bitkeep && window.bitkeep.ethereum) return window.bitkeep.ethereum;
  if (window.bitget && window.bitget.ethereum) return window.bitget.ethereum;
  return null;
}

// ------- INIT -------

async function initApp() {
  // read provider ใช้ RPC ตรง
  readProvider = new ethers.providers.JsonRpcProvider(CFG.rpcUrl);
  thbcRead = new ethers.Contract(CFG.thbc.address, CFG.thbc.abi, readProvider);
  stakeRead = new ethers.Contract(CFG.stake.address, CFG.stake.abi, readProvider);

  if ($("btnConnect")) $("btnConnect").onclick = connectWallet;
  if ($("btnApprove")) $("btnApprove").onclick = onApprove;
  if ($("btnStake")) $("btnStake").onclick = onStake;
  if ($("btnClaim")) $("btnClaim").onclick = onClaim;
  if ($("thbcAmount")) $("thbcAmount").addEventListener("input", updatePreview);

  await loadGlobalInfo();
  updatePreview();
}

window.addEventListener("load", initApp);

// ------- GLOBAL INFO (Rate / APY / Lock) -------

async function loadGlobalInfo() {
  try {
    const [rateBN, apyBpsBN, lockBN] = await Promise.all([
      stakeRead.rateKjcPerThbc(),
      stakeRead.apyBps(),
      stakeRead.lockDuration()
    ]);

    gRate = Number(ethers.utils.formatUnits(rateBN, 18)); // KJC per 1 THBC
    gApy = apyBpsBN.toNumber() / 100;                     // basis points → %
    gLockSeconds = lockBN.toNumber();

    const days = Math.floor(gLockSeconds / (24 * 3600));

    if ($("rateText")) $("rateText").textContent = `1 THBC = ${gRate} KJC`;
    if ($("apyText")) $("apyText").textContent = `${gApy.toFixed(2)} %`;
    if ($("lockText")) $("lockText").textContent = `${days} days`;

  } catch (err) {
    console.error("loadGlobalInfo error:", err);
    if ($("rateText")) $("rateText").textContent = "–";
    if ($("apyText")) $("apyText").textContent = "–";
    if ($("lockText")) $("lockText").textContent = "–";
  }
}

// ------- CONNECT WALLET -------

async function connectWallet() {
  clearMessages();

  try {
    injected = getInjectedProvider();
    if (!injected) {
      alert("ไม่พบ Wallet (MetaMask / Binance / Bitget) ในเบราว์เซอร์");
      return;
    }

    web3Provider = new ethers.providers.Web3Provider(injected, "any");

    const accounts = await web3Provider.send("eth_requestAccounts", []);
    if (!accounts || !accounts.length) {
      alert("ไม่พบบัญชีใน Wallet");
      return;
    }

    currentAccount = accounts[0];
    signer = web3Provider.getSigner();

    // สร้าง contract แบบเขียน
    thbcWrite = new ethers.Contract(CFG.thbc.address, CFG.thbc.abi, signer);
    stakeWrite = new ethers.Contract(CFG.stake.address, CFG.stake.abi, signer);

    const net = await web3Provider.getNetwork();
    if (net.chainId !== CFG.chainId) {
      alert("กรุณาเลือก BNB Smart Chain (mainnet) ใน Wallet ก่อนใช้งาน");
    }

    if ($("btnConnect")) $("btnConnect").textContent = shortAddr(currentAccount);
    if ($("addrShort")) $("addrShort").textContent = shortAddr(currentAccount);

    if (injected && injected.on) {
      injected.on("accountsChanged", () => window.location.reload());
      injected.on("chainChanged", () => window.location.reload());
    }

    await refreshPosition();
  } catch (err) {
    console.error("connectWallet error:", err);
    alert("เชื่อมต่อกระเป๋าไม่สำเร็จ: " + (err.message || err));
  }
}

async function ensureWallet() {
  if (currentAccount && signer && stakeWrite) return true;
  await connectWallet();
  return !!currentAccount;
}

// ------- PREVIEW -------

function updatePreview() {
  const amountStr = $("thbcAmount")?.value || "0";
  const thbcNum = parseFloat(amountStr) || 0;

  if (!gRate || !gApy) {
    if ($("kjcOut")) $("kjcOut").textContent = "0";
    if ($("kjcReward")) $("kjcReward").textContent = "0";
    if ($("kjcTotal")) $("kjcTotal").textContent = "0";
    return;
  }

  const kjcPrincipal = thbcNum * gRate;
  const reward = kjcPrincipal * (gApy / 100);
  const total = kjcPrincipal + reward;

  if ($("kjcOut")) $("kjcOut").textContent = kjcPrincipal.toFixed(4);
  if ($("kjcReward")) $("kjcReward").textContent = reward.toFixed(4);
  if ($("kjcTotal")) $("kjcTotal").textContent = total.toFixed(4);
}

// ------- APPROVE THBC -------

async function onApprove() {
  clearMessages();
  if (!(await ensureWallet())) return;

  try {
    setTxMessage("Sending approve transaction...");

    const max = ethers.constants.MaxUint256;

    // ไม่เช็ค allowance ล่วงหน้าเพื่อตัดปัญหา CALL_EXCEPTION บนบาง wallet
    const tx = await thbcWrite.approve(CFG.stake.address, max);
    await tx.wait();

    setTxMessage("Unlimited THBC approval successful.");
    if ($("btnApprove")) $("btnApprove").textContent = "Approved ✓";
  } catch (err) {
    console.error("Approve error:", err);
    setTxMessage(
      "Approve failed: " +
        (err.data?.message || err.error?.message || err.message || err),
      true
    );
  }
}

// ------- STAKE -------

async function onStake() {
  clearMessages();
  if (!(await ensureWallet())) return;

  const amountStr = $("thbcAmount")?.value.trim() || "";
  if (!amountStr || Number(amountStr) <= 0) {
    setTxMessage("กรุณาใส่จำนวน THBC ที่ต้องการใช้ stake", true);
    return;
  }

  try {
    const thbcAmountBN = ethers.utils.parseUnits(amountStr, DECIMALS);

    setTxMessage("Sending swap & stake transaction...");

    const tx = await stakeWrite.swapAndStake(thbcAmountBN);
    await tx.wait();

    setTxMessage("Stake success!");
    await refreshPosition();
  } catch (err) {
    console.error("Stake error:", err);
    setTxMessage(
      "Stake failed: " +
        (err.data?.message || err.error?.message || err.message || err),
      true
    );
  }
}

// ------- POSITION / YOUR POSITION -------

async function refreshPosition() {
  if (!currentAccount || !stakeRead) return;

  try {
    const countBN = await stakeRead.getStakeCount(currentAccount);
    const count = countBN.toNumber();

    if (count === 0) {
      if ($("posThbc")) $("posThbc").textContent = "0";
      if ($("posKjc")) $("posKjc").textContent = "0";
      if ($("posReward")) $("posReward").textContent = "0";
      if ($("posUnlock")) $("posUnlock").textContent = "–";
      if ($("posStatus")) $("posStatus").textContent = "–";
      if ($("addrShort")) $("addrShort").textContent = shortAddr(currentAccount);
      return;
    }

    const lastIndex = count - 1;
    const stake = await stakeRead.getStake(currentAccount, lastIndex);
    const principalBN = stake.principal || stake[0];
    const rewardBN = stake.reward || stake[1];
    const startTimeBN = stake.startTime || stake[2];
    const claimed = stake.claimed ?? stake[3];

    const principalKjc = Number(
      ethers.utils.formatUnits(principalBN, DECIMALS)
    );
    const rewardKjc = Number(ethers.utils.formatUnits(rewardBN, DECIMALS));

    // THBC ที่ใช้ = principal / rate
    const thbcSpent = gRate ? principalKjc / gRate : 0;

    const startTs = startTimeBN.toNumber();
    const unlockTs = startTs + (gLockSeconds || 365 * 24 * 3600);
    const now = Math.floor(Date.now() / 1000);

    let status = "Locked";
    if (claimed) status = "Claimed";
    else if (now >= unlockTs) status = "Unlocked";

    if ($("addrShort")) $("addrShort").textContent = shortAddr(currentAccount);
    if ($("posThbc")) $("posThbc").textContent = thbcSpent.toFixed(4);
    if ($("posKjc")) $("posKjc").textContent = principalKjc.toFixed(4);
    if ($("posReward")) $("posReward").textContent = rewardKjc.toFixed(4);
    if ($("posUnlock"))
      $("posUnlock").textContent = new Date(unlockTs * 1000).toLocaleString();
    if ($("posStatus")) $("posStatus").textContent = status;
  } catch (err) {
    console.error("refreshPosition error:", err);
  }
}

// ------- CLAIM -------

async function onClaim() {
  clearMessages();
  if (!(await ensureWallet())) return;

  try {
    const pendingBN = await stakeRead.pendingRewardAll(currentAccount);
    if (pendingBN.isZero()) {
      setClaimMessage("ยังไม่มีรางวัลให้เคลม (Reward = 0)", true);
      return;
    }

    setClaimMessage("Sending claim transaction...");

    const tx = await stakeWrite.claimAll();
    await tx.wait();

    setClaimMessage("Claim success!");
    await refreshPosition();
  } catch (err) {
    console.error("Claim error:", err);
    setClaimMessage(
      "Claim failed: " +
        (err.data?.message || err.error?.message || err.message || err),
      true
    );
  }
}
