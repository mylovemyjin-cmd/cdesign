import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd


def _first_col(df: pd.DataFrame, prefix: str):
    cols = [c for c in df.columns if c.startswith(prefix)]
    return cols[0] if cols else None


def build_price_chart(df: pd.DataFrame, ticker: str) -> go.Figure:
    fig = make_subplots(
        rows=4, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.015,
        row_heights=[0.50, 0.15, 0.175, 0.175],
        subplot_titles=('가격', '거래량', 'RSI (14)', 'MACD'),
    )

    fig.add_trace(go.Candlestick(
        x=df.index, open=df['Open'], high=df['High'],
        low=df['Low'], close=df['Close'],
        name='Price', showlegend=False,
        increasing_line_color='#26a69a',
        decreasing_line_color='#ef5350',
    ), row=1, col=1)

    bb_u = _first_col(df, 'BBU_')
    bb_l = _first_col(df, 'BBL_')
    bb_m = _first_col(df, 'BBM_')
    if bb_u and bb_l and bb_m:
        fig.add_trace(go.Scatter(
            x=df.index, y=df[bb_u],
            line=dict(color='rgba(100,180,255,0.3)', width=1),
            name='BB Upper', showlegend=False,
        ), row=1, col=1)
        fig.add_trace(go.Scatter(
            x=df.index, y=df[bb_l],
            line=dict(color='rgba(100,180,255,0.3)', width=1),
            fill='tonexty', fillcolor='rgba(100,180,255,0.05)',
            name='BB Lower', showlegend=False,
        ), row=1, col=1)
        fig.add_trace(go.Scatter(
            x=df.index, y=df[bb_m],
            line=dict(color='rgba(100,180,255,0.35)', width=1, dash='dot'),
            name='BB Mid', showlegend=False,
        ), row=1, col=1)

    ema_config = [('EMA_20', '#FFD700', 'EMA 20'), ('EMA_50', '#FF8C00', 'EMA 50'), ('EMA_200', '#FF4500', 'EMA 200')]
    for col, color, label in ema_config:
        if col in df.columns:
            fig.add_trace(go.Scatter(
                x=df.index, y=df[col],
                line=dict(color=color, width=1.5),
                name=label,
            ), row=1, col=1)

    vol_colors = ['#26a69a' if c >= o else '#ef5350'
                  for c, o in zip(df['Close'], df['Open'])]
    fig.add_trace(go.Bar(
        x=df.index, y=df['Volume'],
        marker_color=vol_colors, name='Volume', showlegend=False,
    ), row=2, col=1)

    rsi_col = _first_col(df, 'RSI_')
    if rsi_col:
        fig.add_trace(go.Scatter(
            x=df.index, y=df[rsi_col],
            line=dict(color='#9B59B6', width=1.5),
            name='RSI', showlegend=False,
        ), row=3, col=1)
        fig.add_hline(y=70, line_dash='dash', line_color='rgba(255,80,80,0.5)', row=3, col=1)
        fig.add_hline(y=30, line_dash='dash', line_color='rgba(80,255,80,0.5)', row=3, col=1)
        fig.add_hline(y=50, line_dash='dot', line_color='rgba(255,255,255,0.2)', row=3, col=1)
        fig.add_hrect(y0=70, y1=100, fillcolor='rgba(255,0,0,0.04)', line_width=0, row=3, col=1)
        fig.add_hrect(y0=0, y1=30, fillcolor='rgba(0,200,0,0.04)', line_width=0, row=3, col=1)

    macd_col = _first_col(df, 'MACD_')
    macds_col = _first_col(df, 'MACDs_')
    macdh_col = _first_col(df, 'MACDh_')
    if macd_col and macds_col and macdh_col:
        hist = df[macdh_col]
        hist_colors = ['#26a69a' if v >= 0 else '#ef5350' for v in hist]
        fig.add_trace(go.Bar(
            x=df.index, y=hist,
            marker_color=hist_colors, name='MACD Hist', showlegend=False,
        ), row=4, col=1)
        fig.add_trace(go.Scatter(
            x=df.index, y=df[macd_col],
            line=dict(color='#2196F3', width=1.5), name='MACD', showlegend=False,
        ), row=4, col=1)
        fig.add_trace(go.Scatter(
            x=df.index, y=df[macds_col],
            line=dict(color='#FF9800', width=1.5), name='Signal', showlegend=False,
        ), row=4, col=1)

    fig.update_layout(
        template='plotly_dark',
        height=700,
        xaxis_rangeslider_visible=False,
        title=dict(text=f'{ticker} 기술적 분석 차트', font=dict(size=14)),
        margin=dict(t=60, b=10, l=0, r=10),
        legend=dict(orientation='h', yanchor='bottom', y=1.02, xanchor='right', x=1, font=dict(size=11)),
        paper_bgcolor='#0e1117',
        plot_bgcolor='#0e1117',
    )
    fig.update_yaxes(gridcolor='rgba(255,255,255,0.05)', zerolinecolor='rgba(255,255,255,0.1)')
    fig.update_xaxes(gridcolor='rgba(255,255,255,0.05)', rangebreaks=[dict(bounds=['sat', 'mon'])])

    return fig
