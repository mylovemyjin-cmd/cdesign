"""
Stock Analysis CLI — main entry point.

Usage:
    python analyze.py AAPL
    python analyze.py 005930 --period 1y
    python analyze.py TSLA --period 3mo
"""
from __future__ import annotations

import os
import sys

import click
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table
from rich.text import Text
from rich import box

load_dotenv()

console = Console()

# ── helpers ────────────────────────────────────────────────────────────────────

def _fmt_price(price: float, ticker: str) -> str:
    if ticker.endswith(".KS") or ticker.endswith(".KQ"):
        return f"₩{price:,.0f}"
    return f"${price:,.2f}"


def _signal_style(signal: str) -> str:
    """Return rich colour tag based on signal text."""
    bullish_signals = {
        "상승", "골든크로스", "강세유지", "정배열", "급증", "증가",
        "과매도", "하단이탈", "상단돌파",  # BB oversold bounce
    }
    bearish_signals = {
        "하락", "데드크로스", "약세유지", "역배열", "감소",
        "과매수",
    }
    if signal in bullish_signals:
        return "green"
    if signal in bearish_signals:
        return "red"
    return "yellow"


def _signal_bullet(signal: str) -> str:
    colour = _signal_style(signal)
    return f"[{colour}]●[/{colour}]"


def _verdict_from_position(position: str) -> tuple[str, str]:
    """(label, colour) from the risk manager's position string."""
    p = position.upper()
    if "BUY" in p:
        return "BUY", "green"
    if "SELL" in p:
        return "SELL", "red"
    return "HOLD", "yellow"


# ── CLI ────────────────────────────────────────────────────────────────────────

