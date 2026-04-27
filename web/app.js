// =====================================================================
// Pasteurizador HTST - motor con balance volumetrico de leche
// =====================================================================

// Constantes de proceso
const SP_HEAT      = 75;
const SP_HOLD_MIN  = 72;
const SP_HOLD_S    = 15;
const SP_OUT       = 4.5;
const T_PUMP_READY = 65;

// Capacidades / parametros volumetricos (basados en planta HTST piloto)
const TANK_IN_MAX  = 100;     // L  capacidad tanque de balance
const TANK_OUT_MAX = 150;     // L  capacidad tanque producto final
const TANK_MIN_VOL = 10;      // L  nivel minimo para arrancar bomba
const FILL_RATE    = 1.5;     // L/s velocidad de llenado del tanque
const HOLDUP_VOL   = 5.0;     // L  volumen residual en tuberias + intercambiador (perdida al cerrar lote)
const EVAP_FACTOR  = 0.002;   // 0.2% evaporacion en calentamiento (literatura HTST 0.1-0.3%)

const state = {
  energyOn: false, running: false, mode: "production",
  fillOn: false, pumpHotOn: false, pumpColdOn: false, pumpMilkOn: false,

  tempHeat: 20, tempHold: 20, tempOut: 13.6, tempBoiler: 20,
  holdTimer: 0,

  vProd: false, vRet: false, vDes: false,
  alarm: false, lowTempAcc: 0,

  // ---------- volumenes (L) ----------
  tankInVol:  0,
  tankOutVol: 0,
  targetFillVol: 50,    // L  setpoint del usuario
  flowRate: 0.5,        // L/s caudal de la bomba

  // contadores del lote
  vFilled: 0,           // L procesados (entrada acumulada)
  vFinal:  0,           // L entregados al tanque final
  vRecirc: 0,           // L pasaron por desviacion -> retorno
  vEvap:   0,           // L evaporados
  vLoss:   0,           // L perdidos por holdup al cerrar lote
  batchActive: false,
  batchClosed: false,

  hint: "Encender Energia y luego Start.",

  cipStep: 0, cipTime: 0
};

const CIP_STEPS = [
  { name: "Enjuague preliminar", s: 45 },
  { name: "Limpieza alcalina",   s: 90 },
  { name: "Enjuague intermedio", s: 45 },
  { name: "Limpieza acida",      s: 90 },
  { name: "Enjuague final",      s: 45 }
];

const $ = id => document.getElementById(id);
const el = {
  energyBtn: $("energyBtn"), startBtn: $("startBtn"), stopBtn: $("stopBtn"),
  modeBtn: $("modeBtn"), fillBtn: $("fillBtn"),
  hotPumpBtn: $("hotPumpBtn"), coldPumpBtn: $("coldPumpBtn"), milkPumpBtn: $("milkPumpBtn"),
  resetBatchBtn: $("resetBatchBtn"),

  targetSlider: $("targetSlider"), targetVal: $("targetVal"),
  flowSlider:   $("flowSlider"),   flowVal: $("flowVal"),

  heatDisplay: $("heatDisplay"),
  heatTemp: $("heatTemp"), holdTemp: $("holdTemp"),
  outTemp: $("outTemp"), holdTime: $("holdTime"),
  alarm: $("alarm"), cip: $("cip"),

  vProd: $("vProd"), vRet: $("vRet"), vDes: $("vDes"),

  mFilled: $("mFilled"), mFinal: $("mFinal"),
  mRecirc: $("mRecirc"), mEvap: $("mEvap"),
  mLoss:   $("mLoss"),   mYield: $("mYield"),

  tankFill: $("tankFill"), tankOutFill: $("tankOutFill"),
  tankInVolText: $("tankInVolText"), tankOutVolText: $("tankOutVolText"),

  pumpMilkBlade: $("pumpMilkBlade"), pumpHotBlade: $("pumpHotBlade"),
  refriLed: $("refriLed"), flame: $("flame"),

  retDisplay: $("retDisplay"), retFlow: $("retFlow"),

  pipeInlet: $("pipeInlet"), pipeRaw: $("pipeRaw"),
  pipeToHeat: $("pipeToHeat"), pipeToRetention: $("pipeToRetention"),
  pipeFromRetention: $("pipeFromRetention"), pipeToCooling: $("pipeToCooling"),
  pipeOut: $("pipeOut"), pipeReturn: $("pipeReturn"),
  pipeHotSupply: $("pipeHotSupply"), pipeHotReturn: $("pipeHotReturn"),
  pipeHotBack: $("pipeHotBack"),
  pipeCold: $("pipeCold"), pipeColdReturn: $("pipeColdReturn"),

  valveProd: $("valveProd"), valveRet: $("valveRet"),
  valveDes: $("valveDes"), valveFill: $("valveFill"),

  step1: $("step1"), step2: $("step2"), step3: $("step3"),
  step4: $("step4"), step5: $("step5"), step6: $("step6"),
  hint: $("hint")
};

