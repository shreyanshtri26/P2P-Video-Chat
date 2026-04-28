# Voceo — Secure Peer-to-Peer Video Chat

**Voceo** is a modern, Google Meet-inspired WebRTC video conferencing application built with a Spring Boot backend and Socket.IO for robust real-time signaling.

## ✨ Features

- **Google Meet-inspired Layout**: Full-viewport remote video, PIP local stream, auto-hiding controls.
- **Integrated Video Chat**: Full real-time conversational messaging client injected securely into active rooms.
- **Smart Focus Grid ("Switch Me")**: Expand local streams or remote components natively via point-and-click.
- **Enhanced Stream Quality**: High-definition constraints (720p @ 30FPS) paired with echo cancellation & noise suppression.
- **Audio Visualizers**: Real-time speaking detection with UI feedback (mic buttons + video rings).
- **Control Suite**: Toggle camera/microphone, switch peripherals, and go fullscreen seamlessly.

---

## 🛠️ Local Development & Testing

### Prerequisites
- Java 21 & Maven 3.9+
- A modern browser allowing WebRTC features

### Steps
1. **Configure your Local IP**: 
   Open `src/main/resources/static/client.js` and alter `LOCAL_IP_ADDRESS` to match your development machine's local IPv4.
   
2. **Launch Application**:
   Execute the Spring Boot runner:
   ```bash
   mvn spring-boot:run
   ```

3. **Establish a P2P Connection**:
   - Open [http://localhost:8080](http://localhost:8080).
   - Enter a secure room identifier.
   - Repeat from a secondary window/tab using identical parameters.

### ⚠️ Testing with Mobile/Other Laptops (Local Network)
Due to WebRTC security policies, **camera and microphone access are blocked on non-secure origins** (`http://`). The only local exemptions are `localhost` and `127.0.0.1`. 

If connecting via your local IP (`http://<YOUR_LOCAL_IP>:8080`):
- **Option A**: Toggle secure origins manually on mobile:
  1. Open Chrome on your smartphone.
  2. Visit `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
  3. Add `http://<YOUR_LOCAL_IP>:8080` to the whitelist, switch to Enabled, and reboot.
- **Option B**: Run an automated secure proxy via **ngrok**:
  ```bash
  ngrok http 8080
  ```
- **Option C**: Visit deployed infrastructure directly (e.g. Render deployments) that execute under SSL defaults natively.

---
 



