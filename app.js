const DISP_BUCKETS = [
  { key: "b0", label: "0-16", min: 0, max: 16, color: "#3b82f6" },
  { key: "b1", label: "16-32", min: 16, max: 32, color: "#22c55e" },
  { key: "b2", label: "32-48", min: 32, max: 48, color: "#f59e0b" },
  { key: "b3", label: "48-64", min: 48, max: 64, color: "#ef4444" },
  { key: "b4", label: "64-96", min: 64, max: 96, color: "#a855f7" },
];

const OVERFLOW_BUCKET = {
  key: "overflow",
  label: ">96 / missing",
  min: 96,
  max: Infinity,
  color: "#94a3b8",
};

const DEFAULT_DISCOVER_CAMERA = {
  fx: 372.429241685,
  fy: 372.429241685,
  cx: 640.0,
  cy: 544.0,
  baseline: 0.054885186954,
};

const SAMPLE_MANIFEST_URL = "./discover_samples/manifest.json";
const MARKER_SIZE_SCALE = 0.6;
const PICK_MARKER_SIZE = 9;
const PIXEL_MATCH_TOLERANCE = 2.0;
const LARGE_FILE_WARN_BYTES = 80 * 1024 * 1024;
const TEXT_DECODER = new TextDecoder("utf-8");
const isDesktopApp = Boolean(window.pointCloudDesktop);

const state = {
  clouds: {
    left: null,
    right: null,
  },
  labels: {
    left: "GT",
    right: "Prediction",
  },
  camera: {
    eye: { x: 0.0, y: -2.2, z: 0.9 },
    up: { x: 0, y: 0, z: 1 },
    center: { x: 0, y: 0, z: 0 },
  },
  pointSize: 1.0,
  opacity: 0.85,
  theme: "dark",
  maxPoints: 40000,
  showOverflow: false,
  bucketVisibility: Object.fromEntries(
    [...DISP_BUCKETS, OVERFLOW_BUCKET].map((bucket) => [bucket.key, bucket.key !== OVERFLOW_BUCKET.key])
  ),
  samplePresets: [],
  sampleCamera: { ...DEFAULT_DISCOVER_CAMERA },
  selection: null,
  syncLocked: false,
  plotSyncHandler: null,
  plotClickHandler: null,
};

const elements = {
  plot: document.getElementById("plot"),
  messageBar: document.getElementById("messageBar"),
  summaryPanel: document.getElementById("summaryPanel"),
  selectionPanel: document.getElementById("selectionPanel"),
  sampleSelect: document.getElementById("sampleSelect"),
  loadSampleButton: document.getElementById("loadSampleButton"),
  leftFileInput: document.getElementById("leftFileInput"),
  rightFileInput: document.getElementById("rightFileInput"),
  leftLabelInput: document.getElementById("leftLabelInput"),
  rightLabelInput: document.getElementById("rightLabelInput"),
  leftDropZone: document.getElementById("leftDropZone"),
  rightDropZone: document.getElementById("rightDropZone"),
  leftStatus: document.getElementById("leftStatus"),
  rightStatus: document.getElementById("rightStatus"),
  fxInput: document.getElementById("fxInput"),
  fyInput: document.getElementById("fyInput"),
  cxInput: document.getElementById("cxInput"),
  cyInput: document.getElementById("cyInput"),
  baselineInput: document.getElementById("baselineInput"),
  maxPointsInput: document.getElementById("maxPointsInput"),
  showOverflowInput: document.getElementById("showOverflowInput"),
  pointSizeInput: document.getElementById("pointSizeInput"),
  pointSizeValue: document.getElementById("pointSizeValue"),
  opacityInput: document.getElementById("opacityInput"),
  opacityValue: document.getElementById("opacityValue"),
  themeSelect: document.getElementById("themeSelect"),
  renderButton: document.getElementById("renderButton"),
  resetCameraButton: document.getElementById("resetCameraButton"),
  topViewButton: document.getElementById("topViewButton"),
  screenshotButton: document.getElementById("screenshotButton"),
  bucketControls: document.getElementById("bucketControls"),
  plotShell: document.getElementById("plotShell"),
};

function initialize() {
  elements.fxInput.value = String(DEFAULT_DISCOVER_CAMERA.fx);
  elements.fyInput.value = String(DEFAULT_DISCOVER_CAMERA.fy);
  elements.cxInput.value = String(DEFAULT_DISCOVER_CAMERA.cx);
  elements.cyInput.value = String(DEFAULT_DISCOVER_CAMERA.cy);
  elements.baselineInput.value = String(DEFAULT_DISCOVER_CAMERA.baseline);
  populateSampleOptions([]);
  buildBucketControls();
  bindEvents();
  updateTheme(state.theme);
  renderEmptyPlot();
  void loadBuiltInSamples();
}

function populateSampleOptions(samples) {
  elements.sampleSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = samples.length ? "选择内置样例" : "内置样例加载中";
  elements.sampleSelect.appendChild(placeholder);

  samples.forEach((sample) => {
    const option = document.createElement("option");
    option.value = sample.id;
    option.textContent = sample.title;
    elements.sampleSelect.appendChild(option);
  });
}

async function loadBuiltInSamples() {
  try {
    const manifest = await readJsonAsset(SAMPLE_MANIFEST_URL);
    state.samplePresets = manifest.samples || [];

    if (manifest.camera?.fx && manifest.camera?.baseline) {
      state.sampleCamera = {
        fx: Number(manifest.camera.fx),
        fy: Number(manifest.camera.fy ?? manifest.camera.fx),
        cx: Number(manifest.camera.cx ?? DEFAULT_DISCOVER_CAMERA.cx),
        cy: Number(manifest.camera.cy ?? DEFAULT_DISCOVER_CAMERA.cy),
        baseline: Number(manifest.camera.baseline),
      };
      setCameraInputs(state.sampleCamera);
    }

    populateSampleOptions(state.samplePresets);
    if (state.samplePresets.length) {
      elements.sampleSelect.value = state.samplePresets[0].id;
      await loadSample(state.samplePresets[0]);
    } else {
      setMessage("未找到 DiscoverStereo 内置样例。", "warn");
    }
  } catch (error) {
    console.error(error);
    setMessage(`内置样例清单加载失败：${error.message}`, "warn");
    populateSampleOptions([]);
  }
}

function buildBucketControls() {
  const buckets = [...DISP_BUCKETS, OVERFLOW_BUCKET];
  elements.bucketControls.innerHTML = "";
  buckets.forEach((bucket) => {
    const row = document.createElement("label");
    row.className = "bucket-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.bucketVisibility[bucket.key];
    checkbox.dataset.bucketKey = bucket.key;
    if (bucket.key === OVERFLOW_BUCKET.key) {
      checkbox.checked = false;
    }

    const swatch = document.createElement("span");
    swatch.className = "bucket-swatch";
    swatch.style.background = bucket.color;

    const text = document.createElement("span");
    text.className = "bucket-label";
    text.textContent = bucket.label;

    const count = document.createElement("span");
    count.className = "bucket-count";
    count.id = `bucket-count-${bucket.key}`;
    count.textContent = "-- / --";

    row.append(checkbox, swatch, text, count);
    elements.bucketControls.appendChild(row);
  });
}

