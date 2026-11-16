// The token radar's model: one sealed snapshot in, one ranked board out.
//
// The radar answers one question for every protocol that records no token: if the token it may
// issue were priced off the protocol's own record, what would that token be worth? The answer is
// a stated function of four snapshot figures, and the same function scores every row:
//
//   base       = tvl_usd x category_multiple
//   growth     = 1 + clamp(change_7d, -50, 100) / 100 x 0.35
//   maturity   = 0.75 + min(age_days, 1460) / 1460 x 0.55        (age unknown: 1.00)
//   reach      = 1 + (min(chains, 5) - 1) x 0.04
//   implied    = round(base x growth x maturity x reach)
//
// category_multiple is the only structural term: a DEX keeps a fee on every swap, a bridge earns a
// thin route fee, a curator keeps a slice of the assets it allocates, so a dollar of TVL is worth
// more in some businesses than others. It is applied by the category the snapshot names, never by
// protocol name. Every other term is the protocol's own record: how much TVL it holds, how that TVL
// moved over seven days, and how long DefiLlama has tracked it with no token on record.
//
// The watchlist is the floor, never the ceiling. The board ranks every protocol that passes the
// launch screen, at any TVL, so the watchlist's 40 slugs sit inside a wider early radar. Protocols
// whose token already trades are kept apart: their market cap is a fact, not a model output.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  version: string;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  reach_weight: number;
  reach_cap: number;
  default_multiple: number;
  category_multiple: Record<string, number>;
}

export const MODEL: ModelConstants = {
  version: 'radar-2',
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.75,
  maturity_range: 0.55,
  maturity_days: 1460,
  reach_weight: 0.04,
  reach_cap: 5,
  default_multiple: 0.22,
  // A dollar of TVL, by the business the snapshot's category names. Fee-taking venues and credit
  // desks sit at the top; commodity bridges and staking wrappers at the bottom.
  category_multiple: {
    Dexs: 0.4,
    'Uncollateralized Lending': 0.36,
    Lending: 0.3,
    'Collateral Markets': 0.3,
    CDP: 0.3,
    'CDP Manager': 0.3,
    Derivatives: 0.3,
    'Prediction Market': 0.3,
    Launchpad: 0.3,
    RWA: 0.3,
    'Risk Curators': 0.28,
    'Yield Aggregator': 0.28,
    'Onchain Capital Allocator': 0.26,
    Yield: 0.24,
    'Options Vault': 0.24,
    Privacy: 0.25,
    'Crypto Card Issuer': 0.25,
    CeDeFi: 0.25,
    Farm: 0.22,
    'Dual-Token Stablecoin': 0.22,
    'OTC Marketplace': 0.22,
    'Interest Rate Derivatives': 0.2,
    Insurance: 0.2,
    Indexes: 0.2,
    'Leveraged Farming': 0.2,
    'Basis Trading': 0.18,
    'Liquidity Manager': 0.18,
    Restaking: 0.15,
    'Stablecoin Wrapper': 0.15,
    Bridge: 0.12,
    'Cross Chain Bridge': 0.12,
    'Staking Pool': 0.12,
    'Liquid Restaking': 0.12,
    'Anchor BTC': 0.1,
    'Decentralized BTC': 0.1,
    'Governance Incentives': 0.1,
    'Token Locker': 0.08,
    Chain: 0.55,
    Payments: 0.55,
  },
};

/** How many live-token protocols the dashboard's live view carries, by market cap. */
export const LIVE_ROWS = 30;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The terms of one row's implied value, so the page can show the arithmetic without repeating it. */
export interface ValueTerms {
  base_multiple: number;
  base_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
  age_days: number | null;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: ValueTerms;
  farm_steps: string[];
}

/** The dashboard's view of one row, with the farm plan already resolved to strings. */
export type RadarRow = BoardRow;

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  watchlist_tvl_usd: number;
  total_implied_usd: number;
  median_age_days: number | null;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** `date` plus `days`, as a UTC day. */
export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return date;
  return new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The four terms and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): { implied: number; terms: ValueTerms } {
  const age = ageDays(asOf, protocol.listed_at);
  const multiple = model.category_multiple[protocol.category ?? ''] ?? model.default_multiple;
  const base = protocol.tvl_usd * multiple;
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult =
    age === null ? 1 : model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const reachMult = 1 + (Math.min(Math.max(protocol.chains.length, 1), model.reach_cap) - 1) * model.reach_weight;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * reachMult));
  return {
    implied,
    terms: {
      base_multiple: multiple,
      base_usd: Math.round(base),
      growth_pct: round4(growthPct),
      growth_multiplier: round4(growthMult),
      maturity_multiplier: round4(maturityMult),
      reach_multiplier: round4(reachMult),
      age_days: age,
    },
  };
}

