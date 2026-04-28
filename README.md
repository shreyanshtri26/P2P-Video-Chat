# Voceo — Secure Peer-to-Peer Video Chat

**Voceo** is a modern, Google Meet-inspired WebRTC video conferencing application built with a Spring Boot backend and Socket.IO for robust real-time signaling.

## ✨ Features

- **Google Meet-inspired Layout**: Full-viewport remote video, PIP local stream, auto-hiding controls.
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

---

## 🚀 Deployment Guide (Railway)

As **Voceo** utilizes a dedicated WebSocket server (`netty-socketio`) parallel to standard Spring APIs, utilizing **Railway's Native Docker Compose capability** is the simplest distribution pipeline.

### Deployment Instructions:
1. Connect this GitHub repository directly to your [Railway Account](https://railway.app).
2. Set up a new project mapped from the `main` branch.
3. Railway will autonomously read the `docker-compose.yml`, deploying the application containers smoothly.
