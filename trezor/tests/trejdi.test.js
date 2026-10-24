import { test } from "node:test";
import assert from "node:assert/strict";
import { stevilo, cas, najdiTabelo, vTrejde, statistika } from "../src/trejdi.js";

test("števila v različnih zapisih", () => {
  assert.equal(stevilo("1 234,56"), 1234.56);
  assert.equal(stevilo("1,234.56"), 1234.56);
  assert.equal(stevilo("-12.5"), -12.5);
  assert.equal(stevilo("(12.50)"), -12.5);
  assert.equal(stevilo("$ 45.00"), 45);
  assert.equal(stevilo("12,5"), 12.5);
  assert.equal(stevilo("abc"), null);
});

test("časi", () => {
  assert.equal(cas("2026.10.24 13:45:10").getHours(), 13);
  assert.equal(cas("24.10.2026 09:05").getDate(), 24);
  assert.equal(cas("10/24/2026 1:45:10 PM").getHours(), 13);
  assert.equal(cas("Symbol"), null);
});

test("MetaTrader 5 poročilo (Positions) z dvema časoma in provizijo", () => {
  const vrstice = [
    ["Trade History Report"],
    ["Name:", "REMAKO"],
    ["Positions"],
    ["Time", "Position", "Symbol", "Type", "Volume", "Price", "S / L", "T / P", "Time", "Price", "Commission", "Swap", "Profit"],
    ["2026.10.20 09:00:00", "1", "EURUSD", "buy", "0.10", "1.0800", "", "", "2026.10.20 10:30:00", "1.0850", "-0.70", "0.00", "50.00"],
    ["2026.10.21 15:00:00", "2", "XAUUSD", "sell", "0.05", "2400", "", "", "2026.10.21 15:20:00", "2405", "-0.35", "0.00", "-25.00"],
    ["2026.10.22 08:00:00", "3", "EURUSD", "buy", "0.10", "1.0800", "", "", "2026.10.22 09:00:00", "1.0810", "-0.70", "-0.10", "10.00"],
    ["Orders"],
    ["Open Time", "Order", "Symbol", "Type"],
  ];
  const tab = najdiTabelo(vrstice);
  assert.equal(tab.vrstice.length, 3);
  const t = vTrejde(tab.vrstice, tab.stolpci);
  assert.deepEqual(t.map((x) => x.p), [49.3, -25.35, 9.2]);
  assert.equal(t[0].s, "EURUSD");
  assert.equal(t[1].d, "sell");
  const s = statistika(t);
  assert.equal(s.n, 3);
  assert.equal(Math.round(s.neto * 100) / 100, 33.15);
  assert.equal(Math.round(s.wr * 100), 67);
  assert.equal(Math.round(s.maxDD * 100) / 100, 25.35);
  assert.equal(s.trajanje, (90 + 20 + 60) / 3);
  assert.equal(s.simboli[0].k, "EURUSD");
});

test("CSV z neto P&L in vrsticami pologa", () => {
  const vrstice = [
    ["Date/Time", "Instrument", "Side", "Qty", "Net P&L", "Fees"],
    ["2026-10-01 14:00", "MES", "Buy", "1", "125.00", "2.10"],
    ["2026-10-01 15:00", "", "Deposit", "", "5000", ""],
    ["2026-10-02 16:00", "MNQ", "Sell", "2", "-60.5", "4.20"],
  ];
  const tab = najdiTabelo(vrstice);
  const t = vTrejde(tab.vrstice, tab.stolpci);
  assert.deepEqual(t.map((x) => x.p), [125, -60.5]);
  const s = statistika(t);
  assert.equal(s.dnevi.length, 2);
  assert.equal(s.najDan.p, 125);
});

test("Topstep / ProjectX izvoz (EnteredAt, ExitedAt, Fees + Commissions, časovni pas)", () => {
  const vr = [
    ["Id", "ContractName", "EnteredAt", "ExitedAt", "EntryPrice", "ExitPrice", "Fees", "PnL", "Size", "Type", "TradeDay", "TradeDuration", "Commissions"],
    ["1", "MNQZ6", "10/19/2026 09:39:30 +02:00", "10/19/2026 09:49:09 +02:00", "29764.25", "29746.5", "0.7200", "35.5", "1", "Short", "10/19/2026 00:00:00 -05:00", "00:09:39.03", "0.5000"],
  ];
  const t = najdiTabelo(vr);
  const [x] = vTrejde(t.vrstice, t.stolpci);
  assert.equal(x.t, "2026-10-19T07:49:09.000Z");
  assert.equal(x.d, "sell");
  assert.equal(x.p, 34.28);
});
