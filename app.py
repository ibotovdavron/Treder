from flask import Flask, request, jsonify
import datetime

app = Flask(__name__)

@app.route('/')
def home():
    return "TradingView Webhook Bot ishga tushdi ✅"

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.get_json()
    print("Signal keldi:", data)

    signal = data.get("signal")
    symbol = data.get("symbol", "XAUUSD")
    lot = data.get("lot", 0.5)

    if signal == "BUY":
        print(f"🟢 BUY signal: {symbol} uchun {lot} lot ochiladi.")
    elif signal == "SELL":
        print(f"🔴 SELL signal: {symbol} uchun {lot} lot ochiladi.")
    else:
        print("⚠️ Noma’lum signal:", signal)

    return jsonify(status="ok", time=str(datetime.datetime.now()))
