import fs from "node:fs";

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index];
      return row;
    }, {});
  });
}

function parseExpiry(value) {
  return value ? new Date(`${value}T00:00:00+05:30`) : null;
}

function roundToStep(value, step) {
  return Math.round(value / step) * step;
}

export function loadOptionInstruments(config) {
  if (!fs.existsSync(config.instrumentsCachePath)) {
    return [];
  }

  return parseCsv(fs.readFileSync(config.instrumentsCachePath, "utf8")).filter(
    (row) => row.exchange === config.optionSelection.exchange
  );
}

export function selectOptionContract(config, instruments, signal, spotPrice, timestamp) {
  const targetType = signal.direction === "CALL" ? "CE" : "PE";
  const targetStrike = roundToStep(spotPrice, config.optionSelection.strikeStep);
  const signalTime = new Date(timestamp);

  const eligible = instruments
    .filter((row) => row.name === "NIFTY")
    .filter((row) => row.instrument_type === targetType)
    .filter((row) => Number(row.strike) === targetStrike)
    .map((row) => ({
      ...row,
      expiryDate: parseExpiry(row.expiry)
    }))
    .filter((row) => row.expiryDate && row.expiryDate >= signalTime)
    .sort((left, right) => left.expiryDate - right.expiryDate);

  return eligible[0] ?? null;
}