function bindEvents() {
  elements.leftFileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      loadCloudFromLocalFile(file, "left");
    }
  });

  elements.rightFileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      loadCloudFromLocalFile(file, "right");
    }
  });

  elements.leftLabelInput.addEventListener("input", () => {
    state.labels.left = elements.leftLabelInput.value || "GT";
    renderIfReady();
  });

  elements.rightLabelInput.addEventListener("input", () => {
    state.labels.right = elements.rightLabelInput.value || "Prediction";
    renderIfReady();
  });

  elements.pointSizeInput.addEventListener("input", () => {
    state.pointSize = Number(elements.pointSizeInput.value);
    elements.pointSizeValue.textContent = formatPointSize(state.pointSize);
    updateMarkerStyle();
  });

  elements.opacityInput.addEventListener("input", () => {
    state.opacity = Number(elements.opacityInput.value);
    elements.opacityValue.textContent = state.opacity.toFixed(2);
    updateMarkerStyle();
  });

  elements.themeSelect.addEventListener("change", () => {
    updateTheme(elements.themeSelect.value);
    renderIfReady();
  });

  elements.maxPointsInput.addEventListener("change", () => {
    state.maxPoints = Math.max(1000, Number(elements.maxPointsInput.value) || 40000);
    if (state.clouds.left || state.clouds.right) {
      reloadCloudsWithCurrentSettings();
    }
  });

  [elements.fxInput, elements.fyInput, elements.cxInput, elements.cyInput, elements.baselineInput].forEach((input) => {
    input.addEventListener("change", () => {
      state.selection = null;
    });
  });

  elements.showOverflowInput.addEventListener("change", () => {
    state.showOverflow = elements.showOverflowInput.checked;
    state.bucketVisibility[OVERFLOW_BUCKET.key] = state.showOverflow;
    const overflowCheckbox = elements.bucketControls.querySelector(
      `input[data-bucket-key="${OVERFLOW_BUCKET.key}"]`
    );
    if (overflowCheckbox) {
      overflowCheckbox.checked = state.showOverflow;
    }
    renderIfReady();
  });

  elements.bucketControls.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") {
      return;
    }
    state.bucketVisibility[input.dataset.bucketKey] = input.checked;
    if (input.dataset.bucketKey === OVERFLOW_BUCKET.key) {
      state.showOverflow = input.checked;
      elements.showOverflowInput.checked = input.checked;
    }
    renderIfReady();
  });

  elements.renderButton.addEventListener("click", () => {
    reloadCloudsWithCurrentSettings();
  });

  elements.resetCameraButton.addEventListener("click", () => {
    state.camera = defaultCamera();
    renderIfReady();
  });

  elements.topViewButton.addEventListener("click", () => {
    state.camera = topCamera();
    renderIfReady();
  });

  elements.screenshotButton.addEventListener("click", async () => {
    await exportScreenshot();
  });

  elements.loadSampleButton.addEventListener("click", async () => {
    const sample = state.samplePresets.find((item) => item.id === elements.sampleSelect.value);
    if (!sample) {
      setMessage("请先选择一个样例。", "warn");
      return;
    }
    await loadSample(sample);
  });

  bindDropZone(elements.leftDropZone, "left");
  bindDropZone(elements.rightDropZone, "right");
}

function bindDropZone(dropZone, side) {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragover");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      loadCloudFromLocalFile(file, side);
    }
  });
}

function defaultCamera() {
  return {
    eye: { x: 0.0, y: -2.2, z: 0.9 },
    up: { x: 0, y: 0, z: 1 },
    center: { x: 0, y: 0, z: 0 },
  };
}

function topCamera() {
  return {
    eye: { x: 0.0, y: 0.01, z: 3.0 },
    up: { x: 0, y: -1, z: 0 },
    center: { x: 0, y: 0, z: 0 },
  };
}

function getCameraParams() {
  const fx = Number(elements.fxInput.value);
  const fy = Number(elements.fyInput.value);
  const cx = Number(elements.cxInput.value);
  const cy = Number(elements.cyInput.value);
  const baseline = Number(elements.baselineInput.value);
  return { fx, fy, cx, cy, baseline };
}

function setCameraInputs(camera) {
  elements.fxInput.value = String(camera.fx);
  elements.fyInput.value = String(camera.fy ?? camera.fx);
  elements.cxInput.value = String(camera.cx ?? DEFAULT_DISCOVER_CAMERA.cx);
  elements.cyInput.value = String(camera.cy ?? DEFAULT_DISCOVER_CAMERA.cy);
  elements.baselineInput.value = String(camera.baseline);
}

async function loadSample(sample) {
  setCameraInputs(state.sampleCamera);
  elements.leftLabelInput.value = sample.left_label;
  elements.rightLabelInput.value = sample.right_label;
  state.labels.left = sample.left_label;
  state.labels.right = sample.right_label;
  state.selection = null;
  setMessage(`加载样例 ${sample.sample_id} 中。`, "info");

  try {
    const [leftText, rightText] = await Promise.all([
      readTextAsset(sample.left_url),
      readTextAsset(sample.right_url),
    ]);

    state.clouds.left = buildCloudState({
      name: `${sample.id}_left.json`,
      source: { text: leftText },
      sourceType: "sample",
      side: "left",
    });
    state.clouds.right = buildCloudState({
      name: `${sample.id}_right.json`,
      source: { text: rightText },
      sourceType: "sample",
      side: "right",
    });
    updateStatus("left");
    updateStatus("right");
    renderIfReady();
    setMessage(`样例 ${sample.title} 已加载。`, "ok");
  } catch (error) {
    console.error(error);
    setMessage(`样例加载失败：${error.message}`, "error");
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} 返回 ${response.status}`);
  }
  return await response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} 返回 ${response.status}`);
  }
  return await response.text();
}