// ----------------------------------------- Interlocks
function canStartHot()  { return state.energyOn && state.running; }
function canStartCold() { return state.energyOn && state.running; }
function canStartMilk() {
  return state.energyOn && state.running
      && state.pumpHotOn
      && state.tankInVol >= TANK_MIN_VOL
      && state.tempHeat >= T_PUMP_READY;
}
function canFill() { return state.energyOn; }

function setHint(msg) { state.hint = msg; }

function startNewBatchIfNeeded() {
  if (!state.batchActive) {
    state.vFilled = 0;
    state.vFinal  = 0;
    state.vRecirc = 0;
    state.vEvap   = 0;
    state.vLoss   = 0;
    state.tankOutVol = 0;
    state.batchActive = true;
    state.batchClosed = false;
  }
}

function closeBatch() {
  if (!state.batchActive || state.batchClosed) return;
  state.vLoss += HOLDUP_VOL;
  state.batchClosed = true;
  state.batchActive = false;
  const yieldPct = state.vFilled > 0 ? (state.vFinal / state.vFilled) * 100 : 0;
  setHint(`Lote cerrado. Procesado ${state.vFilled.toFixed(1)} L | Final ${state.vFinal.toFixed(1)} L | Rendimiento ${yieldPct.toFixed(1)}%`);
}

// ----------------------------------------- UI bindings
function bindUi() {
  el.energyBtn.onclick = () => {
    state.energyOn = !state.energyOn;
    if (!state.energyOn) resetPlant();
    else setHint("Pulsar Start.");
  };
  el.startBtn.onclick = () => {
    if (!state.energyOn) return setHint("Primero Energia.");
    state.running = true;
    setHint("Abrir V. Llenado y luego Calefactor.");
  };
  el.stopBtn.onclick = () => {
    state.running = false;
    state.fillOn = state.pumpMilkOn = state.pumpHotOn = state.pumpColdOn = false;
    setHint("Planta detenida.");
  };
  el.modeBtn.onclick = () => {
    state.mode = state.mode === "production" ? "cip" : "production";
    if (state.mode === "cip") { state.cipStep = 0; state.cipTime = CIP_STEPS[0].s; }
    else { state.cipStep = 0; state.cipTime = 0; }
  };

  el.fillBtn.onclick = () => {
    if (!canFill()) return setHint("Energia debe estar ON.");
    if (!state.fillOn) startNewBatchIfNeeded();
    state.fillOn = !state.fillOn;
  };
  el.hotPumpBtn.onclick = () => {
    if (!canStartHot()) return setHint("Energia + Start antes del Calefactor.");
    state.pumpHotOn = !state.pumpHotOn;
  };
  el.coldPumpBtn.onclick = () => {
    if (!canStartCold()) return setHint("Energia + Start antes del Refrigerador.");
    state.pumpColdOn = !state.pumpColdOn;
  };
  el.milkPumpBtn.onclick = () => {
    if (state.pumpMilkOn) { state.pumpMilkOn = false; return; }
    if (!state.energyOn || !state.running) return setHint("Falta Start.");
    if (!state.pumpHotOn)                  return setHint("Calefactor debe estar ON.");
    if (state.tankInVol < TANK_MIN_VOL)    return setHint(`Nivel < ${TANK_MIN_VOL} L. Abrir V. Llenado.`);
    if (state.tempHeat < T_PUMP_READY)     return setHint(`Esperar T calentamiento >= ${T_PUMP_READY} C.`);
    state.pumpMilkOn = true;
    setHint("Bomba de producto activa. Esperando criterio de pasteurizacion...");
  };

  el.resetBatchBtn.onclick = () => {
    state.tankInVol = 0;
    state.tankOutVol = 0;
    state.vFilled = state.vFinal = state.vRecirc = state.vEvap = state.vLoss = 0;
    state.batchActive = state.batchClosed = false;
    state.holdTimer = 0;
    setHint("Lote reiniciado.");
  };

  el.targetSlider.oninput = () => {
    state.targetFillVol = parseFloat(el.targetSlider.value);
    el.targetVal.textContent = state.targetFillVol.toFixed(0);
  };
  el.flowSlider.oninput = () => {
    state.flowRate = parseFloat(el.flowSlider.value);
    el.flowVal.textContent = state.flowRate.toFixed(2);
  };
}

