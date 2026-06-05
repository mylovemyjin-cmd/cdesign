import os
import sys
import streamlit as st
from dotenv import load_dotenv
import pandas as pd

load_dotenv()

sys.path.insert(0, os.path.dirname(__file__))

from core.data import fetch_data, format_ticker, format_price, is_korean
from core.indicators import compute_indicators
from core.chart import build_price_chart
from agents.analyst import run_analysis

st.set_page_config(
    page_title="주식 기술적 분석 에이전트",
    page_icon="📈",
    layout="wide",
)

st.markdown("""
<style>
.decision-card {
    padding: 24px;
    border-radius: 12px;
    text-align: center;
    margin-bottom: 16px;
}
.metric-pill {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 13px;
    margin: 2px;
}
</style>
""", unsafe_allow_html=True)

st.title("📈 주식 기술적 분석 에이전트")
st.caption("RSI · MACD · Bollinger Bands · EMA | 멀티에이전트 AI 분석 (미국 · 한국 주식)")

with st.form("analysis_form"):
    col1, col2, col3 = st.columns([3, 2, 1])
    with col1:
        ticker_input = st.text_input(
            "티커 입력",
            placeholder="AAPL · TSLA · NVDA · 005930 · 035720.KQ",
            help="미국: AAPL, TSLA, NVDA  |  한국 KOSPI: 005930 (자동 변환)  |  KOSDAQ: 035720.KQ",
        )
    with col2:
        period = st.selectbox("분석 기간", ["3mo", "6mo", "1y", "2y"], index=1,
                              format_func=lambda x: {"3mo": "3개월", "6mo": "6개월", "1y": "1년", "2y": "2년"}[x])
    with col3:
        st.write("")
        submitted = st.form_submit_button("분석 시작 🚀", type="primary", use_container_width=True)

