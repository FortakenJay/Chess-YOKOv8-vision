# Chess Phone Cam (Downgraded)

Temporary Expo app matching `mobile/` streamer functionality on an older SDK.

- SDK: `expo ~54`
- Purpose: run with older Expo Go when SDK 55 is not yet available on your device.

## Run

From `mobile_downgrade/`:

```bash
npm install
npx expo start
```

Then scan the QR in Expo Go.

## Stream flow

1. Start bridge from repo root:

```powershell
.\.venv\Scripts\python code/phone_stream_bridge.py --host 0.0.0.0 --port 8080
```

1. In the app:

- Host = your PC LAN IP
- Port = `8080`
- Tap **Start Streaming**

1. Verify desktop stream:

```powershell
.\.venv\Scripts\python code/view_esp32_stream.py --url http://127.0.0.1:8080/stream
```
