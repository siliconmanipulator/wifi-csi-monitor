"use strict";

const $ = id => document.getElementById(id);
const interval = 250;
const historySize = 120;
const baselineSize = 32;
let history, baseline, lastFrame, samples, format, lastPacket, packetCount, resetAt;
let mode = "demo";
let recentMotion = [];
let reader, port, stopping = false;

function reset() {
  recentMotion = [];
  history = [];
  baseline = [];
  lastFrame = null;
  samples = [];
  format = null;
  lastPacket = 0;
  packetCount = 0;
  resetAt = performance.now();
}
reset();

function parse(line) {
  const match = line.trim().match(/^CSI_DATA,([^\[]+)"(\[.*\])"$/);
  if (!match) return null;
  const fields = match[1].split(",");
  const len = Number(fields.at(-3));
  const firstInvalid = fields.at(-2);
  if (fields.length !== 24 || fields.at(-1) !== "" || !["0", "1"].includes(firstInvalid)) return null;
  let iq;
  try { iq = JSON.parse(match[2]); } catch { return null; }
  if (!Array.isArray(iq) || iq.length !== len || len < 16 || len > 1024 ||
      len % 2 || !iq.every(value => Number.isInteger(value) && value >= -32768 && value <= 32767)) return null;
  const values = [];
  for (let i = firstInvalid === "1" ? 4 : 0; i < len; i += 2) {
    values.push(Math.hypot(iq[i], iq[i + 1]));
  }
  return {values, key: [fields[1], fields[4], fields[5], fields[7], fields[16], fields[19], len, firstInvalid].join("/")};
}

function consume({values, key}) {
  if (format && key !== format) return;
  if (!format) format = key;
  packetCount++;
  if (lastFrame && performance.now() - lastPacket < 2000 && samples.length < 512) {
    const delta = values.map((value, i) => Math.min(1,
      Math.abs(value - lastFrame[i]) / Math.max(8, value + lastFrame[i])));
    samples.push(delta);
  }
  lastFrame = values;
  lastPacket = performance.now();
}

function draw(threshold) {
  const timeline = $("timeline");
  const heatmap = $("heatmap");
  const trace = timeline.getContext("2d");
  const heat = heatmap.getContext("2d");
  const {width, height} = timeline;
  const step = width / historySize;
  trace.clearRect(0, 0, width, height);
  heat.clearRect(0, 0, width, height);
  trace.strokeStyle = "#263545";
  for (let y = 1; y < 5; y++) trace.strokeRect(0, height * y / 5, width, 0.5);
  const signalY = value => height * (1 - Math.min(1, value * 4));
  if (threshold !== null) {
    trace.strokeStyle = "#998056";
    trace.strokeRect(0, signalY(threshold), width, 0.5);
  }
  trace.beginPath();
  let previous = false;
  history.forEach((sample, index) => {
    const x = (historySize - history.length + index) * step;
    if (!sample) {
      previous = false;
      return;
    }
    const y = signalY(sample.score);
    if (previous) trace.lineTo(x, y);
    else trace.moveTo(x, y);
    previous = true;
    const row = height / sample.bins.length;
    sample.bins.forEach((value, bin) => {
      const intensity = Math.min(1, value * 3);
      heat.fillStyle = `hsl(${230 - 185 * intensity} 75% ${14 + 55 * intensity}%)`;
      heat.fillRect(x, height - (bin + 1) * row, Math.ceil(step), Math.ceil(row));
    });
  });
  trace.strokeStyle = "#6ee7cc";
  trace.lineWidth = 2;
  trace.stroke();
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
setInterval(() => {
  const now = performance.now();
  if (mode === "demo") {
    const t = (now - resetAt) / 1000;
    const movement = Math.max(0, Math.sin(t * .61 - 5)) * (t > 9 ? 15 : 0);
    for (let frame = 0; frame < 8; frame++) {
      const values = Array.from({length: 62}, (_, bin) =>
        26 + 10 * Math.sin(bin * .22) + Math.random() +
        movement * Math.sin(bin * .38 + frame * .8 + t));
      consume({values, key: "demo"});
    }
  }
  let sample = null;
  if (samples.length) {
    const bins = samples[0].map((_, index) => mean(samples.map(packet => packet[index])));
    sample = {bins, score: mean(bins)};
    if (baseline.length < baselineSize) baseline.push(sample.score);
  }
  const center = baseline.length ? mean(baseline) : 0;
  const deviation = baseline.length ? Math.sqrt(mean(baseline.map(value => (value - center) ** 2))) : 0;
  const threshold = baseline.length === baselineSize ? center + Math.max(.015, 4 * deviation) : null;
  history.push(sample);
  if (history.length > historySize) history.shift();
  $("score").textContent = sample ? (sample.score * 100).toFixed(2) + "%" : "—";
  $("rate").textContent = packetCount * (1000 / interval) + " / s";
  packetCount = 0;
  if (threshold !== null && sample) {
    recentMotion.push(sample.score > threshold);
    if (recentMotion.length > 3) recentMotion.shift();
  } else {
    recentMotion = [];
  }
  $("activity").textContent = !sample ? "Waiting for CSI" :
    threshold === null ? `Calibrating ${baseline.length}/${baselineSize}` :
    recentMotion.filter(Boolean).length >= 2 ? "Motion detected" : "Quiet";
  if (mode === "live") $("status").textContent = now - lastPacket < 2000 && lastPacket ?
    "Live · ESP32 CSI" : "Serial open · waiting for matching CSI";
  samples = [];
  draw(threshold);
}, interval);

$("calibrate").onclick = reset;
$("demo").onclick = () => {
  if (port) return;
  mode = "demo";
  reset();
  $("status").textContent = "Demo · simulated CSI";
};
$("connect").onclick = async () => {
  if (port && reader) {
    stopping = true;
    await reader.cancel();
    return;
  }
  if (!navigator.serial) {
    $("status").textContent = "USB serial requires desktop Chrome or Edge on HTTPS or localhost.";
    return;
  }
  mode = "idle";
  reset();
  $("demo").disabled = true;
  $("status").textContent = "Select your ESP32 USB serial port";
  $("connect").disabled = true;
  try {
    const selected = await navigator.serial.requestPort();
    await selected.open({baudRate: 921600});
    port = selected;
    reader = port.readable.getReader();
    stopping = false;
    mode = "live";
    reset();
    $("demo").disabled = true;
    $("connect").textContent = "Disconnect";
    $("connect").disabled = false;
    const decoder = new TextDecoder();
    let pending = "";
    while (!stopping) {
      const {value, done} = await reader.read();
      if (done) break;
      const lines = (pending + decoder.decode(value, {stream: true})).split("\n");
      pending = lines.pop();
      if (pending.length > 8192) pending = "";
      for (const line of lines) {
        const packet = parse(line);
        if (packet) consume(packet);
      }
    }
    $("status").textContent = "Serial disconnected";
  } catch (error) {
    $("status").textContent = !port && error.name === "NotFoundError" ?
      "No port selected · choose your ESP32 USB serial port or run demo" :
      "Serial · " + error.message;
  } finally {
    const wasLive = mode === "live";
    if (reader) reader.releaseLock();
    if (port) {
      try { await port.close(); } catch { /* The USB device may already be unplugged. */ }
    }
    reader = port = null;
    if (wasLive) {
      mode = "idle";
      reset();
    }
    $("connect").textContent = "Connect ESP32";
    $("connect").disabled = false;
    $("demo").disabled = false;
  }
};