function normalizeAssetPath(assetPath) {
  return assetPath.replace(/^\.\//, "");
}

async function readJsonAsset(assetPath) {
  const normalizedPath = normalizeAssetPath(assetPath);
  if (isDesktopApp) {
    return await window.pointCloudDesktop.readJson(normalizedPath);
  }
  return await fetchJson(normalizedPath);
}

async function readTextAsset(assetPath) {
  const normalizedPath = normalizeAssetPath(assetPath);
  if (isDesktopApp) {
    return await window.pointCloudDesktop.readText(normalizedPath);
  }
  return await fetchText(normalizedPath);
}

async function loadCloudFromLocalFile(file, side) {
  try {
    state.selection = null;
    updateSideStatus(side, `读取 ${file.name} (${formatBytes(file.size)})...`);
    setMessage(`读取 ${file.name} 中。`, "info");
    await waitForPaint();
    const source = await readLocalFileSource(file);

    updateSideStatus(side, `解析 ${file.name}...`);
    setMessage(
      file.size >= LARGE_FILE_WARN_BYTES
        ? `解析大文件 ${file.name} 中，会按“最大点数 / 云”抽样显示。`
        : `解析 ${file.name} 中。`,
      file.size >= LARGE_FILE_WARN_BYTES ? "warn" : "info"
    );
    await waitForPaint();

    const startedAt = performance.now();
    const cloud = buildCloudState({
      name: file.name,
      source,
      sourceType: "file",
      side,
    });
    state.clouds[side] = cloud;
    if (side === "left" && !elements.leftLabelInput.value.trim()) {
      elements.leftLabelInput.value = file.name;
      state.labels.left = file.name;
    }
    if (side === "right" && !elements.rightLabelInput.value.trim()) {
      elements.rightLabelInput.value = file.name;
      state.labels.right = file.name;
    }
    updateStatus(side);
    renderIfReady();
    setMessage(
      `${file.name} 已加载：显示 ${cloud.pointCount}/${cloud.rawCount} 点，用时 ${formatDuration(performance.now() - startedAt)}。`,
      "ok"
    );
  } catch (error) {
    console.error(error);
    updateSideStatus(side, `加载失败：${error.message}`);
    setMessage(`解析失败：${error.message}`, "error");
  }
}

async function readLocalFileSource(file) {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "ply") {
    return { arrayBuffer: await file.arrayBuffer() };
  }
  return { text: await file.text() };
}

function parseAsciiPly(text, maxPoints = Infinity) {
  const lines = text.replace(/\r/g, "").split("\n");
  if (lines[0]?.trim() !== "ply") {
    throw new Error("PLY 头缺失");
  }

  let format = null;
  let vertexCount = null;
  const properties = [];
  let headerEnd = -1;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }
    if (line.startsWith("format ")) {
      format = line.split(/\s+/)[1];
    } else if (line.startsWith("element vertex ")) {
      vertexCount = Number(line.split(/\s+/)[2]);
    } else if (line.startsWith("property ")) {
      const parts = line.split(/\s+/);
      properties.push(parts[parts.length - 1]);
    } else if (line === "end_header") {
      headerEnd = index;
      break;
    }
  }

  if (format !== "ascii") {
    throw new Error(`当前只支持 ascii PLY，收到 ${format || "unknown"}`);
  }
  if (!Number.isFinite(vertexCount) || headerEnd < 0) {
    throw new Error("PLY header 不完整");
  }

  const propertyIndex = Object.fromEntries(properties.map((name, index) => [name, index]));
  const required = ["x", "y", "z"];
  required.forEach((field) => {
    if (propertyIndex[field] === undefined) {
      throw new Error(`PLY 缺少 ${field} 属性`);
    }
  });

  const dispField = propertyIndex.disp !== undefined ? "disp" : propertyIndex.disparity !== undefined ? "disparity" : null;

  const x = [];
  const y = [];
  const z = [];
  const disp = [];
  const u = [];
  const v = [];
  const sourceIndex = [];
  const uField = firstExistingProperty(propertyIndex, ["u", "pixel_x", "px", "col", "column"]);
  const vField = firstExistingProperty(propertyIndex, ["v", "pixel_y", "py", "row", "line"]);
  const sampleStep = computeSampleStep(vertexCount, maxPoints);

  for (let index = 0; index < vertexCount; index += sampleStep) {
    const line = lines[headerEnd + 1 + index];
    if (!line) {
      continue;
    }
    const values = line.trim().split(/\s+/);
    x.push(Number(values[propertyIndex.x]));
    y.push(Number(values[propertyIndex.y]));
    z.push(Number(values[propertyIndex.z]));
    disp.push(dispField ? Number(values[propertyIndex[dispField]]) : Number.NaN);
    u.push(uField ? Number(values[propertyIndex[uField]]) : Number.NaN);
    v.push(vField ? Number(values[propertyIndex[vField]]) : Number.NaN);
    sourceIndex.push(index);
  }

  return { x, y, z, disp, u, v, sourceIndex, rawCount: vertexCount, sampleStep };
}

function parsePlyBuffer(arrayBuffer, maxPoints = Infinity) {
  const bytes = new Uint8Array(arrayBuffer);
  const headerEndToken = "end_header";
  const headerEndIndex = findAsciiToken(bytes, headerEndToken);
  if (headerEndIndex < 0) {
    throw new Error("PLY header 不完整：缺少 end_header");
  }

  let dataStart = headerEndIndex + headerEndToken.length;
  while (dataStart < bytes.length && bytes[dataStart] !== 10) {
    dataStart += 1;
  }
  if (bytes[dataStart] === 10) {
    dataStart += 1;
  }

  const headerText = TEXT_DECODER.decode(bytes.slice(0, dataStart));
  const header = parsePlyHeader(headerText);

  if (header.format === "ascii") {
    return parseAsciiPly(TEXT_DECODER.decode(bytes), maxPoints);
  }
  if (header.format === "binary_little_endian") {
    return parseBinaryLittleEndianPly(arrayBuffer, dataStart, header, maxPoints);
  }
  if (header.format === "binary_big_endian") {
    throw new Error("暂不支持 binary_big_endian PLY，请先转换成 binary_little_endian 或 ascii");
  }
  throw new Error(`未知 PLY 格式：${header.format || "unknown"}`);
}

function findAsciiToken(bytes, token) {
  const tokenBytes = Array.from(token).map((char) => char.charCodeAt(0));
  for (let index = 0; index <= bytes.length - tokenBytes.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < tokenBytes.length; offset += 1) {
      if (bytes[index + offset] !== tokenBytes[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return index;
    }
  }
  return -1;
}

function parsePlyHeader(headerText) {
  const lines = headerText.replace(/\r/g, "").split("\n");
  if (lines[0]?.trim() !== "ply") {
    throw new Error("PLY 头缺失");
  }

  let format = null;
  let vertexCount = null;
  let currentElement = null;
  const vertexProperties = [];

  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("comment ")) {
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts[0] === "format") {
      format = parts[1];
    } else if (parts[0] === "element") {
      currentElement = parts[1];
      if (currentElement === "vertex") {
        vertexCount = Number(parts[2]);
      }
    } else if (parts[0] === "property" && currentElement === "vertex") {
      if (parts[1] === "list") {
        throw new Error("暂不支持 vertex list property 的 PLY");
      }
      vertexProperties.push({ type: parts[1], name: parts[2] });
    } else if (parts[0] === "end_header") {
      break;
    }
  }

  if (!Number.isFinite(vertexCount) || vertexCount < 0) {
    throw new Error("PLY header 缺少有效 vertex 数量");
  }
  const propertyIndex = Object.fromEntries(vertexProperties.map((property, index) => [property.name, index]));
  ["x", "y", "z"].forEach((field) => {
    if (propertyIndex[field] === undefined) {
      throw new Error(`PLY 缺少 ${field} 属性`);
    }
  });

  return { format, vertexCount, vertexProperties, propertyIndex };
}