// ------------------------------------------------------------------ the launch screen

const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a subject of the radar: it records no token, is not an exchange, and is not
 * a wrapped, staked or versioned product of another protocol. The same screen the watchlist rule
 * applies, minus its TVL floor.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is a floor: every slug is on the board even if the wider screen would drop it.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);

  const watch = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model) }));
  scored.sort(
    (a, b) =>
      b.implied - a.implied ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  // Ranks must be 1..n and values must not rise with rank. Rounding can land two neighbours on the
  // same dollar; one dollar is taken off the lower row so every rank is a distinct claim.
  let previous = 0;
  return scored.map((s, i) => {
    const implied = i === 0 ? s.implied : Math.min(s.implied, previous - 1);
    previous = Math.max(1, implied);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      watchlist: watch.has(s.p.slug),
      age_days: s.terms.age_days,
      implied_value_usd: previous,
      model: s.terms,
      farm_steps: farmSteps(s.p, s.terms.age_days, snapshot.as_of).map(stepText),
    };
  });
}

/** A step as one string: its action, its cost and its time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${trimEnd(step.text)} — costs ${trimEnd(step.cost)}; takes ${trimEnd(step.time)}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function trimEnd(s: string): string {
  return s.trim().replace(/[.;]+$/, '');
}

// ------------------------------------------------------------------ farm plans

/** A rough cost of one transaction on a chain, in dollars, from the chain's own fee market. */
function gasPerTx(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 5;
  if (c === 'bitcoin') return 1.5;
  if (c === 'tron') return 0.6;
  if (c === 'binance') return 0.12;
  if (c === 'polygon') return 0.05;
  if (c === 'arbitrum' || c === 'base' || c === 'optimism' || c === 'avalanche') return 0.12;
  if (c === 'solana' || c === 'sui' || c === 'aptos' || c === 'monad' || c === 'hyperliquid l1' || c === 'plasma') return 0.01;
  if (c === 'ripple' || c === 'stellar') return 0.01;
  return 0.4;
}

function gasText(chain: string): string {
  const g = gasPerTx(chain);
  if (g < 0.02) return 'under $0.02 of gas a transaction';
  return `about $${g.toFixed(2)} of gas a transaction`;
}

/** How much capital one position needs, from the protocol's own TVL. */
function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 500;
  if (tvl >= 1_000_000_000) return 300;
  if (tvl >= 250_000_000) return 200;
  if (tvl >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: a younger protocol gets a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 1095) return 30;
  return 21;
}

/** How often to touch the position, so activity lands in more than one weekly snapshot. */
function cadenceFor(hold: number): number {
  if (hold >= 60) return 7;
  if (hold >= 45) return 10;
  if (hold >= 30) return 14;
  return 7;
}

/** The playbook a category follows. */
type Play = 'lend' | 'dex' | 'yield' | 'curator' | 'rwa' | 'bridge' | 'stake' | 'deriv' | 'chain' | 'insure' | 'other';

function playOf(category: string | null): Play {
  const c = (category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('collateral') || c.includes('cdp')) return 'lend';
  if (c.includes('dex') || c.includes('liquidity manager')) return 'dex';
  if (c.includes('curator') || c.includes('allocator')) return 'curator';
  if (c.includes('rwa') || c.includes('otc') || c.includes('stablecoin wrapper') || c.includes('cedefi')) return 'rwa';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('staking') || c.includes('restak') || c.includes('btc')) return 'stake';
  if (c.includes('derivative') || c.includes('options') || c.includes('prediction') || c.includes('basis')) return 'deriv';
  if (c === 'chain' || c.includes('payment') || c.includes('governance') || c.includes('launchpad')) return 'chain';
  if (c.includes('insurance')) return 'insure';
  if (c.includes('yield') || c.includes('farm')) return 'yield';
  return 'other';
}