if submitted and ticker_input:
    ticker = format_ticker(ticker_input.strip())

    with st.spinner(f"📡 {ticker} 데이터 수신 중..."):
        data = fetch_data(ticker, period)

    if data is None:
        st.error(f"❌ '{ticker}' 데이터를 불러올 수 없습니다. 티커를 확인하거나 '.KS' / '.KQ' 접미사를 붙여보세요.")
        st.stop()

    df, info, news = data
    df = compute_indicators(df)

    price = float(df['Close'].iloc[-1])
    prev_price = float(df['Close'].iloc[-2])
    change = price - prev_price
    change_pct = (change / prev_price) * 100

    company_name = info.get('longName') or info.get('shortName') or ticker

    st.subheader(f"{company_name} ({ticker})")

    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("현재가", format_price(price, ticker))
    c2.metric("전일 대비", f"{change:+.2f}", f"{change_pct:+.2f}%")
    c3.metric("거래량", f"{int(df['Volume'].iloc[-1]):,}")
    c4.metric("52주 고가", format_price(float(df['High'].max()), ticker))
    c5.metric("52주 저가", format_price(float(df['Low'].min()), ticker))

    st.plotly_chart(build_price_chart(df, ticker), use_container_width=True)

    ind_cols = df.columns.tolist()
    rsi_col = next((c for c in ind_cols if c.startswith('RSI_')), None)
    macd_col = next((c for c in ind_cols if c.startswith('MACD_') and not c.startswith('MACDs_') and not c.startswith('MACDh_')), None)
    macds_col = next((c for c in ind_cols if c.startswith('MACDs_')), None)
    bb_pct_col = next((c for c in ind_cols if c.startswith('BBP_')), None)

    last = df.iloc[-1]
    with st.expander("📐 지표 상세 보기", expanded=False):
        ic1, ic2, ic3, ic4 = st.columns(4)
        if rsi_col and not pd.isna(last[rsi_col]):
            ic1.metric("RSI (14)", f"{last[rsi_col]:.1f}", help="30 이하=과매도, 70 이상=과매수")
        if macd_col and macds_col and not pd.isna(last[macd_col]):
            ic2.metric("MACD", f"{last[macd_col]:.4f}", f"Signal: {last[macds_col]:.4f}")
        if bb_pct_col and not pd.isna(last[bb_pct_col]):
            ic3.metric("BB %", f"{last[bb_pct_col]*100:.1f}%", help="0%=하단, 100%=상단")
        ema200_col = 'EMA_200'
        if ema200_col in df.columns and not pd.isna(last[ema200_col]):
            above = price > last[ema200_col]
            ic4.metric("vs EMA200", format_price(last[ema200_col], ticker), "위" if above else "아래")

    st.divider()
    st.subheader("🤖 멀티에이전트 AI 분석")
    st.caption("5개 전문 에이전트가 순차적으로 분석합니다 — 기술 분석가 → 뉴스 분석가 → 강세 연구원 → 약세 연구원 → 리스크 매니저")

    progress_bar = st.progress(0)
    status_text = st.empty()

    def update_progress(msg: str, pct: float):
        progress_bar.progress(pct)
        status_text.text(msg)

    try:
        results = run_analysis(df, info, news, ticker, progress_callback=update_progress)
    except Exception as e:
        st.error(f"AI 분석 중 오류가 발생했습니다: {e}")
        st.stop()

    progress_bar.empty()
    status_text.empty()

    tech = results['tech']
    sentiment = results['sentiment']
    bull = results['bull']
    bear = results['bear']
    final = results['final']

    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "⚖️ 최종 판단", "📊 기술적 분석", "📰 뉴스 감성", "🟢 강세 케이스", "🔴 약세 케이스"
    ])

    with tab1:
        position = final.get('position', 'HOLD')
        confidence = final.get('confidence', 5)
        color_map = {'BUY': '#26a69a', 'SELL': '#ef5350', 'HOLD': '#FFA726'}
        emoji_map = {'BUY': '🟢', 'SELL': '🔴', 'HOLD': '🟡'}
        bg_color = color_map.get(position, '#FFA726')
        pos_emoji = emoji_map.get(position, '🟡')

        stars = '★' * confidence + '☆' * (10 - confidence)
        st.markdown(f"""
<div class="decision-card" style="background: {bg_color}18; border: 2px solid {bg_color};">
    <h1 style="color: {bg_color}; margin: 0; font-size: 3rem;">{pos_emoji} {position}</h1>
    <p style="color: #ccc; margin: 8px 0; font-size: 1.1rem;">신뢰도 {stars} ({confidence}/10)</p>
    <p style="color: #aaa; font-size: 0.9rem;">{final.get('time_horizon', '')} · {final.get('entry_strategy', '')}</p>
</div>
""", unsafe_allow_html=True)

        fc1, fc2, fc3, fc4 = st.columns(4)
        fc1.metric("진입 전략 가격", format_price(final.get('entry_price', 0), ticker))
        fc2.metric("목표가", format_price(final.get('target_price', 0), ticker),
                   f"+{final.get('expected_return_pct', 0):.1f}%" if final.get('expected_return_pct') else None)
        fc3.metric("손절가", format_price(final.get('stop_loss', 0), ticker))
        fc4.metric("손익비 (R:R)", f"1 : {final.get('risk_reward_ratio', 0):.1f}")

        if final.get('rationale'):
            st.info(f"**판단 근거**\n\n{final['rationale']}")

        if final.get('key_risks'):
            st.warning("**주요 리스크**\n\n" + "\n".join(f"• {r}" for r in final['key_risks']))

        st.caption(f"권장 포지션 크기: {final.get('position_size', 'N/A')}")

    with tab2:
        if tech:
            t1, t2, t3 = st.columns(3)
            t1.metric("트렌드", tech.get('trend', 'N/A'), f"강도 {tech.get('trend_strength', 0)}/10")
            t2.metric("기술 점수", f"{tech.get('technical_score', 0)}/10")
            t3.metric("EMA 배열", tech.get('ema_signal', 'N/A'))

            signal_cols = st.columns(4)
            signal_cols[0].metric("RSI 신호", tech.get('rsi_signal', 'N/A'))
            signal_cols[1].metric("MACD 신호", tech.get('macd_signal', 'N/A'))
            signal_cols[2].metric("Bollinger 신호", tech.get('bb_signal', 'N/A'))
            signal_cols[3].metric("거래량 신호", tech.get('volume_signal', 'N/A'))

            if tech.get('support') and tech.get('resistance'):
                sup_col, res_col = st.columns(2)
                sup_col.metric("지지선", format_price(tech['support'], ticker))
                res_col.metric("저항선", format_price(tech['resistance'], ticker))

            if tech.get('summary'):
                st.info(tech['summary'])

    with tab3:
        if sentiment:
            score = sentiment.get('sentiment_score', 0)
            label = sentiment.get('sentiment_label', '중립')
            score_color = '#26a69a' if score > 0 else '#ef5350' if score < 0 else '#FFA726'
            st.markdown(f"**감성 지수:** <span style='color:{score_color}; font-size:1.2rem; font-weight:bold;'>{score:+d} ({label})</span>", unsafe_allow_html=True)

            if sentiment.get('catalyst'):
                st.success(f"**주요 촉매:** {sentiment['catalyst']}")

            if sentiment.get('key_themes'):
                st.write("**핵심 테마:**", " · ".join(sentiment['key_themes']))

            if sentiment.get('risk_factors'):
                st.warning("**리스크 요인:**\n" + "\n".join(f"• {r}" for r in sentiment['risk_factors']))

            if sentiment.get('summary'):
                st.info(sentiment['summary'])

            if news:
                with st.expander(f"📰 원문 뉴스 ({len(news)}건)", expanded=False):
                    for item in news[:10]:
                        title = ""
                        link = ""
                        if isinstance(item, dict):
                            content = item.get('content', {})
                            if isinstance(content, dict):
                                title = content.get('title', '')
                                link = content.get('canonicalUrl', {}).get('url', '') if isinstance(content.get('canonicalUrl'), dict) else ''
                            if not title:
                                title = item.get('title', 'N/A')
                            if not link:
                                link = item.get('link', '')
                        if title:
                            if link:
                                st.markdown(f"• [{title}]({link})")
                            else:
                                st.markdown(f"• {title}")

    with tab4:
        if bull:
            st.markdown(bull)
        else:
            st.info("강세 분석 결과가 없습니다.")

    with tab5:
        if bear:
            st.markdown(bear)
        else:
            st.info("약세 분석 결과가 없습니다.")

elif submitted and not ticker_input:
    st.warning("티커를 입력해주세요.")