function parseBinaryLittleEndianPly(arrayBuffer, dataStart, header, maxPoints = Infinity) {
  const view = new DataView(arrayBuffer);
  const propertyReaders = header.vertexProperties.map((property) => {
    const reader = PLY_BINARY_READERS[property.type];
    if (!reader) {
      throw new Error(`暂不支持 PLY 属性类型：${property.type}`);
    }
    return reader;
  });
  const vertexStride = propertyReaders.reduce((sum, reader) => sum + reader.size, 0);
  const requiredBytes = dataStart + header.vertexCount * vertexStride;
  if (requiredBytes > arrayBuffer.byteLength) {
    throw new Error("PLY 二进制数据长度不足，文件可能不完整");
  }

  const x = [];
  const y = [];
  const z = [];
  const disp = [];
  const u = [];
  const v = [];
  const sourceIndex = [];
  const dispField = header.propertyIndex.disp !== undefined
    ? "disp"
    : header.propertyIndex.disparity !== undefined
      ? "disparity"
      : null;
  const uField = firstExistingProperty(header.propertyIndex, ["u", "pixel_x", "px", "col", "column"]);
  const vField = firstExistingProperty(header.propertyIndex, ["v", "pixel_y", "py", "row", "line"]);

  const sampleStep = computeSampleStep(header.vertexCount, maxPoints);
  for (let vertexIndex = 0; vertexIndex < header.vertexCount; vertexIndex += sampleStep) {
    let offset = dataStart + vertexIndex * vertexStride;
    const values = [];
    for (const reader of propertyReaders) {
      values.push(reader.read(view, offset));
      offset += reader.size;
    }

    x.push(Number(values[header.propertyIndex.x]));
    y.push(Number(values[header.propertyIndex.y]));
    z.push(Number(values[header.propertyIndex.z]));
    disp.push(dispField ? Number(values[header.propertyIndex[dispField]]) : Number.NaN);
    u.push(uField ? Number(values[header.propertyIndex[uField]]) : Number.NaN);
    v.push(vField ? Number(values[header.propertyIndex[vField]]) : Number.NaN);
    sourceIndex.push(vertexIndex);
  }

  return { x, y, z, disp, u, v, sourceIndex, rawCount: header.vertexCount, sampleStep };
}

function firstExistingProperty(propertyIndex, candidates) {
  return candidates.find((name) => propertyIndex[name] !== undefined) || null;
}

function computeSampleStep(rawCount, maxPoints) {
  const limit = Number(maxPoints);
  if (!Number.isFinite(limit) || limit <= 0 || rawCount <= limit) {
    return 1;
  }
  return Math.ceil(rawCount / limit);
}

const PLY_BINARY_READERS = {
  char: { size: 1, read: (view, offset) => view.getInt8(offset) },
  int8: { size: 1, read: (view, offset) => view.getInt8(offset) },
  uchar: { size: 1, read: (view, offset) => view.getUint8(offset) },
  uint8: { size: 1, read: (view, offset) => view.getUint8(offset) },
  short: { size: 2, read: (view, offset) => view.getInt16(offset, true) },
  int16: { size: 2, read: (view, offset) => view.getInt16(offset, true) },
  ushort: { size: 2, read: (view, offset) => view.getUint16(offset, true) },
  uint16: { size: 2, read: (view, offset) => view.getUint16(offset, true) },
  int: { size: 4, read: (view, offset) => view.getInt32(offset, true) },
  int32: { size: 4, read: (view, offset) => view.getInt32(offset, true) },
  uint: { size: 4, read: (view, offset) => view.getUint32(offset, true) },
  uint32: { size: 4, read: (view, offset) => view.getUint32(offset, true) },
  float: { size: 4, read: (view, offset) => view.getFloat32(offset, true) },
  float32: { size: 4, read: (view, offset) => view.getFloat32(offset, true) },
  double: { size: 8, read: (view, offset) => view.getFloat64(offset, true) },
  float64: { size: 8, read: (view, offset) => view.getFloat64(offset, true) },
};

function parseJsonCloud(text) {
  const payload = JSON.parse(text);
  const points = Array.isArray(payload) ? payload : payload.points;
  if (!Array.isArray(points)) {
    throw new Error("JSON 需要是数组，或包含 points 数组");
  }

  const x = [];
  const y = [];
  const z = [];
  const disp = [];
  const u = [];
  const v = [];

  points.forEach((point) => {
    if (Array.isArray(point)) {
      x.push(Number(point[0]));
      y.push(Number(point[1]));
      z.push(Number(point[2]));
      disp.push(point.length > 3 ? Number(point[3]) : Number.NaN);
      u.push(point.length > 4 ? Number(point[4]) : Number.NaN);
      v.push(point.length > 5 ? Number(point[5]) : Number.NaN);
      return;
    }

    x.push(Number(point.x));
    y.push(Number(point.y));
    z.push(Number(point.z));
    disp.push(
      point.disp !== undefined
        ? Number(point.disp)
        : point.disparity !== undefined
          ? Number(point.disparity)
          : Number.NaN
    );
    u.push(
      point.u !== undefined
        ? Number(point.u)
        : point.pixel_x !== undefined
          ? Number(point.pixel_x)
          : point.col !== undefined
            ? Number(point.col)
            : Number.NaN
    );
    v.push(
      point.v !== undefined
        ? Number(point.v)
        : point.pixel_y !== undefined
          ? Number(point.pixel_y)
          : point.row !== undefined
            ? Number(point.row)
            : Number.NaN
    );
  });

  return { x, y, z, disp, u, v };
}

