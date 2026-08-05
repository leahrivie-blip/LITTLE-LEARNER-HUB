/**
 * Pick an ephemeral HTTP port that Chromium will not reject as ERR_UNSAFE_PORT.
 * See Chromium net/base/port_util.cc restricted list (includes 6697, 6665-6669, 6000, …).
 */
const CHROMIUM_UNSAFE_PORTS = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179,
  389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601,
  636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566,
  6665, 6666, 6667, 6668, 6669, 6697, 10080,
]);

function isChromiumSafePort(port) {
  const n = Number(port);
  return Number.isInteger(n) && n >= 1024 && n <= 65535 && !CHROMIUM_UNSAFE_PORTS.has(n);
}

function allocateSafeTestPort(base = 5100, span = 1800) {
  const start = Math.max(1024, Number(base) || 5100);
  const width = Math.max(50, Number(span) || 1800);
  for (let attempt = 0; attempt < width * 2; attempt += 1) {
    const candidate = start + Math.floor(Math.random() * width);
    if (isChromiumSafePort(candidate)) return candidate;
  }
  // Deterministic fallback away from IRC/X11 bands.
  return 5120 + (process.pid % 500);
}

module.exports = {
  CHROMIUM_UNSAFE_PORTS,
  isChromiumSafePort,
  allocateSafeTestPort,
};
