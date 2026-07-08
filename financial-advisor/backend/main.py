"""Financial Advisor & Tax Optimization API.

FastAPI backend mirroring the mobile app's local-first engines so the same
logic can be served centrally: live mock FX rates, multi-jurisdiction tax
computation (US IRS, SA SARS, UK HMRC), portfolio valuation, and risk-based
investment advice.

Run locally:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import math
import random
import time
from typing import Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

CurrencyCode = Literal["USD", "ZAR", "GBP"]
RiskTolerance = Literal["Low", "Medium", "High"]
Jurisdiction = Literal["US_IRS", "SA_SARS", "UK_HMRC"]

app = FastAPI(
    title="Financial Advisor API",
    version="1.0.0",
    description=(
        "Multi-currency FX conversion, tax estimation and investment "
        "advisory endpoints for the Financial Advisor app."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# FX engine
# ---------------------------------------------------------------------------

ANCHOR_PER_USD: Dict[str, float] = {"USD": 1.0, "ZAR": 18.42, "GBP": 0.7885}
MAX_DRIFT = 0.03
TICK_VOL = 0.0018
POLL_INTERVAL_SECONDS = 5

_current_per_usd: Dict[str, float] = dict(ANCHOR_PER_USD)
_previous_per_usd: Dict[str, float] = dict(ANCHOR_PER_USD)
_last_tick_time = time.monotonic()
_tick_count = 0


def _walk_once() -> None:
    global _previous_per_usd, _tick_count
    _previous_per_usd = dict(_current_per_usd)
    for code, anchor in ANCHOR_PER_USD.items():
        if code == "USD":
            continue
        shock = (random.random() * 2 - 1) * TICK_VOL
        reversion = ((anchor - _current_per_usd[code]) / anchor) * 0.05
        nxt = _current_per_usd[code] * (1 + shock + reversion)
        lo, hi = anchor * (1 - MAX_DRIFT), anchor * (1 + MAX_DRIFT)
        _current_per_usd[code] = min(hi, max(lo, nxt))
    _tick_count += 1


def _advance_clock() -> None:
    """Advance the random walk once per poll interval, on demand."""
    global _last_tick_time
    now = time.monotonic()
    elapsed_ticks = int((now - _last_tick_time) / POLL_INTERVAL_SECONDS)
    for _ in range(min(elapsed_ticks, 50)):
        _walk_once()
    if elapsed_ticks > 0:
        _last_tick_time = now


class RatesResponse(BaseModel):
    per_usd: Dict[str, float]
    tick: int
    poll_interval_seconds: int


@app.get("/rates", response_model=RatesResponse, tags=["fx"])
def get_rates() -> RatesResponse:
    """Current mock FX rates, quoted as units of currency per 1 USD."""
    _advance_clock()
    return RatesResponse(
        per_usd=dict(_current_per_usd),
        tick=_tick_count,
        poll_interval_seconds=POLL_INTERVAL_SECONDS,
    )


class ConvertRequest(BaseModel):
    amount: float
    from_currency: CurrencyCode = Field(alias="from")
    to_currency: CurrencyCode = Field(alias="to")

    model_config = {"populate_by_name": True}


class ConvertResponse(BaseModel):
    amount: float
    from_currency: CurrencyCode
    to_currency: CurrencyCode
    converted: float
    rate: float


def _convert(amount: float, from_c: str, to_c: str) -> float:
    return amount / _current_per_usd[from_c] * _current_per_usd[to_c]


@app.post("/convert", response_model=ConvertResponse, tags=["fx"])
def convert_amount(payload: ConvertRequest) -> ConvertResponse:
    """Convert an amount between USD, ZAR and GBP at the live mock rate."""
    _advance_clock()
    converted = _convert(payload.amount, payload.from_currency, payload.to_currency)
    rate = _convert(1.0, payload.from_currency, payload.to_currency)
    return ConvertResponse(
        amount=payload.amount,
        from_currency=payload.from_currency,
        to_currency=payload.to_currency,
        converted=converted,
        rate=rate,
    )


# ---------------------------------------------------------------------------
# Tax engine
# ---------------------------------------------------------------------------


class Bracket(BaseModel):
    from_amount: float
    to_amount: Optional[float]
    rate: float


TAX_RULES: Dict[str, dict] = {
    "US_IRS": {
        "authority": "IRS",
        "country": "United States",
        "currency": "USD",
        "personal_allowance": 14600.0,
        "allowance_taper_threshold": None,
        "rebate": 0.0,
        "brackets": [
            (0, 11600, 0.10),
            (11600, 47150, 0.12),
            (47150, 100525, 0.22),
            (100525, 191950, 0.24),
            (191950, 243725, 0.32),
            (243725, 609350, 0.35),
            (609350, None, 0.37),
        ],
        "cgt": {
            "annual_exclusion": 0.0,
            "inclusion_rate": 1.0,
            "bands": [(0, 47025, 0.0), (47025, 518900, 0.15), (518900, None, 0.20)],
        },
    },
    "SA_SARS": {
        "authority": "SARS",
        "country": "South Africa",
        "currency": "ZAR",
        "personal_allowance": 0.0,
        "allowance_taper_threshold": None,
        "rebate": 17235.0,
        "brackets": [
            (0, 237100, 0.18),
            (237100, 370500, 0.26),
            (370500, 512800, 0.31),
            (512800, 673000, 0.36),
            (673000, 857900, 0.39),
            (857900, 1817000, 0.41),
            (1817000, None, 0.45),
        ],
        "cgt": {
            "annual_exclusion": 40000.0,
            "inclusion_rate": 0.4,
            "bands": [
                (0, 237100, 0.18),
                (237100, 370500, 0.26),
                (370500, 512800, 0.31),
                (512800, 673000, 0.36),
                (673000, 857900, 0.39),
                (857900, 1817000, 0.41),
                (1817000, None, 0.45),
            ],
        },
    },
    "UK_HMRC": {
        "authority": "HMRC",
        "country": "United Kingdom",
        "currency": "GBP",
        "personal_allowance": 12570.0,
        "allowance_taper_threshold": 100000.0,
        "rebate": 0.0,
        "brackets": [(0, 37700, 0.20), (37700, 112570, 0.40), (112570, None, 0.45)],
        "cgt": {
            "annual_exclusion": 3000.0,
            "inclusion_rate": 1.0,
            "bands": [(0, 37700, 0.18), (37700, None, 0.24)],
        },
    },
}

JURISDICTION_FOR_CURRENCY: Dict[str, str] = {
    "USD": "US_IRS",
    "ZAR": "SA_SARS",
    "GBP": "UK_HMRC",
}


def _tax_from_brackets(taxable: float, brackets: list) -> Dict[str, float]:
    total = 0.0
    marginal = brackets[0][2]
    for lo, hi, rate in brackets:
        upper = hi if hi is not None else math.inf
        amount = max(0.0, min(taxable, upper) - lo)
        if amount > 0:
            marginal = rate
        total += amount * rate
    return {"total": total, "marginal": marginal}


class TaxRequest(BaseModel):
    annual_income: float = Field(ge=0)
    income_currency: CurrencyCode = "USD"
    unrealized_gain: float = 0.0
    gain_currency: CurrencyCode = "USD"
    jurisdiction: Optional[Jurisdiction] = None
    base_currency: CurrencyCode = "USD"


class TaxResponse(BaseModel):
    jurisdiction: Jurisdiction
    authority: str
    local_currency: CurrencyCode
    income_local: float
    income_tax_local: float
    effective_rate: float
    marginal_rate: float
    cgt_local: float
    total_tax_in_base: float
    base_currency: CurrencyCode


@app.post("/tax/estimate", response_model=TaxResponse, tags=["tax"])
def estimate_tax(payload: TaxRequest) -> TaxResponse:
    """Estimate income tax plus capital gains tax under the jurisdiction
    implied by the base currency (or an explicit jurisdiction override)."""
    _advance_clock()
    jurisdiction = payload.jurisdiction or JURISDICTION_FOR_CURRENCY[
        payload.base_currency
    ]
    rules = TAX_RULES[jurisdiction]
    local: str = rules["currency"]

    income_local = _convert(payload.annual_income, payload.income_currency, local)
    gain_local = max(0.0, _convert(payload.unrealized_gain, payload.gain_currency, local))

    allowance = rules["personal_allowance"]
    taper = rules["allowance_taper_threshold"]
    if taper is not None and income_local > taper:
        allowance = max(0.0, allowance - (income_local - taper) / 2)
    taxable = max(0.0, income_local - allowance)
    income_result = _tax_from_brackets(taxable, rules["brackets"])
    income_tax = max(0.0, income_result["total"] - rules["rebate"])

    cgt_rules = rules["cgt"]
    taxable_gain = max(0.0, gain_local - cgt_rules["annual_exclusion"])
    taxable_gain *= cgt_rules["inclusion_rate"]
    if jurisdiction == "SA_SARS":
        base = max(0.0, income_local)
    else:
        base = max(0.0, income_local - rules["personal_allowance"])
    with_gain = _tax_from_brackets(base + taxable_gain, cgt_rules["bands"])["total"]
    without_gain = _tax_from_brackets(base, cgt_rules["bands"])["total"]
    cgt = max(0.0, with_gain - without_gain)

    total_base = _convert(income_tax + cgt, local, payload.base_currency)

    return TaxResponse(
        jurisdiction=jurisdiction,  # type: ignore[arg-type]
        authority=rules["authority"],
        local_currency=local,  # type: ignore[arg-type]
        income_local=income_local,
        income_tax_local=income_tax,
        effective_rate=income_tax / income_local if income_local > 0 else 0.0,
        marginal_rate=income_result["marginal"],
        cgt_local=cgt,
        total_tax_in_base=total_base,
        base_currency=payload.base_currency,
    )


# ---------------------------------------------------------------------------
# Portfolio valuation
# ---------------------------------------------------------------------------


class HoldingIn(BaseModel):
    asset_name: str
    asset_type: Literal["Stock", "Bond", "Crypto"]
    purchase_currency: CurrencyCode
    purchase_price: float = Field(gt=0)
    current_price: float = Field(gt=0)
    quantity: float = Field(gt=0)
    purchase_date: str


class PortfolioRequest(BaseModel):
    holdings: List[HoldingIn]
    base_currency: CurrencyCode = "USD"


class PortfolioResponse(BaseModel):
    base_currency: CurrencyCode
    total_value: float
    total_cost: float
    unrealized_gain: float
    unrealized_gain_pct: float


@app.post("/portfolio/summary", response_model=PortfolioResponse, tags=["portfolio"])
def portfolio_summary(payload: PortfolioRequest) -> PortfolioResponse:
    """Value a multi-currency ledger in the requested base currency."""
    _advance_clock()
    total_value = 0.0
    total_cost = 0.0
    for holding in payload.holdings:
        value = holding.current_price * holding.quantity
        cost = holding.purchase_price * holding.quantity
        total_value += _convert(value, holding.purchase_currency, payload.base_currency)
        total_cost += _convert(cost, holding.purchase_currency, payload.base_currency)
    gain = total_value - total_cost
    return PortfolioResponse(
        base_currency=payload.base_currency,
        total_value=total_value,
        total_cost=total_cost,
        unrealized_gain=gain,
        unrealized_gain_pct=(gain / total_cost * 100) if total_cost > 0 else 0.0,
    )


# ---------------------------------------------------------------------------
# Investment advisor
# ---------------------------------------------------------------------------

RECOMMENDATIONS: Dict[str, list] = {
    "Low": [
        ("US Treasury Bond ETF", "GOVT", "Bond", "Buy", "USD", 40,
         "Government bonds anchor a low-risk portfolio with predictable coupon income."),
        ("SA Retail Savings Bond", "RSA-5YR", "Bond", "Accumulate", "ZAR", 25,
         "RSA retail bonds pay double-digit rand yields backed by the state."),
        ("UK Gilts Index Fund", "VGOV", "Bond", "Buy", "GBP", 20,
         "Gilts hedge sterling liabilities and stabilise equity drawdowns."),
        ("Global Dividend Aristocrats", "NOBL", "Stock", "Accumulate", "USD", 15,
         "25+ years of dividend growth adds equity upside at low volatility."),
    ],
    "Medium": [
        ("S&P 500 Index ETF", "VOO", "ETF", "Buy", "USD", 35,
         "Core US equity exposure that compounds reliably over 5+ years."),
        ("JSE Top 40 Tracker", "STX40", "ETF", "Accumulate", "ZAR", 20,
         "Broad rand equity exposure with resource-sector upside."),
        ("FTSE 100 Income ETF", "ISF", "ETF", "Buy", "GBP", 20,
         "UK large caps at a discount with a ~4% sterling dividend yield."),
        ("Investment-Grade Corporate Bonds", "LQD", "Bond", "Hold", "USD", 15,
         "Corporate credit balances the equity sleeve and locks in yield."),
        ("Bitcoin (satellite position)", "BTC", "Crypto", "Accumulate", "USD", 5,
         "A small crypto sleeve adds asymmetric upside; keep it under 5%."),
    ],
    "High": [
        ("Nasdaq 100 Growth ETF", "QQQ", "ETF", "Buy", "USD", 35,
         "Concentrated AI and mega-cap tech exposure for aggressive growth."),
        ("Bitcoin", "BTC", "Crypto", "Accumulate", "USD", 15,
         "Hard-capped supply and institutional adoption support a full allocation."),
        ("Ethereum", "ETH", "Crypto", "Buy", "USD", 10,
         "Staking yield plus smart-contract network effects diversify crypto."),
        ("SA Small-Cap Value", "SMLCAP", "Stock", "Accumulate", "ZAR", 15,
         "Deep-value rand small caps offer multi-bagger recovery potential."),
        ("UK AIM Growth Basket", "AIM-GRW", "Stock", "Buy", "GBP", 10,
         "AIM growth shares carry IHT relief after two years."),
    ],
}


class AdviceRequest(BaseModel):
    risk_tolerance: RiskTolerance
    cash_reserves: float = Field(ge=0)
    cash_currency: CurrencyCode = "USD"
    base_currency: CurrencyCode = "USD"


class AdviceSignal(BaseModel):
    title: str
    ticker: str
    asset_type: str
    action: str
    trade_currency: CurrencyCode
    target_allocation_pct: float
    suggested_amount: float
    rationale: str


class AdviceResponse(BaseModel):
    risk_tolerance: RiskTolerance
    base_currency: CurrencyCode
    investable_cash_base: float
    signals: List[AdviceSignal]


@app.post("/advice", response_model=AdviceResponse, tags=["advisory"])
def get_advice(payload: AdviceRequest) -> AdviceResponse:
    """Risk-matched, cash-sized asset recommendations in the base currency."""
    _advance_clock()
    if payload.risk_tolerance not in RECOMMENDATIONS:
        raise HTTPException(status_code=422, detail="Unknown risk tolerance")
    cash_base = _convert(
        payload.cash_reserves, payload.cash_currency, payload.base_currency
    )
    templates = RECOMMENDATIONS[payload.risk_tolerance]
    total_pct = sum(t[5] for t in templates)
    signals = [
        AdviceSignal(
            title=title,
            ticker=ticker,
            asset_type=asset_type,
            action=action,
            trade_currency=currency,  # type: ignore[arg-type]
            target_allocation_pct=pct,
            suggested_amount=cash_base * pct / total_pct,
            rationale=rationale,
        )
        for title, ticker, asset_type, action, currency, pct, rationale in templates
    ]
    return AdviceResponse(
        risk_tolerance=payload.risk_tolerance,
        base_currency=payload.base_currency,
        investable_cash_base=cash_base,
        signals=signals,
    )


@app.get("/health", tags=["meta"])
def health() -> Dict[str, str]:
    return {"status": "ok"}