/** A protocol's farm plan: seven steps, each an action with a cost and a time. */
export function farmSteps(p: SnapshotProtocol, age: number | null, asOf: string): FarmStep[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(age);
  const cadence = cadenceFor(hold);
  const until = addDays(asOf, hold);
  const gas = gasText(chain);
  const unit = chain.toLowerCase() === 'bitcoin' ? 'BTC' : 'USDC';
  const name = p.name;
  const category = p.category ?? 'DeFi protocol';
  const fee = gasPerTx(chain);
  // A bridge plan names the two sides only when the snapshot's chains give it two.
  const otherChain = p.chains.filter((c) => c.toLowerCase() !== 'ethereum')[0] ?? null;
  const bridgeDest = otherChain ?? chain;
  const bridgeStep = otherChain !== null
    ? `Bridge $${capital} of USDC from Ethereum to ${otherChain} through ${name}, and check the route's fee and its finality time before sending.`
    : `Move $${capital} of USDC through ${name}'s route on ${chain} and check the route's fee and its finality time before sending.`;
  const bridgeBack = otherChain !== null
    ? `Unwind before ${until}: bridge the balance back to Ethereum, confirm the USDC arrives, and revoke the bridge's allowance.`
    : `Unwind before ${until}: withdraw the balance from ${name}'s route and revoke the bridge's allowance from the wallet.`;

  const open: FarmStep = {
    text: `Fund a fresh wallet on ${chain} with $${capital} of ${unit} and enough for gas; keep it separate from your main wallet so every farm transaction is easy to count.`,
    cost: `$${capital} of capital plus ${gas}`,
    time: '10 minutes',
  };
  const activity = (what: string): FarmStep => ({
    text: `Repeat ${what} every ${cadence} days for ${hold} days, so the wallet shows activity across at least two weekly snapshots.`,
    cost: `${gas} for each touch`,
    time: `${cadence === 7 ? '10' : '15'} minutes every ${cadence} days`,
  });
  const check: FarmStep = {
    text: `Open ${name}'s own app and documentation and look for a points or launch page; claim only from a link the protocol itself publishes, never from a direct message.`,
    cost: 'nothing to look; never pay to claim',
    time: '10 minutes',
  };
  const log: FarmStep = {
    text: `Log the wallet address, every deposit and every claim in one file, and set a reminder to unwind by ${until} so the position never outlives the farm.`,
    cost: 'no fee',
    time: '5 minutes',
  };

  const plays: Record<Play, FarmStep[]> = {
    lend: [
      open,
      {
        text: `Supply $${capital} of USDC to ${name}'s ${chain} market and keep the receipt token in the same wallet.`,
        cost: `$${capital} supplied plus ${gas}`,
        time: '5 minutes',
      },
      {
        text: `Borrow up to 40% of the deposit back in USDC, supply it once more, and stop at a health factor above 2.0 so a 20% price move cannot liquidate the position.`,
        cost: `no new capital; ${gas} for the second supply`,
        time: '10 minutes',
      },
      activity('one repay and one re-borrow of a small amount'),
      check,
      {
        text: `Watch the market's borrowing demand: if the supply rate falls below 2%, move the deposit to a second ${category} market and keep only one position open.`,
        cost: `${gas} to move`,
        time: '10 minutes',
      },
      {
        text: `Unwind before ${until}: repay the borrow, withdraw the supply, and revoke the market's allowance from the wallet.`,
        cost: `${gas} for the repay and ${gas} for the withdrawal`,
        time: '15 minutes',
      },
    ],
    dex: [
      open,
      {
        text: `Provide $${capital} of liquidity to ${name}'s deepest ${chain} pair, using two assets you would hold anyway rather than a pair you must buy for the farm.`,
        cost: `$${capital} in the pair plus ${gas}`,
        time: '15 minutes',
      },
      {
        text: `Write down the position's range and the pool's fee tier before you deposit; a range narrower than the pair's 7-day swing needs rebalancing more often than the plan allows.`,
        cost: 'no fee to check',
        time: '5 minutes',
      },
      activity('one rebalance of the position and one small swap through the pool'),
      check,
      {
        text: `Compare the pool's fee APR with its 7-day volume; if volume halves, move the liquidity to ${name}'s second pool on ${chain} rather than leaving it idle.`,
        cost: `${gas} to move the position`,
        time: '15 minutes',
      },
      {
        text: `Unwind before ${until}: remove the liquidity, swap the proceeds back to USDC, and revoke the router's allowance.`,
        cost: `about $${(fee * 3).toFixed(2)} of gas for remove, swap and revoke`,
        time: '15 minutes',
      },
    ],
    yield: [
      open,
      {
        text: `Deposit $${capital} of USDC into ${name}'s ${chain} vault and confirm the vault's fee and withdrawal delay before you sign.`,
        cost: `$${capital} deposited plus ${gas}`,
        time: '10 minutes',
      },
      {
        text: `Leave auto-compounding on, and do not claim rewards every week: small claims cost more gas than they earn at this size.`,
        cost: 'no extra fee',
        time: '2 minutes',
      },
      activity('one small deposit and one withdrawal into the same vault'),
      check,
      {
        text: `Track the vault's reported APY against its realised return; if the strategy's TVL halves in a week, move to ${name}'s second ${chain} vault.`,
        cost: `${gas} to move`,
        time: '10 minutes',
      },
      {
        text: `Unwind before ${until}: request the withdrawal early enough to clear any queue, then move the USDC out of the vault contract.`,
        cost: `${gas} for the withdrawal`,
        time: '15 minutes',
      },
    ],
    curator: [
      open,
      {
        text: `Deposit $${capital} of USDC into a ${name} vault on ${chain} after reading the vault's fee, its curator and its stated leverage.`,
        cost: `$${capital} deposited plus ${gas}`,
        time: '15 minutes',
      },
      {
        text: `Check which venues the vault allocates to; a curator that lends into a single market carries that market's risk as well as its own.`,
        cost: 'no fee to check',
        time: '10 minutes',
      },
      activity('one deposit or withdrawal to keep the vault shares active'),
      check,
      {
        text: `Compare ${name}'s vault with its own second vault on ${chain}: keep the position where the fee is lower and the allocation is more diversified.`,
        cost: `${gas} to move`,
        time: '15 minutes',
      },
      {
        text: `Unwind before ${until}: redeem the shares, confirm the USDC is in the wallet, and revoke the vault's allowance.`,
        cost: `${gas} for the redemption`,
        time: '10 minutes',
      },
    ],
    rwa: [
      open,
      {
        text: `Mint or subscribe $${capital} of ${name}'s ${chain} asset with USDC, and read the redemption terms before you sign the first transaction.`,
        cost: `$${capital} plus ${gas}`,
        time: '15 minutes',
      },
      {
        text: `Keep the receipt token in the same wallet and do not lend it out: an RWA position's farm value comes from holding it, not from stacking leverage on it.`,
        cost: 'no extra fee',
        time: '2 minutes',
      },
      activity('one small mint and one redemption of the asset'),
      check,
      {
        text: `Check ${name}'s proof-of-reserve or attestation page once a week; if the collateral backing falls below its stated ratio, exit rather than wait.`,
        cost: 'nothing to check',
        time: '10 minutes a week',
      },
      {
        text: `Unwind before ${until}: redeem the asset for USDC through the protocol's own route, allowing for its stated settlement delay.`,
        cost: `${gas} for the redemption`,
        time: '20 minutes plus settlement',
      },
    ],
    bridge: [
      open,
      {
        text: bridgeStep,
        cost: `$${capital} plus ${gas} on the source chain`,
        time: '15 minutes',
      },
      {
        text: `Use the bridged funds once in a ${bridgeDest} app, so the address records a use as well as a transfer.`,
        cost: `${gas} for the swap or deposit`,
        time: '10 minutes',
      },
      activity(otherChain !== null ? 'one small bridge back and one bridge forward' : 'one small route in and one route out'),
      check,
      {
        text: `Compare ${name}'s route fee with a second bridge to ${bridgeDest}; if the fee rises above 0.3%, move the remaining funds by the cheaper route.`,
        cost: `${gas} for each bridge`,
        time: '15 minutes',
      },
      {
        text: bridgeBack,
        cost: `${gas} on each side`,
        time: '20 minutes',
      },
    ],
    stake: [
      open,
      {
        text: `Acquire $${capital} of ${chain}'s staking asset and stake it through ${name}, keeping the liquid receipt token in the same wallet.`,
        cost: `$${capital} plus ${gas}`,
        time: '15 minutes',
      },
      {
        text: `Record the validator or operator set ${name} uses; a receipt token is only as safe as the operators behind it.`,
        cost: 'no fee to check',
        time: '10 minutes',
      },
      activity('one small stake and one unstake request'),
      check,
      {
        text: `Check ${name}'s staking yield against the chain's base rate; a yield far above it is usually a points programme or a risk you are not being told about.`,
        cost: 'nothing to check',
        time: '10 minutes a week',
      },
      {
        text: `Unwind before ${until}: unstake through the protocol's own queue, allow for the unbonding period, and confirm the receipt token is burned.`,
        cost: `${gas} for the unstake`,
        time: '20 minutes plus unbonding',
      },
    ],
    deriv: [
      open,
      {
        text: `Deposit $${capital} of USDC as margin on ${name} on ${chain}, and set the account's leverage below 3x before opening anything.`,
        cost: `$${capital} of margin plus ${gas}`,
        time: '15 minutes',
      },
      {
        text: `Open one small position in the market ${name} is built for, sized so a 10% adverse move costs less than 5% of the margin.`,
        cost: `${gas} for the open`,
        time: '10 minutes',
      },
      activity('one open and one close of a small position'),
      check,
      {
        text: `Track funding and fees weekly: a position held only for activity can lose more to funding than the farm is likely to return.`,
        cost: 'no fee to check',
        time: '10 minutes a week',
      },
      {
        text: `Unwind before ${until}: close the position, withdraw the margin, and confirm no open order remains on the account.`,
        cost: `${gas} for the close and the withdrawal`,
        time: '15 minutes',
      },
    ],
    chain: [
      open,
      {
        text: `Send $${capital} of ${unit} to ${name}'s own deposit route on ${chain} and keep it in the app rather than in a lending market you have not checked.`,
        cost: `$${capital} plus ${gas} on each side`,
        time: '20 minutes',
      },
      {
        text: `Make one transaction a week on ${chain} — a swap, a transfer or a vote — so the address is active rather than only funded.`,
        cost: `${gas} a week`,
        time: '10 minutes a week',
      },
      activity('one transaction and one small balance move'),
      check,
      {
        text: `Follow ${name}'s own announcement channel for a launch or points page; a chain's incentive usually arrives before its token, not after.`,
        cost: 'nothing to follow',
        time: '5 minutes a week',
      },
      {
        text: `Keep enough of ${chain}'s gas asset for the exit, and unwind before ${until} by withdrawing the balance and moving it back to the wallet you funded from.`,
        cost: `about $${(fee * 4).toFixed(2)} of gas plus the withdrawal fee`,
        time: '20 minutes',
      },
    ],
    insure: [
      open,
      {
        text: `Buy $${capital} of cover from ${name} on ${chain} for a position you actually hold, and read the covered events before paying.`,
        cost: `$${capital} of cover plus its premium`,
        time: '15 minutes',
      },
      {
        text: `Keep the policy and the covered protocol's address in the same file; a claim needs both and a policy nobody can match is worthless.`,
        cost: 'no fee',
        time: '5 minutes',
      },
      activity('one small policy renewal'),
      check,
      {
        text: `Compare ${name}'s premium with a second cover provider on ${chain}; if it doubles, renew only the part of the position you cannot self-insure.`,
        cost: 'nothing to compare',
        time: '10 minutes',
      },
      {
        text: `Before ${until}, decide whether to renew or let the policy lapse, and record the decision with the position it covers.`,
        cost: 'no fee',
        time: '5 minutes',
      },
    ],
    other: [
      open,
      {
        text: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the receipt in the same wallet.`,
        cost: `$${capital} deposited plus ${gas}`,
        time: '10 minutes',
      },
      {
        text: `Read ${name}'s documentation for what the deposit is lent to or swapped through, and write down the exit route before you need it.`,
        cost: 'no fee to read',
        time: '15 minutes',
      },
      activity('one small deposit and one withdrawal'),
      check,
      {
        text: `Check ${name}'s TVL on the protocol's own page once a week; a fall of a third in seven days is a reason to withdraw, not to add.`,
        cost: 'nothing to check',
        time: '5 minutes a week',
      },
      {
        text: `Unwind before ${until}: withdraw the deposit, confirm the USDC is in the wallet, and revoke the protocol's allowance.`,
        cost: `${gas} for the withdrawal`,
        time: '10 minutes',
      },
    ],
  };

  return [...plays[playOf(p.category)], log];
}

/** The live-token protocols, by market cap, for the dashboard's live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays(snapshot.as_of, p.listed_at),
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const watchRows = board.filter((r) => watch.has(r.slug));
  const ages = board.map((r) => r.age_days).filter((a): a is number => a !== null).sort((a, b) => a - b);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.length - watchRows.length,
    live_size: live.length,
    watchlist_tvl_usd: watchRows.reduce((sum, r) => sum + r.tvl_usd, 0),
    total_implied_usd: board.reduce((sum, r) => sum + r.implied_value_usd, 0),
    median_age_days: ages.length === 0 ? null : ages[Math.floor(ages.length / 2)]!,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
    if (board[i]!.implied_value_usd === board[i - 1]!.implied_value_usd) return `rows ${i} and ${i + 1} share implied value $${board[i]!.implied_value_usd}`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