function normalizeCloud(parsed, { fx, fy, cx, cy, baseline, maxPoints }) {
  const pointCount = parsed.x.length;
  const rawCount = parsed.rawCount ?? pointCount;
  const sourceSampleStep = parsed.sampleStep ?? 1;
  const step = pointCount > maxPoints ? Math.ceil(pointCount / maxPoints) : 1;
  const bucketed = Object.fromEntries(
    [...DISP_BUCKETS, OVERFLOW_BUCKET].map((bucket) => [
      bucket.key,
      { x: [], y: [], z: [], disp: [], u: [], v: [], sourceIndex: [], count: 0 },
    ])
  );
  const points = [];
  const pixelLookup = new Map();

  let dispMode = "file";
  let validDispSeen = false;
  let derivedDispSeen = false;

  const bounds = {
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
    zMin: Infinity,
    zMax: -Infinity,
  };

  let depthMin = Infinity;
  let depthMax = -Infinity;
  let depthSum = 0;
  let depthCount = 0;

  for (let index = 0; index < pointCount; index += step) {
    const x = parsed.x[index];
    const y = parsed.y[index];
    const z = parsed.z[index];

    if (![x, y, z].every(Number.isFinite)) {
      continue;
    }

    let disp = parsed.disp[index];
    if (!Number.isFinite(disp) || disp <= 0) {
      disp = Number.isFinite(fx) && Number.isFinite(baseline) && z > 0 ? (fx * baseline) / z : Number.NaN;
      if (Number.isFinite(disp) && disp > 0) {
        derivedDispSeen = true;
      }
    } else {
      validDispSeen = true;
    }

    let u = parsed.u?.[index];
    let v = parsed.v?.[index];
    if (!Number.isFinite(u) && Number.isFinite(fx) && Number.isFinite(cx) && z > 0) {
      u = (fx * x) / z + cx;
    }
    if (!Number.isFinite(v) && Number.isFinite(fy) && Number.isFinite(cy) && z > 0) {
      v = (fy * y) / z + cy;
    }

    const sourceIndex = parsed.sourceIndex?.[index] ?? index;
    const point = { x, y, z, disp, u, v, sourceIndex };
    points.push(point);
    if (Number.isFinite(u) && Number.isFinite(v)) {
      const key = pixelKey(u, v);
      const candidates = pixelLookup.get(key) || [];
      candidates.push(point);
      pixelLookup.set(key, candidates);
    }

    const bucket = findBucket(disp);
    bucketed[bucket.key].x.push(x);
    bucketed[bucket.key].y.push(y);
    bucketed[bucket.key].z.push(z);
    bucketed[bucket.key].disp.push(disp);
    bucketed[bucket.key].u.push(u);
    bucketed[bucket.key].v.push(v);
    bucketed[bucket.key].sourceIndex.push(sourceIndex);
    bucketed[bucket.key].count += 1;

    bounds.xMin = Math.min(bounds.xMin, x);
    bounds.xMax = Math.max(bounds.xMax, x);
    bounds.yMin = Math.min(bounds.yMin, y);
    bounds.yMax = Math.max(bounds.yMax, y);
    bounds.zMin = Math.min(bounds.zMin, z);
    bounds.zMax = Math.max(bounds.zMax, z);

    depthMin = Math.min(depthMin, z);
    depthMax = Math.max(depthMax, z);
    depthSum += z;
    depthCount += 1;
  }

  if (!validDispSeen && !derivedDispSeen) {
    throw new Error("未找到有效视差；请提供 disp 字段或正确设置 fx / baseline");
  }
  if (!depthCount) {
    throw new Error("点云没有有效点");
  }

  if (!validDispSeen && derivedDispSeen) {
    dispMode = "derived";
  } else if (validDispSeen && derivedDispSeen) {
    dispMode = "mixed";
  }

  return {
    dispMode,
    rawCount,
    sampleStep: sourceSampleStep * step,
    bucketed,
    points,
    pixelLookup,
    pointCount: depthCount,
    bounds,
    depthStats: {
      min: depthMin,
      max: depthMax,
      mean: depthCount ? depthSum / depthCount : Number.NaN,
    },
  };
}

function findBucket(disp) {
  if (!Number.isFinite(disp) || disp < 0) {
    return OVERFLOW_BUCKET;
  }
  const bucket = DISP_BUCKETS.find((item) => disp >= item.min && disp < item.max);
  return bucket || OVERFLOW_BUCKET;
}

function updateStatus(side) {
  const cloud = state.clouds[side];
  if (!cloud) {
    updateSideStatus(side, "未加载");
    return;
  }
  const modeLabel = cloud.dispMode === "file"
    ? "文件视差"
    : cloud.dispMode === "derived"
      ? "由深度回推"
      : "文件+回推";
  updateSideStatus(
    side,
    `${cloud.name} | ${cloud.pointCount}/${cloud.rawCount} 点${cloud.sampleStep > 1 ? ` | ${cloud.sampleStep}x 抽样` : ""} | ${modeLabel}`
  );
}

function updateSideStatus(side, text) {
  if (side === "left") {
    elements.leftStatus.textContent = text;
  } else {
    elements.rightStatus.textContent = text;
  }
}

function reloadCloudsWithCurrentSettings() {
  try {
    if (state.clouds.left) {
      state.clouds.left = buildCloudState({
        name: state.clouds.left.name,
        source: serializeCloud(state.clouds.left),
        sourceType: state.clouds.left.sourceType,
        side: "left",
      });
    }
    if (state.clouds.right) {
      state.clouds.right = buildCloudState({
        name: state.clouds.right.name,
        source: serializeCloud(state.clouds.right),
        sourceType: state.clouds.right.sourceType,
        side: "right",
      });
    }
    updateStatus("left");
    updateStatus("right");
    renderIfReady();
    setMessage("视图已按当前参数刷新。", "ok");
  } catch (error) {
    console.error(error);
    setMessage(`刷新失败：${error.message}`, "error");
  }
}

function serializeCloud(cloud) {
  if (cloud._source) {
    return cloud._source;
  }
  throw new Error("当前云缺少源数据，无法重新解析");
}

function buildCloudState({ name, source, text, sourceType, side }) {
  const normalizedSource = source || { text };
  const ext = name.toLowerCase().split(".").pop();
  let parsed;
  if (ext === "ply") {
    if (normalizedSource.arrayBuffer) {
      parsed = parsePlyBuffer(normalizedSource.arrayBuffer, state.maxPoints);
    } else {
      parsed = parseAsciiPly(normalizedSource.text, state.maxPoints);
    }
  } else if (ext === "json") {
    parsed = parseJsonCloud(normalizedSource.text);
  } else {
    throw new Error(`不支持的格式：${ext}`);
  }

  const { fx, fy, cx, cy, baseline } = getCameraParams();
  const normalized = normalizeCloud(parsed, { fx, fy, cx, cy, baseline, maxPoints: state.maxPoints });
  return {
    _source: normalizedSource,
    side,
    sourceType,
    name,
    rawCount: normalized.rawCount,
    sampleStep: normalized.sampleStep,
    dispMode: normalized.dispMode,
    bucketed: normalized.bucketed,
    points: normalized.points,
    pixelLookup: normalized.pixelLookup,
    pointCount: normalized.pointCount,
    bounds: normalized.bounds,
    depthStats: normalized.depthStats,
    fx,
    fy,
    cx,
    cy,
    baseline,
  };
}

function renderIfReady() {
  if (!state.clouds.left || !state.clouds.right) {
    renderEmptyPlot();
    updateSummary();
    updateSelectionPanel();
    return;
  }
  renderPlot();
  updateSummary();
  updateBucketCounts();
  updateSelectionPanel();
}