function resetPlant() {
  state.running = false;
  state.fillOn = state.pumpMilkOn = state.pumpHotOn = state.pumpColdOn = false;
  state.tempHeat = 20; state.tempHold = 20; state.tempOut = 13.6; state.tempBoiler = 20;
  state.holdTimer = 0;
  state.vProd = state.vRet = state.vDes = false;
  state.alarm = false; state.lowTempAcc = 0;
  state.cipStep = 0; state.cipTime = 0;
  setHint("Energia OFF.");
}

// ----------------------------------------- Modelo de proceso
function step(dt) {
  if (!state.energyOn) return;

  // ---------- llenado del tanque (controlado por slider)
  if (state.fillOn) {
    const target = Math.min(state.targetFillVol, TANK_IN_MAX);
    const room   = target - state.tankInVol;
    if (room > 0) {
      const delta = Math.min(FILL_RATE * dt, room);
      state.tankInVol += delta;
      state.vFilled   += delta;
    } else {
      state.fillOn = false;
      setHint(`Tanque cargado a ${state.tankInVol.toFixed(1)} L. Encender Calefactor.`);
    }
  }

  if (!state.running) return;

  // ---------- modo CIP
  if (state.mode === "cip") {
    if (state.cipStep < CIP_STEPS.length) {
      state.cipTime -= dt;
      if (state.cipTime <= 0) {
        state.cipStep++;
        if (state.cipStep < CIP_STEPS.length) state.cipTime = CIP_STEPS[state.cipStep].s;
        else state.running = false;
      }
    }
    return;
  }

  // ---------- caldera
  const tBoilerTarget = state.pumpHotOn ? 95 : 25;
  state.tempBoiler += (tBoilerTarget - state.tempBoiler) * Math.min(1, 0.4 * dt);

  // ---------- intercambiador
  let heatTarget = 20;
  if (state.pumpHotOn) heatTarget = state.tempBoiler - 8;
  if (state.pumpMilkOn && state.pumpHotOn) heatTarget = Math.min(heatTarget, SP_HEAT + 2);
  state.tempHeat += (heatTarget - state.tempHeat) * Math.min(1, 0.5 * dt);
  state.tempHold = state.tempHeat - 0.3;

  // ---------- temporizador de retencion
  if (state.pumpMilkOn && state.tempHold >= SP_HOLD_MIN) state.holdTimer += dt;
  else if (state.pumpMilkOn) state.holdTimer = Math.max(0, state.holdTimer - dt * 2);
  else state.holdTimer = 0;

  const valid = state.tempHold >= SP_HOLD_MIN && state.holdTimer >= SP_HOLD_S;

  // ---------- valvulas (logica HTST)
  if (!state.pumpMilkOn) {
    state.vProd = state.vRet = state.vDes = false;
  } else if (valid) {
    state.vProd = true; state.vRet = false; state.vDes = false;
  } else {
    state.vProd = false; state.vRet = true; state.vDes = true;
    if (state.holdTimer < SP_HOLD_S && state.tempHold >= SP_HOLD_MIN)
      setHint(`Acumulando tiempo de retencion (${state.holdTimer.toFixed(1)}/${SP_HOLD_S} s)...`);
  }

  // ---------- BALANCE VOLUMETRICO ----------
  if (state.pumpMilkOn) {
    const draw = Math.min(state.flowRate * dt, state.tankInVol);
    state.tankInVol -= draw;
    if (state.vProd) {
      const ev = draw * EVAP_FACTOR;
      const toFinal = draw - ev;
      const room = TANK_OUT_MAX - state.tankOutVol;
      const accepted = Math.min(toFinal, room);
      state.tankOutVol += accepted;
      state.vFinal     += accepted;
      state.vEvap      += ev;
      if (accepted < toFinal) setHint("Tanque final lleno. Detener bomba.");
    } else {
      // recirculacion (V.Retorno + V.Desviacion abiertas)
      state.tankInVol = Math.min(TANK_IN_MAX, state.tankInVol + draw);
      state.vRecirc  += draw;
    }
  }

  // ---------- enfriamiento de salida
  let outTarget;
  if (!state.pumpMilkOn || !state.vProd) outTarget = state.tempOut;
  else if (state.pumpColdOn)             outTarget = SP_OUT;
  else                                   outTarget = 18;
  state.tempOut += (outTarget - state.tempOut) * Math.min(1, 0.6 * dt);

  // ---------- alarmas
  if (state.pumpMilkOn && state.tempHold < (SP_HOLD_MIN - 2)) state.lowTempAcc += dt;
  else state.lowTempAcc = 0;
  state.alarm = state.lowTempAcc > 8;
  if (state.alarm) setHint("ALARMA: T_hold baja. Producto se desvia automaticamente.");

  // ---------- fin de lote por tanque vacio
  if (state.tankInVol <= 0.05 && state.pumpMilkOn) {
    state.tankInVol = 0;
    state.pumpMilkOn = false;
    closeBatch();
  }
}