@click.command()
@click.argument("ticker")
@click.option(
    "--period",
    default="6mo",
    show_default=True,
    help="분석 기간: 3mo / 6mo / 1y / 2y",
)
def main(ticker: str, period: str) -> None:
    """주식/ETF 기술적 분석 CLI — AI 멀티 에이전트."""

    # Korean stock number shorthand (e.g. 005930 → 005930.KS)
    import re as _re
    if _re.match(r"^\d{6}$", ticker):
        ticker = ticker + ".KS"
    else:
        ticker = ticker.upper()

    # ── 1. 데이터 로드 ──────────────────────────────────────────────────────────
    with Progress(
        SpinnerColumn(),
        TextColumn("[bold cyan]데이터 로딩 중...[/bold cyan]"),
        transient=True,
        console=console,
    ) as prog:
        prog.add_task("fetch", total=None)
        from core.data import fetch_data, is_korean
        result = fetch_data(ticker, period)
        if result is None:
            console.print(f"\n[bold red]오류:[/bold red] '{ticker}' 데이터를 불러올 수 없습니다. 티커를 확인하세요.")
            sys.exit(1)
        df, info, news = result

    # ── 2. 지표 계산 ────────────────────────────────────────────────────────────
    with Progress(
        SpinnerColumn(),
        TextColumn("[bold cyan]기술적 지표 계산 중...[/bold cyan]"),
        transient=True,
        console=console,
    ) as prog:
        prog.add_task("calc", total=None)
        from core.indicators import compute_indicators, get_indicator_summary
        df = compute_indicators(df)
        ind = get_indicator_summary(df)

    # ── 3. AI 에이전트 실행 ─────────────────────────────────────────────────────
    from core.indicators import get_indicator_summary
    from agents.analyst import (
        run_technical_analyst,
        run_news_analyst,
        run_bull_researcher,
        run_bear_researcher,
        run_risk_manager,
    )

    company_name = info.get("longName") or info.get("shortName") or ticker
    current_price = ind["price"]

    price_ctx = {
        "ticker": ticker,
        "company": company_name,
        "current_price": current_price,
        "high_52w": ind["high_52w"],
        "low_52w": ind["low_52w"],
        "pct_from_high": ind["price_vs_high_pct"],
        "pct_from_low": ind["price_vs_low_pct"],
        "volume_vs_20d_avg": ind["vol_ratio"],
    }

    agent_steps = [
        ("기술적 분석가 실행 중...", None),
        ("뉴스/감성 분석가 실행 중...", None),
        ("강세 연구원 실행 중...", None),
        ("약세 연구원 실행 중...", None),
        ("리스크 매니저 최종 판단 중...", None),
    ]

    tech = sentiment = bull = bear = final = None

    with Progress(
        SpinnerColumn(),
        TextColumn("[bold cyan]{task.description}[/bold cyan]"),
        transient=True,
        console=console,
    ) as prog:
        task = prog.add_task(agent_steps[0][0], total=None)
        try:
            tech = run_technical_analyst(ind)
        except Exception as exc:
            tech = {}
            console.print(f"[yellow]경고: 기술적 분석 오류 — {exc}[/yellow]")

        prog.update(task, description=agent_steps[1][0])
        try:
            sentiment = run_news_analyst(news, ticker, company_name)
        except Exception as exc:
            sentiment = {}
            console.print(f"[yellow]경고: 뉴스 분석 오류 — {exc}[/yellow]")

        prog.update(task, description=agent_steps[2][0])
        try:
            bull = run_bull_researcher(tech, sentiment, price_ctx)
        except Exception as exc:
            bull = "강세 논거를 생성할 수 없습니다."
            console.print(f"[yellow]경고: 강세 분석 오류 — {exc}[/yellow]")

        prog.update(task, description=agent_steps[3][0])
        try:
            bear = run_bear_researcher(tech, sentiment, price_ctx)
        except Exception as exc:
            bear = "약세 논거를 생성할 수 없습니다."
            console.print(f"[yellow]경고: 약세 분석 오류 — {exc}[/yellow]")

        prog.update(task, description=agent_steps[4][0])
        try:
            final = run_risk_manager(tech, sentiment, bull, bear, price_ctx)
        except Exception as exc:
            final = {}
            console.print(f"[yellow]경고: 리스크 매니저 오류 — {exc}[/yellow]")

    # ── 4. 가격 헤더 패널 ─────────────────────────────────────────────────────
    prev_close = float(df["Close"].iloc[-2]) if len(df) >= 2 else current_price
    change = current_price - prev_close
    change_pct = (change / prev_close * 100) if prev_close else 0.0
    sign = "+" if change >= 0 else ""
    price_color = "green" if change >= 0 else "red"
    price_str = _fmt_price(current_price, ticker)

    header_text = (
        f"[bold white]{ticker}[/bold white]  |  "
        f"[dim]{company_name}[/dim]  |  "
        f"[bold {price_color}]{price_str}  "
        f"({sign}{change:.2f}  {sign}{change_pct:.2f}%)[/bold {price_color}]"
    )
    console.print()
    console.print(Panel(header_text, box=box.DOUBLE, expand=False))

    # ── 5. 지표 요약 테이블 ────────────────────────────────────────────────────
    ind_table = Table(
        title="[bold]기술적 지표 요약[/bold]",
        box=box.SIMPLE_HEAD,
        header_style="bold magenta",
        expand=False,
        padding=(0, 1),
    )
    ind_table.add_column("지표", style="cyan", no_wrap=True)
    ind_table.add_column("값", justify="right")
    ind_table.add_column("신호", justify="center")

    rsi_val = ind.get("rsi")
    rsi_sig = tech.get("rsi_signal", "중립") if tech else "중립"
    macd_val = ind.get("macd")
    macd_sig_label = tech.get("macd_signal", "중립") if tech else "중립"
    bb_pct = ind.get("bb_pct")
    bb_sig = tech.get("bb_signal", "중립") if tech else "중립"
    ema_sig = tech.get("ema_signal", "중립") if tech else "중립"
    vol_sig = tech.get("volume_signal", "보통") if tech else "보통"
    vol_ratio = ind.get("vol_ratio")

    rows = [
        ("RSI(14)", f"{rsi_val:.2f}" if rsi_val is not None else "N/A", rsi_sig),
        ("MACD", f"{macd_val:.6f}" if macd_val is not None else "N/A", macd_sig_label),
        ("Bollinger", f"BB% {bb_pct:.1f}" if bb_pct is not None else "N/A", bb_sig),
        ("EMA 배열", f"20:{ind.get('ema20', 0):.2f}  50:{ind.get('ema50', 0):.2f}", ema_sig),
        ("거래량", f"{vol_ratio:.2f}x" if vol_ratio is not None else "N/A", vol_sig),
    ]
    for indicator, value, signal in rows:
        ind_table.add_row(indicator, value, f"{_signal_bullet(signal)} {signal}")

    console.print()
    console.print(ind_table)

    # ── 6. 강세/약세 케이스 패널 ──────────────────────────────────────────────
    if bull and isinstance(bull, str) and bull.strip():
        console.print(
            Panel(
                bull,
                title="[bold green]강세 케이스[/bold green]",
                border_style="green",
                expand=False,
            )
        )

    if bear and isinstance(bear, str) and bear.strip():
        console.print(
            Panel(
                bear,
                title="[bold red]약세 케이스[/bold red]",
                border_style="red",
                expand=False,
            )
        )

    # ── 7. 기술적 분석 요약 ────────────────────────────────────────────────────
    if tech and tech.get("summary"):
        console.print(
            Panel(
                tech["summary"],
                title="[bold blue]기술적 분석 요약[/bold blue]",
                border_style="blue",
                expand=False,
            )
        )

    # ── 8. 뉴스 감성 ──────────────────────────────────────────────────────────
    if sentiment and sentiment.get("summary"):
        sent_score = sentiment.get("sentiment_score", 0)
        sent_label = sentiment.get("sentiment_label", "중립")
        sent_color = "green" if sent_score and sent_score > 0 else ("red" if sent_score and sent_score < 0 else "yellow")
        console.print(
            Panel(
                f"[{sent_color}]{sent_label} (점수: {sent_score:+d})[/{sent_color}]\n{sentiment['summary']}",
                title="[bold]뉴스 감성 분석[/bold]",
                border_style=sent_color,
                expand=False,
            )
        )

    # ── 9. 최종 판단 패널 ─────────────────────────────────────────────────────
    position = final.get("position", "HOLD") if final else "HOLD"
    confidence = final.get("confidence", 5) if final else 5
    entry_price = final.get("entry_price", current_price) if final else current_price
    target_price = final.get("target_price", current_price) if final else current_price
    stop_loss = final.get("stop_loss", current_price) if final else current_price
    time_horizon = final.get("time_horizon", "N/A") if final else "N/A"
    entry_strategy = final.get("entry_strategy", "N/A") if final else "N/A"
    rationale = final.get("rationale", "") if final else ""
    key_risks = final.get("key_risks", []) if final else []

    verdict_label, verdict_color = _verdict_from_position(position)

    verdict_text = Text(justify="center")
    verdict_text.append("  최종 판단: ", style="bold white")
    verdict_text.append(f"{verdict_label}", style=f"bold {verdict_color}")
    verdict_text.append(f"   신뢰도: {confidence}/10\n", style="bold white")
    verdict_text.append(
        f"  진입가: {_fmt_price(entry_price, ticker)}   "
        f"목표가: {_fmt_price(target_price, ticker)}   "
        f"손절: {_fmt_price(stop_loss, ticker)}  \n",
        style="white",
    )
    verdict_text.append(f"  전략: {entry_strategy}   기간: {time_horizon}  ", style="dim white")

    console.print()
    console.print(
        Panel(
            verdict_text,
            box=box.DOUBLE,
            border_style=verdict_color,
            expand=False,
        )
    )

    # Rationale & key risks
    if rationale:
        console.print(
            Panel(
                rationale,
                title="[bold]판단 근거[/bold]",
                border_style=verdict_color,
                expand=False,
            )
        )

    if key_risks:
        risks_text = "\n".join(f"  • {r}" for r in key_risks)
        console.print(
            Panel(
                risks_text,
                title="[bold yellow]주요 리스크[/bold yellow]",
                border_style="yellow",
                expand=False,
            )
        )

    console.print()


if __name__ == "__main__":
    # Allow running from the stock_agent directory directly
    sys.path.insert(0, os.path.dirname(__file__))
    main()