function renderEmptyPlot() {
  const layout = buildLayout({
    sceneBounds: defaultBounds(),
  });
  Plotly.newPlot(elements.plot, [], layout, {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["select2d", "lasso2d"],
  }).then(() => {
    bindPlotSync();
  });
}

function defaultBounds() {
  return {
    xMin: -1,
    xMax: 1,
    yMin: -1,
    yMax: 1,
    zMin: 0,
    zMax: 2,
  };
}

function renderPlot() {
  const traces = [];
  const scenes = ["scene", "scene2"];
  const clouds = [
    { key: "left", label: state.labels.left, scene: scenes[0], showLegend: true },
    { key: "right", label: state.labels.right, scene: scenes[1], showLegend: false },
  ];

  clouds.forEach((cloudMeta) => {
    const cloud = state.clouds[cloudMeta.key];
    [...DISP_BUCKETS, OVERFLOW_BUCKET].forEach((bucket) => {
      if (!state.bucketVisibility[bucket.key]) {
        return;
      }
      const chunk = cloud.bucketed[bucket.key];
      if (!chunk || chunk.count === 0) {
        return;
      }

      traces.push({
        type: "scatter3d",
        mode: "markers",
        scene: cloudMeta.scene,
        name: bucket.label,
        legendgroup: bucket.key,
        showlegend: cloudMeta.showLegend,
        hovertemplate:
          `${cloudMeta.label}<br>x=%{x:.3f}<br>y=%{y:.3f}<br>z=%{z:.3f}<br>disp=%{customdata[0]:.2f}<br>pixel=(%{customdata[1]:.1f}, %{customdata[2]:.1f})<extra>${bucket.label}</extra>`,
        x: chunk.x,
        y: chunk.y,
        z: chunk.z,
        customdata: chunk.disp.map((disp, index) => [
          disp,
          chunk.u[index],
          chunk.v[index],
          chunk.sourceIndex[index],
        ]),
        meta: { side: cloudMeta.key, kind: "cloud" },
        marker: {
          size: scaledMarkerSize(),
          opacity: state.opacity,
          color: bucket.color,
        },
      });
    });
  });

  traces.push(...buildPickTraces(clouds));
  traces.push(...buildSelectionTraces());

  const layout = buildLayout({
    sceneBounds: mergeBounds([state.clouds.left.bounds, state.clouds.right.bounds]),
  });

  Plotly.react(elements.plot, traces, layout, {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["select2d", "lasso2d"],
  }).then(() => {
    bindPlotSync();
  });
}

function buildLayout({ sceneBounds }) {
  const theme = getThemeTokens(state.theme);
  const axisTemplate = {
    titlefont: { color: theme.text },
    tickfont: { color: theme.text },
    gridcolor: theme.grid,
    zerolinecolor: theme.grid,
    backgroundcolor: theme.background,
    showbackground: true,
    range: null,
  };

  const xRange = padRange(sceneBounds.xMin, sceneBounds.xMax);
  const yRange = padRange(sceneBounds.yMin, sceneBounds.yMax);
  const zRange = padRange(sceneBounds.zMin, sceneBounds.zMax);

  return {
    paper_bgcolor: theme.paper,
    plot_bgcolor: theme.paper,
    font: { color: theme.text },
    clickmode: "event+select",
    margin: { l: 0, r: 0, t: 70, b: 0 },
    legend: {
      bgcolor: theme.paper,
      bordercolor: theme.grid,
      borderwidth: 1,
      itemsizing: "constant",
      orientation: "h",
      x: 0.5,
      y: 1.08,
      xanchor: "center",
    },
    title: {
      text: "Synchronized Point Cloud Compare · Top / Bottom",
      x: 0.5,
      xanchor: "center",
    },
    scene: {
      domain: { x: [0.0, 1.0], y: [0.52, 1.0] },
      xaxis: { ...axisTemplate, title: "X (m)", range: xRange },
      yaxis: { ...axisTemplate, title: "Y (m)", range: yRange },
      zaxis: { ...axisTemplate, title: "Z / depth (m)", range: zRange },
      aspectmode: "data",
      camera: state.camera,
      dragmode: "turntable",
      annotations: [],
    },
    scene2: {
      domain: { x: [0.0, 1.0], y: [0.0, 0.48] },
      xaxis: { ...axisTemplate, title: "X (m)", range: xRange },
      yaxis: { ...axisTemplate, title: "Y (m)", range: yRange },
      zaxis: { ...axisTemplate, title: "Z / depth (m)", range: zRange },
      aspectmode: "data",
      camera: state.camera,
      dragmode: "turntable",
      annotations: [],
    },
    annotations: [
      subplotTitle(state.labels.left, 0.5, 1.01),
      subplotTitle(state.labels.right, 0.5, 0.49),
    ],
  };
}

function subplotTitle(text, x, y) {
  return {
    text,
    x,
    y,
    xref: "paper",
    yref: "paper",
    showarrow: false,
    font: { size: 16 },
  };
}

function getThemeTokens(themeName) {
  if (themeName === "light") {
    return {
      paper: "#ffffff",
      background: "#eef2f7",
      grid: "#cbd5e1",
      text: "#10223b",
    };
  }
  return {
    paper: "#0f172a",
    background: "#111c33",
    grid: "#334155",
    text: "#e2e8f0",
  };
}

function padRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return undefined;
  }
  const span = Math.max(1e-3, max - min);
  const pad = span * 0.08;
  return [min - pad, max + pad];
}

function mergeBounds(boundsList) {
  return boundsList.reduce(
    (acc, bounds) => ({
      xMin: Math.min(acc.xMin, bounds.xMin),
      xMax: Math.max(acc.xMax, bounds.xMax),
      yMin: Math.min(acc.yMin, bounds.yMin),
      yMax: Math.max(acc.yMax, bounds.yMax),
      zMin: Math.min(acc.zMin, bounds.zMin),
      zMax: Math.max(acc.zMax, bounds.zMax),
    }),
    {
      xMin: Infinity,
      xMax: -Infinity,
      yMin: Infinity,
      yMax: -Infinity,
      zMin: Infinity,
      zMax: -Infinity,
    }
  );
}

function bindPlotSync() {
  if (state.plotSyncHandler && elements.plot.removeListener) {
    elements.plot.removeListener("plotly_relayout", state.plotSyncHandler);
  }

  state.plotSyncHandler = (eventData) => {
    if (state.syncLocked) {
      return;
    }
    const camera = eventData["scene.camera"] || eventData["scene2.camera"];
    if (!camera) {
      return;
    }

    state.syncLocked = true;
    state.camera = camera;
    Plotly.relayout(elements.plot, {
      "scene.camera": camera,
      "scene2.camera": camera,
    }).finally(() => {
      state.syncLocked = false;
    });
  };

  elements.plot.on?.("plotly_relayout", state.plotSyncHandler);

  if (state.plotClickHandler && elements.plot.removeListener) {
    elements.plot.removeListener("plotly_click", state.plotClickHandler);
  }
  state.plotClickHandler = (eventData) => {
    const pointData = eventData?.points?.[0];
    if (!pointData || !["cloud", "pick"].includes(pointData.data?.meta?.kind)) {
      return;
    }
    selectPoint(pointData);
  };
  elements.plot.on?.("plotly_click", state.plotClickHandler);
}