// ----------------------------------------- Render helpers
function setPipe(node, baseClass, on, opts = {}) {
  let cls = "pipe " + baseClass;
  if (!on) cls += " off";
  else {
    cls += " flow";
    if (opts.fast)    cls += " fast";
    if (opts.slow)    cls += " slow";
    if (opts.reverse) cls += " reverse";
  }
  node.setAttribute("class", cls);
}
function setValve(node, open, used) {
  node.classList.remove("open", "closed");
  if (!used) return;
  node.classList.add(open ? "open" : "closed");
}
function setStep(node, st) {
  node.classList.remove("active", "done");
  if (st === "done") node.classList.add("done");
  else if (st === "active") node.classList.add("active");
}

function renderTanks() {
  // tanque entrada: rect base y=305..455 (h=150 px) <-> 0..100 L
  const fIn = state.tankInVol / TANK_IN_MAX;
  const fillH = 150 * Math.min(1, Math.max(0, fIn));
  el.tankFill.setAttribute("y", (305 + 150 - fillH).toFixed(1));
  el.tankFill.setAttribute("height", fillH.toFixed(1));

  // tanque final: rect base y=60..150 (h=90 px) <-> 0..150 L
  const fOut = state.tankOutVol / TANK_OUT_MAX;
  const outH = 90 * Math.min(1, Math.max(0, fOut));
  el.tankOutFill.setAttribute("y", (60 + 90 - outH).toFixed(1));
  el.tankOutFill.setAttribute("height", outH.toFixed(1));

  el.tankInVolText .textContent = `${state.tankInVol.toFixed(1)} L`;
  el.tankOutVolText.textContent = `${state.tankOutVol.toFixed(1)} L`;
}

