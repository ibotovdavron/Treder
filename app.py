from flask import Flask, request
import requests

app = Flask(__name__)

# --------------- CONFIG ------------------
TELEGRAM_TOKEN = "8336758147:AAE5AgN4P4ZUzQihBYxMfE0wwM5ibf7ecJk"             # BotFather-dan oling
TELEGRAM_CHAT_ID = "@gold_treyder_045"   # Kanal username
# -----------------------------------------

def send_telegram_message(message):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    data = {"chat_id": TELEGRAM_CHAT_ID, "text": message}
    try:
        response = requests.post(url, data=data)
        if response.status_code != 200:
            print("Telegram xato:", response.text)
    except Exception as e:
        print("Xato:", e)

@app.route("/webhook", methods=["POST"])
def webhook():
    data = request.json
    if not data:
        return "No data received", 400

    symbol = data.get("symbol")
    signal = data.get("signal")

    # Faqat XAUUSD signallari
    if symbol == "XAUUSD" and signal:
        message = f"⚡ OLTIN SIGNAL ⚡\nSignal: {signal}\nSymbol: {symbol}"
        send_telegram_message(message)
        print("Signal yuborildi:", message)
    else:
        print("XAUUSD emas yoki signal yo'q:", data)

    return "OK", 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