function updateMarkerStyle() {
  if (!state.clouds.left || !state.clouds.right) {
    return;
  }
  renderIfReady();
}

function scaledMarkerSize() {
  return Math.max(0.1, state.pointSize * MARKER_SIZE_SCALE);
}

function formatPointSize(value) {
  return value.toFixed(1);
}

function updateTheme(themeName) {
  state.theme = themeName;
  document.body.dataset.theme = themeName;
}

function updateBucketCounts() {
  const left = state.clouds.left;
  const right = state.clouds.right;
  [...DISP_BUCKETS, OVERFLOW_BUCKET].forEach((bucket) => {
    const element = document.getElementById(`bucket-count-${bucket.key}`);
    if (!element) {
      return;
    }
    const leftCount = left?.bucketed[bucket.key]?.count ?? 0;
    const rightCount = right?.bucketed[bucket.key]?.count ?? 0;
    element.textContent = `${leftCount} / ${rightCount}`;
  });
}

function updateSummary() {
  if (!state.clouds.left || !state.clouds.right) {
    elements.summaryPanel.innerHTML = '<div class="summary-empty">加载两组点云后显示统计。</div>';
    return;
  }

  const cards = ["left", "right"].map((side) => {
    const cloud = state.clouds[side];
    const title = side === "left" ? state.labels.left : state.labels.right;
    const modeLabel = cloud.dispMode === "file"
      ? "文件视差"
      : cloud.dispMode === "derived"
        ? "深度回推"
        : "混合";

    return `
      <div class="summary-card">
        <h3>${escapeHtml(title)}</h3>
        <dl>
          <dt>文件</dt><dd>${escapeHtml(cloud.name)}</dd>
          <dt>点数</dt><dd>${cloud.pointCount} / ${cloud.rawCount}</dd>
          <dt>采样</dt><dd>${cloud.sampleStep > 1 ? `每 ${cloud.sampleStep} 点取 1 点` : "全量显示"}</dd>
          <dt>像素索引</dt><dd>${cloud.pixelLookup.size} 个像素</dd>
          <dt>视差来源</dt><dd>${modeLabel}</dd>
          <dt>深度均值</dt><dd>${formatNumber(cloud.depthStats.mean)} m</dd>
          <dt>深度范围</dt><dd>${formatNumber(cloud.depthStats.min)} ~ ${formatNumber(cloud.depthStats.max)} m</dd>
        </dl>
      </div>
    `;
  });

  elements.summaryPanel.innerHTML = cards.join("");
}

function selectPoint(pointData) {
  const sourceSide = pointData.data.meta.side;
  const targetSide = sourceSide === "left" ? "right" : "left";
  const custom = pointData.customdata || [];
  const sourcePoint = {
    x: pointData.x,
    y: pointData.y,
    z: pointData.z,
    disp: custom[0],
    u: custom[1],
    v: custom[2],
    sourceIndex: custom[3],
  };
  const match = findCorrespondingPoint(sourcePoint, state.clouds[targetSide]);
  state.selection = {
    sourceSide,
    targetSide,
    sourcePoint,
    targetPoint: match?.point || null,
    pixelDistance: match?.pixelDistance ?? Number.NaN,
    matchType: match?.matchType || null,
  };
  renderIfReady();
  setMessage(
    match
      ? `已标记${match.matchType}，像素距离 ${formatNumber(match.pixelDistance)} px。`
      : "已标记当前点，但另一侧没有可匹配像素。",
    match ? "ok" : "warn"
  );
}

function findCorrespondingPoint(sourcePoint, targetCloud) {
  if (!targetCloud || !Number.isFinite(sourcePoint.u) || !Number.isFinite(sourcePoint.v)) {
    return null;
  }

  const exactMatch = chooseBestPixelCandidate(
    sourcePoint,
    targetCloud.pixelLookup.get(pixelKey(sourcePoint.u, sourcePoint.v)) || []
  );
  if (exactMatch) {
    return {
      point: exactMatch.point,
      pixelDistance: exactMatch.pixelDistance,
      matchType: exactMatch.pixelDistance <= 0.25 ? "同像素点" : "同一取整像素点",
    };
  }

  let bestPoint = null;
  let bestDistance = Infinity;
  let bestDepthDistance = Infinity;
  for (const point of targetCloud.points) {
    const distance = pixelDistance(sourcePoint, point);
    const depthDistance = Math.abs((sourcePoint.z ?? 0) - (point.z ?? 0));
    if (
      distance < bestDistance - Number.EPSILON ||
      (Math.abs(distance - bestDistance) <= Number.EPSILON && depthDistance < bestDepthDistance)
    ) {
      bestDistance = distance;
      bestDepthDistance = depthDistance;
      bestPoint = point;
    }
  }

  if (!bestPoint || bestDistance > PIXEL_MATCH_TOLERANCE) {
    return null;
  }
  return { point: bestPoint, pixelDistance: bestDistance, matchType: "2px 内最近投影点" };
}

function chooseBestPixelCandidate(sourcePoint, candidates) {
  let bestPoint = null;
  let bestDistance = Infinity;
  let bestDepthDistance = Infinity;

  for (const point of candidates) {
    const distance = pixelDistance(sourcePoint, point);
    const depthDistance = Math.abs((sourcePoint.z ?? 0) - (point.z ?? 0));
    if (
      distance < bestDistance - Number.EPSILON ||
      (Math.abs(distance - bestDistance) <= Number.EPSILON && depthDistance < bestDepthDistance)
    ) {
      bestPoint = point;
      bestDistance = distance;
      bestDepthDistance = depthDistance;
    }
  }

  if (!bestPoint || bestDistance > PIXEL_MATCH_TOLERANCE) {
    return null;
  }
  return { point: bestPoint, pixelDistance: bestDistance };
}

function pixelKey(u, v) {
  return `${Math.round(u)},${Math.round(v)}`;
}

function pixelDistance(a, b) {
  if (![a.u, a.v, b.u, b.v].every(Number.isFinite)) {
    return Infinity;
  }
  return Math.hypot(a.u - b.u, a.v - b.v);
}

