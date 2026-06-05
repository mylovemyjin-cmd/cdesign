import json
import os
import re
import anthropic
from core.indicators import get_indicator_summary

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client


MODEL = "claude-sonnet-4-6"


def _call(system: str, user: str, max_tokens: int = 1200) -> str:
    resp = _get_client().messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return resp.content[0].text


def _parse_json(text: str) -> dict:
    match = re.search(r'\{[\s\S]*\}', text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {}


def run_technical_analyst(indicators: dict) -> dict:
    system = """당신은 주식 기술적 분석 전문가입니다. 제공된 지표를 분석하고 반드시 아래 JSON 형식으로만 응답하세요.
{
  "trend": "상승|하락|횡보",
  "trend_strength": 1~10 정수,
  "rsi_signal": "과매수|과매도|중립",
  "macd_signal": "골든크로스|데드크로스|강세유지|약세유지|중립",
  "bb_signal": "상단돌파|하단이탈|상단근접|하단근접|중립",
  "ema_signal": "정배열|역배열|혼재",
  "volume_signal": "급증|증가|보통|감소",
  "support": 숫자,
  "resistance": 숫자,
  "technical_score": 1~10 정수,
  "summary": "2문장 한국어 요약"
}"""
    user = f"현재 기술 지표:\n{json.dumps(indicators, ensure_ascii=False, indent=2)}"
    result = _call(system, user)
    return _parse_json(result)


def run_news_analyst(news: list, ticker: str, company_name: str) -> dict:
    if not news:
        return {
            "sentiment_score": 0,
            "sentiment_label": "중립",
            "key_themes": ["뉴스 데이터 없음"],
            "catalyst": "해당 없음",
            "risk_factors": [],
            "summary": "최근 뉴스 데이터를 가져올 수 없어 중립으로 처리합니다.",
        }

    headlines = []
    for item in news[:10]:
        title = ""
        if isinstance(item, dict):
            content = item.get('content', {})
            if isinstance(content, dict):
                title = content.get('title', '')
            if not title:
                title = item.get('title', '')
        if title:
            headlines.append(f"• {title}")

    if not headlines:
        headlines = ["뉴스 헤드라인을 파싱할 수 없습니다."]

    system = """당신은 금융 뉴스 감성 분석 전문가입니다. 헤드라인을 분석하고 반드시 아래 JSON 형식으로만 응답하세요.
{
  "sentiment_score": -5 ~ +5 (매우부정=-5, 중립=0, 매우긍정=+5),
  "sentiment_label": "매우긍정|긍정|중립|부정|매우부정",
  "key_themes": ["테마1", "테마2", "테마3"],
  "catalyst": "주요 촉매 또는 이벤트 1문장",
  "risk_factors": ["리스크1", "리스크2"],
  "summary": "2문장 한국어 요약"
}"""
    user = f"종목: {ticker} ({company_name})\n\n최근 뉴스 헤드라인:\n" + "\n".join(headlines)
    result = _call(system, user)
    return _parse_json(result)


def run_bull_researcher(tech: dict, sentiment: dict, price_ctx: dict) -> str:
    system = """당신은 강세(Bull) 주식 분석가입니다. 주어진 데이터를 기반으로 가장 강력한 매수 논거 3~5개를 제시하세요.
각 논거는 구체적인 수치와 근거를 포함해야 합니다.
형식: 각 논거를 "• " 로 시작하는 불릿 포인트로 작성. 한국어로."""
    user = f"""기술적 분석: {json.dumps(tech, ensure_ascii=False)}
뉴스 감성: {json.dumps(sentiment, ensure_ascii=False)}
가격 정보: {json.dumps(price_ctx, ensure_ascii=False)}

이 종목을 매수해야 하는 가장 강력한 논거를 제시하세요."""
    return _call(system, user, max_tokens=600)


def run_bear_researcher(tech: dict, sentiment: dict, price_ctx: dict) -> str:
    system = """당신은 약세(Bear) 주식 분석가입니다. 주어진 데이터를 기반으로 가장 강력한 매도/회피 논거 3~5개를 제시하세요.
각 논거는 구체적인 수치와 근거를 포함해야 합니다.
형식: 각 논거를 "• " 로 시작하는 불릿 포인트로 작성. 한국어로."""
    user = f"""기술적 분석: {json.dumps(tech, ensure_ascii=False)}
뉴스 감성: {json.dumps(sentiment, ensure_ascii=False)}
가격 정보: {json.dumps(price_ctx, ensure_ascii=False)}

이 종목을 피해야 하거나 매도해야 하는 가장 강력한 논거를 제시하세요."""
    return _call(system, user, max_tokens=600)


def run_risk_manager(tech: dict, sentiment: dict, bull_case: str, bear_case: str, price_ctx: dict) -> dict:
    system = """당신은 경험 많은 리스크 매니저 겸 포트폴리오 트레이더입니다.
강세/약세 애널리스트의 의견을 모두 검토하고 최종 투자 판단을 내리세요.
반드시 아래 JSON 형식으로만 응답하세요.
{
  "position": "BUY|SELL|HOLD",
  "confidence": 1~10 정수,
  "entry_strategy": "즉시매수|분할매수|조정시매수|해당없음",
  "entry_price": 숫자,
  "target_price": 숫자,
  "stop_loss": 숫자,
  "expected_return_pct": 숫자,
  "risk_reward_ratio": 숫자,
  "time_horizon": "단기(1-4주)|중기(1-3개월)|장기(3개월+)",
  "rationale": "최종 판단 근거 3-4문장 한국어",
  "key_risks": ["리스크1", "리스크2", "리스크3"],
  "position_size": "소규모(3%이하)|중간(3-7%)|적극(7%+)|없음"
}"""
    user = f"""현재가 정보: {json.dumps(price_ctx, ensure_ascii=False)}
기술적 분석: {json.dumps(tech, ensure_ascii=False)}
뉴스 감성: {json.dumps(sentiment, ensure_ascii=False)}

[강세 논거]
{bull_case}

[약세 논거]
{bear_case}

위 모든 정보를 종합하여 최종 투자 판단을 내리세요."""
    result = _call(system, user, max_tokens=1200)
    return _parse_json(result)


def run_analysis(df, info: dict, news: list, ticker: str, progress_callback=None) -> dict:
    indicators = get_indicator_summary(df)
    company_name = info.get('longName') or info.get('shortName') or ticker

    price_ctx = {
        'ticker': ticker,
        'company': company_name,
        'current_price': indicators['price'],
        'high_52w': indicators['high_52w'],
        'low_52w': indicators['low_52w'],
        'pct_from_high': indicators['price_vs_high_pct'],
        'pct_from_low': indicators['price_vs_low_pct'],
        'volume_vs_20d_avg': indicators['vol_ratio'],
    }

    def cb(msg, pct):
        if progress_callback:
            progress_callback(msg, pct)

    cb("📊 기술적 분석가 분석 중...", 0.15)
    tech = run_technical_analyst(indicators)

    cb("📰 뉴스/감성 분석가 분석 중...", 0.35)
    sentiment = run_news_analyst(news, ticker, company_name)

    cb("🟢 강세 연구원 의견 수집 중...", 0.55)
    bull = run_bull_researcher(tech, sentiment, price_ctx)

    cb("🔴 약세 연구원 의견 수집 중...", 0.70)
    bear = run_bear_researcher(tech, sentiment, price_ctx)

    cb("⚖️ 리스크 매니저 최종 판단 중...", 0.85)
    final = run_risk_manager(tech, sentiment, bull, bear, price_ctx)

    cb("✅ 분석 완료!", 1.0)

    return {
        'indicators': indicators,
        'tech': tech,
        'sentiment': sentiment,
        'bull': bull,
        'bear': bear,
        'final': final,
        'company': company_name,
        'ticker': ticker,
    }