function renderUi() {
  el.energyBtn.textContent = `1. Energia: ${state.energyOn ? "ON" : "OFF"}`;
  el.modeBtn.textContent   = `Modo: ${state.mode === "production" ? "Produccion" : "CIP"}`;

  el.fillBtn    .classList.toggle("on", state.fillOn);
  el.hotPumpBtn .classList.toggle("on", state.pumpHotOn);
  el.coldPumpBtn.classList.toggle("on", state.pumpColdOn);
  el.milkPumpBtn.classList.toggle("on", state.pumpMilkOn);
  el.milkPumpBtn.classList.toggle("disabled", !canStartMilk() && !state.pumpMilkOn);

  el.heatDisplay.textContent = `${state.tempHeat.toFixed(1)} \u00B0C`;
  el.heatTemp.textContent    = `${state.tempHeat.toFixed(1)} C`;
  el.holdTemp.textContent    = `${state.tempHold.toFixed(1)} C`;
  el.outTemp.textContent     = `${state.tempOut.toFixed(1)} C`;
  el.holdTime.textContent    = `${state.holdTimer.toFixed(1)} s`;
  el.retDisplay.textContent  = state.tempHold.toFixed(0);

  // metricas de lote
  el.mFilled.textContent = `${state.vFilled.toFixed(1)} L`;
  el.mFinal .textContent = `${state.vFinal .toFixed(1)} L`;
  el.mRecirc.textContent = `${state.vRecirc.toFixed(1)} L`;
  el.mEvap  .textContent = `${state.vEvap  .toFixed(3)} L`;
  el.mLoss  .textContent = `${state.vLoss  .toFixed(1)} L`;
  if (state.vFilled > 0) {
    const y = (state.vFinal / state.vFilled) * 100;
    el.mYield.textContent = `${y.toFixed(1)} %`;
  } else {
    el.mYield.textContent = "-- %";
  }

  // valvulas (texto panel)
  el.vProd.textContent = state.vProd ? "ABIERTA" : "CERRADA";
  el.vRet .textContent = state.vRet  ? "ABIERTA" : "CERRADA";
  el.vDes .textContent = state.vDes  ? "ABIERTA" : "CERRADA";
  el.vProd.className = state.vProd ? "ok" : "";
  el.vRet .className = state.vRet  ? "ok" : "";
  el.vDes .className = state.vDes  ? "ok" : "";

  // alarma
  el.alarm.textContent = state.alarm ? "ALARMA" : "OK";
  el.alarm.className   = state.alarm ? "alarm"  : "ok";

  // CIP
  if (state.mode === "cip" && state.cipStep < CIP_STEPS.length)
    el.cip.textContent = `${CIP_STEPS[state.cipStep].name} (${Math.ceil(state.cipTime)} s)`;
  else el.cip.textContent = "N/A";

  // bombas y flama
  el.pumpMilkBlade.classList.toggle("spin", state.pumpMilkOn);
  el.pumpHotBlade .classList.toggle("spin", state.pumpHotOn);
  el.refriLed     .classList.toggle("on",   state.pumpColdOn);
  el.flame        .classList.toggle("on",   state.pumpHotOn && state.energyOn && state.running);

  // valvulas SVG
  setValve(el.valveFill, state.fillOn,  state.energyOn);
  setValve(el.valveProd, state.vProd,   state.pumpMilkOn);
  setValve(el.valveRet,  state.vRet,    state.pumpMilkOn);
  setValve(el.valveDes,  state.vDes,    state.pumpMilkOn);

  // tuberias
  const milkRunning = state.pumpMilkOn && state.energyOn && state.running;
  const valid       = state.vProd;

  setPipe(el.pipeInlet, "milk", state.fillOn);
  setPipe(el.pipeRaw,   "milk", milkRunning);

  let toHeatClass = "milk-warm";
  if (state.tempHeat >= SP_HEAT - 5) toHeatClass = "milk-hot";
  else if (!state.pumpHotOn)         toHeatClass = "milk";
  setPipe(el.pipeToHeat, toHeatClass, milkRunning);

  setPipe(el.pipeToRetention,   "milk-hot", milkRunning && state.tempHeat > 60);
  setPipe(el.pipeFromRetention, "milk-hot", milkRunning && state.tempHeat > 60);
  setPipe(el.pipeToCooling,     "milk-warm", milkRunning && valid);
  setPipe(el.pipeOut,           "milk-cold", milkRunning && valid);
  setPipe(el.pipeReturn,        "milk-warm", milkRunning && state.vRet);

  setPipe(el.pipeHotSupply, "water-hot", state.pumpHotOn);
  setPipe(el.pipeHotReturn, "water-hot", state.pumpHotOn);
  setPipe(el.pipeHotBack,   "water-hot", state.pumpHotOn);
  setPipe(el.pipeCold,       "water-cold", state.pumpColdOn);
  setPipe(el.pipeColdReturn, "water-cold", state.pumpColdOn);

  el.retFlow.classList.toggle("on", milkRunning && state.tempHeat > 60);

  renderTanks();

  // pasos
  const s1 = state.energyOn && state.running;
  const s2 = state.tankInVol >= TANK_MIN_VOL;
  const s3 = state.pumpHotOn && state.tempHeat >= T_PUMP_READY;
  const s4 = state.pumpColdOn;
  const s5 = state.pumpMilkOn;
  const s6 = state.vProd;
  setStep(el.step1, s1 ? "done" : "active");
  setStep(el.step2, !s1 ? "" : (s2 ? "done" : "active"));
  setStep(el.step3, !s2 ? "" : (s3 ? "done" : "active"));
  setStep(el.step4, !s3 ? "" : (s4 ? "done" : "active"));
  setStep(el.step5, !s4 ? "" : (s5 ? "done" : "active"));
  setStep(el.step6, !s5 ? "" : (s6 ? "done" : "active"));

  el.hint.textContent = state.hint || "";
}

bindUi();
// init slider displays
el.targetVal.textContent = state.targetFillVol.toFixed(0);
el.flowVal.textContent   = state.flowRate.toFixed(2);
renderUi();

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.2, (now - last) / 1000);
  last = now;
  step(dt);
  renderUi();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