function buildSelectionTraces() {
  if (!state.selection) {
    return [];
  }
  const traces = [];
  const sideToScene = { left: "scene", right: "scene2" };
  const sideToPoint = {
    [state.selection.sourceSide]: state.selection.sourcePoint,
    [state.selection.targetSide]: state.selection.targetPoint,
  };

  Object.entries(sideToPoint).forEach(([side, point]) => {
    if (!point) {
      return;
    }
    const isSource = side === state.selection.sourceSide;
    traces.push({
      type: "scatter3d",
      mode: "markers",
      scene: sideToScene[side],
      name: `${side === "left" ? "Selected GT" : "Selected Prediction"} ${isSource ? "source" : "match"}`,
      showlegend: false,
      hovertemplate:
        `${side === "left" ? state.labels.left : state.labels.right}<br>x=%{x:.3f}<br>y=%{y:.3f}<br>z=%{z:.3f}<br>disp=%{customdata[0]:.2f}<br>pixel=(%{customdata[1]:.1f}, %{customdata[2]:.1f})<extra>selected</extra>`,
      x: [point.x],
      y: [point.y],
      z: [point.z],
      customdata: [[point.disp, point.u, point.v]],
      meta: { side, kind: "selection" },
      marker: {
        size: Math.max(4, scaledMarkerSize() * 5),
        color: isSource ? "#facc15" : "#22d3ee",
        opacity: 1,
        line: { color: "#0f172a", width: 4 },
      },
    });
  });
  return traces;
}

function buildPickTraces(clouds) {
  return clouds.map((cloudMeta) => {
    const pickData = collectPickData(state.clouds[cloudMeta.key]);
    return {
      type: "scatter3d",
      mode: "markers",
      scene: cloudMeta.scene,
      name: `${cloudMeta.label} click targets`,
      showlegend: false,
      hovertemplate:
        `${cloudMeta.label}<br>x=%{x:.3f}<br>y=%{y:.3f}<br>z=%{z:.3f}<br>disp=%{customdata[0]:.2f}<br>pixel=(%{customdata[1]:.1f}, %{customdata[2]:.1f})<extra>click to compare</extra>`,
      x: pickData.x,
      y: pickData.y,
      z: pickData.z,
      customdata: pickData.customdata,
      meta: { side: cloudMeta.key, kind: "pick" },
      marker: {
        size: PICK_MARKER_SIZE,
        opacity: 0,
        color: "rgba(0, 0, 0, 0)",
      },
    };
  });
}

function collectPickData(cloud) {
  const pickData = { x: [], y: [], z: [], customdata: [] };
  [...DISP_BUCKETS, OVERFLOW_BUCKET].forEach((bucket) => {
    if (!state.bucketVisibility[bucket.key]) {
      return;
    }
    const chunk = cloud.bucketed[bucket.key];
    if (!chunk || chunk.count === 0) {
      return;
    }
    for (let index = 0; index < chunk.count; index += 1) {
      pickData.x.push(chunk.x[index]);
      pickData.y.push(chunk.y[index]);
      pickData.z.push(chunk.z[index]);
      pickData.customdata.push([
        chunk.disp[index],
        chunk.u[index],
        chunk.v[index],
        chunk.sourceIndex[index],
      ]);
    }
  });
  return pickData;
}

function updateSelectionPanel() {
  if (!state.selection) {
    elements.selectionPanel.innerHTML = '<div class="summary-empty">点击上方或下方点云中的一个点，查看同像素 GT / Prediction 差异。</div>';
    return;
  }

  const gtPoint = state.selection.sourceSide === "left"
    ? state.selection.sourcePoint
    : state.selection.targetPoint;
  const predPoint = state.selection.sourceSide === "right"
    ? state.selection.sourcePoint
    : state.selection.targetPoint;

  if (!gtPoint || !predPoint) {
    elements.selectionPanel.innerHTML = `
      <div class="selection-card">
        <h3>未找到对应点</h3>
        <dl>
          <dt>点击侧</dt><dd>${state.selection.sourceSide === "left" ? "GT / 上方" : "Prediction / 下方"}</dd>
          <dt>像素</dt><dd>${formatPixel(state.selection.sourcePoint)}</dd>
          <dt>深度</dt><dd>${formatNumber(state.selection.sourcePoint.z)} m</dd>
          <dt>视差</dt><dd>${formatNumber(state.selection.sourcePoint.disp)}</dd>
        </dl>
        <p class="match-warning">另一侧没有落在 ${PIXEL_MATCH_TOLERANCE}px 内的显示点；可以提高“最大点数 / 云”后更新视图。</p>
      </div>
    `;
    return;
  }

  const dx = predPoint.x - gtPoint.x;
  const dy = predPoint.y - gtPoint.y;
  const dz = predPoint.z - gtPoint.z;
  const dDisp = predPoint.disp - gtPoint.disp;
  const d3 = Math.hypot(dx, dy, dz);

  elements.selectionPanel.innerHTML = `
    <div class="selection-card">
      <h3>同像素对比</h3>
      <dl>
        <dt>匹配方式</dt><dd>${state.selection.matchType || "同像素点"}</dd>
        <dt>GT 像素</dt><dd>${formatPixel(gtPoint)}</dd>
        <dt>Pred 像素</dt><dd>${formatPixel(predPoint)}</dd>
        <dt>像素距离</dt><dd>${formatNumber(state.selection.pixelDistance)} px</dd>
        <dt>GT xyz</dt><dd>${formatVector(gtPoint)}</dd>
        <dt>Pred xyz</dt><dd>${formatVector(predPoint)}</dd>
        <dt>Pred - GT xyz</dt><dd>${formatSigned(dx)}, ${formatSigned(dy)}, ${formatSigned(dz)} m</dd>
        <dt>3D 距离</dt><dd>${formatNumber(d3)} m</dd>
        <dt>GT / Pred 视差</dt><dd>${formatNumber(gtPoint.disp)} / ${formatNumber(predPoint.disp)}</dd>
        <dt>视差差值</dt><dd>${formatSigned(dDisp)} px</dd>
      </dl>
    </div>
  `;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return value.toFixed(3);
}

function formatSigned(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

function formatPixel(point) {
  if (!point || !Number.isFinite(point.u) || !Number.isFinite(point.v)) {
    return "--";
  }
  return `(${point.u.toFixed(1)}, ${point.v.toFixed(1)})`;
}

function formatVector(point) {
  if (!point) {
    return "--";
  }
  return `${formatNumber(point.x)}, ${formatNumber(point.y)}, ${formatNumber(point.z)} m`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return "--";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    return "--";
  }
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`;
  }
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setMessage(text, tone = "info") {
  const colors = {
    info: "var(--muted)",
    ok: "var(--ok)",
    warn: "var(--warn)",
    error: "var(--error)",
  };
  elements.messageBar.textContent = text;
  elements.messageBar.style.color = colors[tone] || colors.info;
}

async function exportScreenshot() {
  try {
    setMessage("导出截图中。", "info");
    const canvas = await html2canvas(elements.plotShell, {
      backgroundColor: null,
      scale: 2,
    });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `pointcloud_compare_${Date.now()}.png`;
    link.click();
    setMessage("截图已导出。", "ok");
  } catch (error) {
    console.error(error);
    setMessage(`截图失败：${error.message}`, "error");
  }
}

initialize();
