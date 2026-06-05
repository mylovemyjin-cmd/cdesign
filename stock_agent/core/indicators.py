import pandas as pd
import pandas_ta as ta


def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.ta.rsi(length=14, append=True)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)
    df.ta.bbands(length=20, std=2.0, append=True)
    df.ta.ema(length=20, append=True)
    df.ta.ema(length=50, append=True)
    df.ta.ema(length=200, append=True)
    df.ta.stoch(k=14, d=3, smooth_k=3, append=True)
    df.ta.atr(length=14, append=True)
    df.ta.obv(append=True)
    return df


def _col(df: pd.DataFrame, prefix: str):
    cols = [c for c in df.columns if c.startswith(prefix)]
    return cols[0] if cols else None


def get_indicator_summary(df: pd.DataFrame) -> dict:
    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) >= 2 else last
    price = float(last['Close'])

    def v(col):
        c = _col(df, col)
        return float(last[c]) if c and pd.notna(last[c]) else None

    rsi = v('RSI_')
    macd = v('MACD_')
    macd_sig = v('MACDs_')
    macd_hist = v('MACDh_')
    bb_u = v('BBU_')
    bb_l = v('BBL_')
    bb_m = v('BBM_')
    ema20 = v('EMA_20')
    ema50 = v('EMA_50')
    ema200 = v('EMA_200')
    stoch_k = v('STOCHk_')
    stoch_d = v('STOCHd_')
    atr = v('ATRr_') or v('ATR_')

    macd_hist_prev_col = _col(df, 'MACDh_')
    macd_hist_prev = float(prev[macd_hist_prev_col]) if macd_hist_prev_col and pd.notna(prev[macd_hist_prev_col]) else None

    bb_pct = round((price - bb_l) / (bb_u - bb_l) * 100, 1) if bb_u and bb_l and bb_u != bb_l else None

    vol_series = df['Volume'].dropna()
    vol_avg = int(vol_series.tail(20).mean()) if len(vol_series) >= 5 else 0
    vol_last = int(last['Volume']) if pd.notna(last['Volume']) else 0

    return {
        'price': round(price, 4),
        'rsi': round(rsi, 2) if rsi is not None else None,
        'macd': round(macd, 6) if macd is not None else None,
        'macd_signal': round(macd_sig, 6) if macd_sig is not None else None,
        'macd_hist': round(macd_hist, 6) if macd_hist is not None else None,
        'macd_hist_prev': round(macd_hist_prev, 6) if macd_hist_prev is not None else None,
        'bb_upper': round(bb_u, 4) if bb_u is not None else None,
        'bb_lower': round(bb_l, 4) if bb_l is not None else None,
        'bb_mid': round(bb_m, 4) if bb_m is not None else None,
        'bb_pct': bb_pct,
        'ema20': round(ema20, 4) if ema20 is not None else None,
        'ema50': round(ema50, 4) if ema50 is not None else None,
        'ema200': round(ema200, 4) if ema200 is not None else None,
        'stoch_k': round(stoch_k, 2) if stoch_k is not None else None,
        'stoch_d': round(stoch_d, 2) if stoch_d is not None else None,
        'atr': round(atr, 4) if atr is not None else None,
        'atr_pct': round(atr / price * 100, 2) if atr and price else None,
        'vol_avg_20d': vol_avg,
        'vol_last': vol_last,
        'vol_ratio': round(vol_last / vol_avg, 2) if vol_avg else None,
        'high_52w': round(float(df['High'].max()), 4),
        'low_52w': round(float(df['Low'].min()), 4),
        'price_vs_high_pct': round((price - float(df['High'].max())) / float(df['High'].max()) * 100, 2),
        'price_vs_low_pct': round((price - float(df['Low'].min())) / float(df['Low'].min()) * 100, 2),
    }
