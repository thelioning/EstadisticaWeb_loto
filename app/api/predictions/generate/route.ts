import { NextResponse } from "next/server";

const LOTTERIES = [
  {
    id: "nacional",
    name: "Quiniela Nacional",
    shortName: "LOTERÍA NACIONAL",
    accent: "#1a5e9a",
    seed: 17,
  },
  {
    id: "leidsa",
    name: "Quiniela Palé Leidsa",
    shortName: "LEIDSA",
    accent: "#0b6a4f",
    seed: 41,
  },
  {
    id: "loteka",
    name: "Quiniela Palé Loteka",
    shortName: "LOTEKA",
    accent: "#9a4e20",
    seed: 73,
  },
];

function seededNumbers(seed: number, count: number) {
  const values: string[] = [];
  let state = seed;
  while (values.length < count) {
    state = (state * 73 + 41) % 1009;
    const value = String(state % 100).padStart(2, "0");
    if (!values.includes(value)) values.push(value);
  }
  return values;
}

export async function POST() {
  const now = new Date();
  const dateSeed =
    now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();

  const lotteries = LOTTERIES.map((lottery) => {
    const numbers = seededNumbers(dateSeed + lottery.seed, 20);
    return {
      id: lottery.id,
      name: lottery.name,
      shortName: lottery.shortName,
      accent: lottery.accent,
      candidates: numbers.slice(0, 5).map((number, index) => ({
        number,
        score: 91 - index * 5 - (lottery.seed % 4),
        signal: ["Mes + semana", "Coincidencia alta", "Fuerza mensual", "Señal por posición", "Recurrencia semanal"][index],
      })),
      hotNumbers: numbers.slice(5, 20),
      pairs: [`${numbers[0]}–${numbers[1]}`, `${numbers[1]}–${numbers[2]}`, `${numbers[0]}–${numbers[3]}`],
    };
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    dataThrough: "26 jul 2026",
    weekLabel: "27 jul — 01 ago 2026",
    historicalYears: [2023, 2024, 2025],
    source: "prototype-v1",
    lotteries,
  });
}
