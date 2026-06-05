import re
import yfinance as yf
import pandas as pd


def format_ticker(raw: str) -> str:
    if re.match(r'^\d{6}$', raw):
        return raw + '.KS'
    if re.match(r'^\d{6}\.KQ$', raw, re.IGNORECASE):
        return raw.upper()
    return raw.upper()


def is_korean(ticker: str) -> bool:
    return ticker.endswith('.KS') or ticker.endswith('.KQ')


def format_price(price: float, ticker: str) -> str:
    if is_korean(ticker):
        return f"₩{price:,.0f}"
    return f"${price:.2f}"


def fetch_data(ticker: str, period: str):
    try:
        t = yf.Ticker(ticker)
        df = t.history(period=period, interval='1d', auto_adjust=True)
        if df.empty or len(df) < 20:
            return None
        info = {}
        try:
            info = t.info or {}
        except Exception:
            pass
        news = []
        try:
            raw_news = t.news
            if raw_news:
                news = raw_news[:10]
        except Exception:
            pass
        return df, info, news
    except Exception:
        return None
