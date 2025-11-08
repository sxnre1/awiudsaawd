from flask import Flask, render_template, request, jsonify
import requests, os, time
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

TOKEN = os.getenv("DISCORD_BOT_TOKEN")
GUILD_ID = os.getenv("DISCORD_GUILD_ID")
FIXED_CHANNEL_ID = os.getenv("FIXED_CHANNEL_ID")
ADMIN_SECRET = os.getenv("ADMIN_SECRET")

if not TOKEN or not GUILD_ID or not ADMIN_SECRET or not FIXED_CHANNEL_ID:
    raise SystemExit("환경변수 DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, FIXED_CHANNEL_ID, ADMIN_SECRET을 설정하세요.")

DISCORD_API_BASE = "https://discord.com/api/v10"

def discord_request(method, endpoint, **kwargs):
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bot {TOKEN}"
    url = f"{DISCORD_API_BASE}{endpoint}"
    return requests.request(method, url, headers=headers, timeout=10, **kwargs)

def send_message(channel_id: str, content: str, files=None, retries=3):
    url = f"/channels/{channel_id}/messages"
    multipart = None
    data = {"content": content}
    if files:
        multipart = [('file', (f.filename, f.read())) for f in files]
    backoff = 1
    for attempt in range(retries):
        if multipart:
            resp = discord_request("POST", url, data=data, files=multipart)
        else:
            resp = discord_request("POST", url, json=data)
        if resp.status_code in (200,201):
            return True, resp.json()
        if resp.status_code==429:
            retry_after = resp.json().get("retry_after", backoff)
            time.sleep(retry_after+0.1)
            backoff*=2
            continue
        return False, {"status": resp.status_code, "body": resp.text}
    return False, {"status":429, "body":"rate limited after retries"}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/send', methods=['POST'])
def send():
    message = request.form.get('message','').strip()
    files = request.files.getlist('file')
    if not message and not files:
        return jsonify({"success": False, "error": "메시지 또는 이미지 필요"}), 400
    ok, result = send_message(FIXED_CHANNEL_ID, message, files)
    if ok:
        return jsonify({"success": True, "message": "메시지 전송 완료"}), 200
    else:
        return jsonify({"success": False, "error": result}), 500

@app.route('/autocomplete', methods=['GET'])
def autocomplete():
    query = request.args.get('q','').lower()
    type_ = request.args.get('type')
    results = []
    try:
        if type_=="user":
            resp = discord_request("GET", f"/guilds/{GUILD_ID}/members?limit=1000")
            if resp.status_code==200:
                for m in resp.json():
                    username = m['user']['username']
                    discrim = m['user']['discriminator']
                    if query in username.lower() or query in discrim:
                        results.append({"name": f"{username}#{discrim}", "id": m['user']['id']})
        elif type_=="channel":
            resp = discord_request("GET", f"/guilds/{GUILD_ID}/channels")
            if resp.status_code==200:
                for c in resp.json():
                    if c['type'] in [0,5,10]:
                        if query in c['name'].lower():
                            results.append({"name": c['name'], "id": c['id']})
        return jsonify({"success": True, "results": results})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)