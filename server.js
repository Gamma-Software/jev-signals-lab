import express from "express";
import { fileURLToPath } from "node:url";
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import "dotenv/config";

const app = express();
const port = process.env.PORT || 3000;
const client = process.env.TYPESAFE_API_KEY ? new TypeSafeClient({ timeout: 15_000 }) : null;

app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

const questions = {
  trend_bullish: noul("Based only on the provided state, is the asset in a convincing bullish price trend relevant to the next 5 trading days?", { true: "Price action and trend indicators convincingly support a bullish trend.", false: "The trend is bearish, neutral, mixed, or insufficiently supported." }),
  momentum_positive: noul("Is current momentum supportive of further price appreciation over the next 5 trading days?"),
  volume_confirms_move: noul("Does current trading volume meaningfully confirm the recent price movement?"),
  asset_overextended: noul("Does the asset appear sufficiently overextended that a new long position now has elevated short-term reversal risk?"),
  relative_strength_positive: noul("Is the asset demonstrating meaningful relative strength compared with its sector and the broader market?"),
  fundamentals_supportive: noul("Do the supplied fundamental metrics provide meaningful support for owning this company?"),
  valuation_excessive: noul("Does the valuation appear excessive relative to the supplied growth and financial metrics?"),
  news_supportive: noul("Taken together, do the supplied recent news headlines provide a positive catalyst for the asset?"),
  event_risk: noul("Is there meaningful event risk that could make opening a position now unusually risky?"),
  market_environment: choice("Which description best characterizes the broader market environment for taking a long position in this asset?", { risk_on: "Market conditions broadly support taking equity risk.", neutral: "Market conditions provide neither strong support nor strong opposition.", risk_off: "Market conditions argue for reducing equity risk." }),
  technical_setup: score("How attractive is the technical setup for a new long position over the next 5 trading days?", ["Very unfavorable", "Unfavorable", "Neutral or mixed", "Favorable", "Very favorable"]),
  short_term_risk: score("How high is the downside risk of entering a new long position over the next 5 trading days?", ["Very low risk", "Low risk", "Moderate risk", "High risk", "Very high risk"]),
};

function clamp(value) { return Math.max(0.01, Math.min(0.99, value)); }
function numberAt(state, path, fallback = 0) { return path.split(".").reduce((value, key) => value?.[key], state) ?? fallback; }
function simulatedAnswers(state) {
  const rsi = numberAt(state, "technical.rsi_14", 50), return5d = numberAt(state, "price_action.return_5d_pct"), relativeVolume = numberAt(state, "volume.relative_volume", 1), market5d = numberAt(state, "market.nasdaq_return_5d_pct"), sector5d = numberAt(state, "market.sector_return_5d_pct"), earningsDays = numberAt(state, "earnings.days_until_next_earnings", 99);
  const trend = clamp(.5 + return5d / 18), momentum = clamp(.45 + (rsi - 50) / 70 + return5d / 30), overextended = clamp((rsi - 55) / 35 + Math.max(0, return5d - 8) / 20), eventRisk = clamp(earningsDays < 8 ? .78 : earningsDays < 21 ? .42 : .12), n = (value) => ({ type: "noul", noul: value });
  return { trend_bullish: n(trend), momentum_positive: n(momentum), volume_confirms_move: n(clamp(.35 + (relativeVolume - 1) / 2)), asset_overextended: n(overextended), relative_strength_positive: n(clamp(.5 + (sector5d - market5d) / 15 + return5d / 30)), fundamentals_supportive: n(.72), valuation_excessive: n(.58), news_supportive: n(.65), event_risk: n(eventRisk), market_environment: { type: "choice", choice: market5d > 1 ? "risk_on" : market5d < -1 ? "risk_off" : "neutral", confidence: .7 }, technical_setup: { type: "score", score: clamp(2 + (trend + momentum - overextended - eventRisk) * 1.5), confidence: .68 }, short_term_risk: { type: "score", score: clamp(2 + overextended + eventRisk), confidence: .68 } };
}

export function strategy(answers) {
  const p = (id) => answers[id]?.noul ?? 0;
  const buy = p("trend_bullish") > .75 && p("momentum_positive") > .70 && p("relative_strength_positive") > .65 && p("event_risk") < .40 && p("asset_overextended") < .80;
  const score = Math.round(100 * (p("trend_bullish") * .28 + p("momentum_positive") * .22 + p("relative_strength_positive") * .18 + p("volume_confirms_move") * .08 + p("fundamentals_supportive") * .12 + p("news_supportive") * .12 - p("event_risk") * .25 - p("asset_overextended") * .15));
  return { action: buy ? "BUY (paper)" : "NO TRADE", score, rule: "trend > .75 · momentum > .70 · relative strength > .65 · event risk < .40 · overextended < .80" };
}

app.post("/api/analyze", async (req, res) => {
  const state = req.body?.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return res.status(400).json({ error: "Le state JSON est requis." });
  try { const response = client ? await client.systemOne({ model: "jev-latest", state, questions }) : { model: "offline-demo", answers: simulatedAnswers(state), usage: null }; res.json({ source: client ? "jev" : "offline-demo", model: response.model, answers: response.answers, strategy: strategy(response.answers), usage: response.usage ?? null, request: { state, questionCount: Object.keys(questions).length } }); }
  catch (error) { console.error("TypeSafe request failed:", error); res.status(502).json({ error: "La requête Jev a échoué. Vérifiez TYPESAFE_API_KEY puis réessayez." }); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) app.listen(port, () => console.log(`Jev trading POC running on http://localhost:${port}`));
