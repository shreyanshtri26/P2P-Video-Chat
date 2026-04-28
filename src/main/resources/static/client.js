/* ============================================================
   VOCEO — client.js
   WebRTC signalling + Audio Analyser + Device Enum + Fullscreen
============================================================ */

const LOCAL_IP_ADDRESS = "192.168.1.6"; // change to your local IP

// ── DOM helpers ───────────────────────────────────────────
const $ = id => document.getElementById(id);

const btnConnect      = $("btnConnect");
const btnToggleVideo  = $("toggleVideo");
const btnToggleAudio  = $("toggleAudio");
const btnFullscreen   = $("btnFullscreen");
const btnFlip         = $("btnFlip");
const divRoomConfig   = $("roomConfig");
const roomDiv         = $("roomDiv");
const roomNameInput   = $("roomName");
const localVideo      = $("localVideo");
const remoteVideo     = $("remoteVideo");
const peerPlaceholder = $("peerPlaceholder");
const audioBars       = $("audioBars");
const localAudioRing  = $("localAudioRing");
const callTopbar      = $("callTopbar");
const callControls    = $("callControls");
const callTimer       = $("callTimer");
const callRoomLabel   = $("callRoomLabel");
const ctrlRoomName    = $("ctrlRoomName");
const roomLabel       = $("roomLabel");
const connBadge       = $("connectionBadge");
const connStatus      = $("connStatus");
const previewVideo    = $("previewVideo");
const previewMicIcon  = $("previewMicIcon");
const previewCamIcon  = $("previewCamIcon");
const previewToggleMic = $("previewToggleMic");
const previewToggleCam = $("previewToggleCam");
const previewAudioRing = $("previewAudioRing");
const audioSelect     = $("audioSelect");
const videoSelect     = $("videoSelect");

// ── State ─────────────────────────────────────────────────
let remoteDescriptionPromise, roomName, localStream, remoteStream;
let rtcPeerConnection, isCaller;
let audioContext, analyser, audioData, animFrameId;
let callStartTime, timerInterval;
let controlsHideTimer;
let localMirrored = true;
let previewStream;
let previewAudioCtx, previewAnalyser, previewAnimFrame;
let micEnabled = true, camEnabled = true;

// ── ICE Config ───────────────────────────────────────────
const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: `stun:${LOCAL_IP_ADDRESS}:3478` },
    {
      urls: `turn:${LOCAL_IP_ADDRESS}:3478`,
      username: "username",
      credential: "password"
    }
  ]
};

// ── Stream Constraints ───────────────────────────────────
const buildConstraints = (audioDeviceId, videoDeviceId) => ({
  audio: {
    deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000
  },
  video: {
    deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
    width:     { ideal: 1280, min: 640 },
    height:    { ideal: 720,  min: 360 },
    frameRate: { ideal: 30,   min: 15 },
    facingMode: "user"
  }
});

// ── Socket ───────────────────────────────────────────────
const socket = io.connect(`http://${LOCAL_IP_ADDRESS}:8000`);
const handleSocketEvent = (name, cb) => socket.on(name, cb);

// ═══════════════════════════════════════════════════════════
//  DEVICE ENUMERATION
// ═══════════════════════════════════════════════════════════
async function enumerateDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audios  = devices.filter(d => d.kind === "audioinput");
    const videos  = devices.filter(d => d.kind === "videoinput");

    audioSelect.innerHTML = audios.map((d, i) =>
      `<option value="${d.deviceId}">${d.label || `Microphone ${i + 1}`}</option>`
    ).join("") || `<option value="">Default Microphone</option>`;

    videoSelect.innerHTML = videos.map((d, i) =>
      `<option value="${d.deviceId}">${d.label || `Camera ${i + 1}`}</option>`
    ).join("") || `<option value="">Default Camera</option>`;
  } catch (err) {
    console.warn("Could not enumerate devices:", err);
  }
}

// ═══════════════════════════════════════════════════════════
//  LOBBY PREVIEW
// ═══════════════════════════════════════════════════════════
async function startPreview() {
  try {
    previewStream = await navigator.mediaDevices.getUserMedia(buildConstraints(
      audioSelect.value,
      videoSelect.value
    ));
    previewVideo.srcObject = previewStream;
    startPreviewAudioAnalyser(previewStream);
    await enumerateDevices(); // labels now available after permission granted
  } catch (err) {
    console.warn("Preview failed:", err);
  }
}

function stopPreview() {
  if (previewStream) {
    previewStream.getTracks().forEach(t => t.stop());
    previewStream = null;
  }
  cancelAnimationFrame(previewAnimFrame);
}

// Re-acquire preview when device selection changes
audioSelect.addEventListener("change", () => { stopPreview(); startPreview(); });
videoSelect.addEventListener("change", () => { stopPreview(); startPreview(); });

// Pre-join mic/cam toggles
previewToggleMic.addEventListener("click", () => {
  micEnabled = !micEnabled;
  if (previewStream) {
    previewStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
  }
  previewToggleMic.classList.toggle("muted", !micEnabled);
  previewMicIcon.className = micEnabled ? "bi bi-mic-fill" : "bi bi-mic-mute-fill";
});

previewToggleCam.addEventListener("click", () => {
  camEnabled = !camEnabled;
  if (previewStream) {
    previewStream.getVideoTracks().forEach(t => t.enabled = camEnabled);
  }
  previewToggleCam.classList.toggle("muted", !camEnabled);
  previewCamIcon.className = camEnabled ? "bi bi-camera-video-fill" : "bi bi-camera-video-off-fill";
});

// ═══════════════════════════════════════════════════════════
//  AUDIO ANALYSER
// ═══════════════════════════════════════════════════════════
function startPreviewAudioAnalyser(stream) {
  cancelAnimationFrame(previewAnimFrame);
  if (previewAudioCtx) previewAudioCtx.close();
  previewAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = previewAudioCtx.createMediaStreamSource(stream);
  previewAnalyser = previewAudioCtx.createAnalyser();
  previewAnalyser.fftSize = 256;
  src.connect(previewAnalyser);
  const data = new Uint8Array(previewAnalyser.frequencyBinCount);

  const loop = () => {
    previewAnimFrame = requestAnimationFrame(loop);
    previewAnalyser.getByteFrequencyData(data);
    const vol = data.reduce((a, b) => a + b, 0) / data.length;
    previewAudioRing.classList.toggle("speaking", vol > 10);
  };
  loop();
}

function startCallAudioAnalyser(stream) {
  if (audioContext) audioContext.close();
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);
  audioData = new Uint8Array(analyser.frequencyBinCount);

  const ab1 = audioBars.querySelector(".ab1");
  const ab2 = audioBars.querySelector(".ab2");
  const ab3 = audioBars.querySelector(".ab3");

  const loop = () => {
    animFrameId = requestAnimationFrame(loop);
    analyser.getByteFrequencyData(audioData);
    const vol = audioData.reduce((a, b) => a + b, 0) / audioData.length;
    const isSpeaking = vol > 10;

    // Update mic button audio bars
    audioBars.classList.toggle("visible", isSpeaking && micEnabled);
    if (isSpeaking) {
      ab1.style.height = Math.max(3, (audioData[10] / 255) * 14) + "px";
      ab2.style.height = Math.max(3, (audioData[20] / 255) * 14) + "px";
      ab3.style.height = Math.max(3, (audioData[30] / 255) * 14) + "px";
    }

    // Speaking ring on PIP
    localAudioRing.classList.toggle("speaking", isSpeaking && micEnabled);
  };
  loop();
}

// ═══════════════════════════════════════════════════════════
//  AUTO-HIDE CONTROLS
// ═══════════════════════════════════════════════════════════
function showControls() {
  callTopbar.classList.remove("hidden");
  callControls.classList.remove("hidden");
  clearTimeout(controlsHideTimer);
  controlsHideTimer = setTimeout(hideControls, 3500);
}

function hideControls() {
  callTopbar.classList.add("hidden");
  callControls.classList.add("hidden");
}

document.addEventListener("mousemove", () => {
  if (!roomDiv.classList.contains("d-none")) showControls();
});

// ═══════════════════════════════════════════════════════════
//  CALL TIMER
// ═══════════════════════════════════════════════════════════
function startTimer() {
  callStartTime = Date.now();
  timerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - callStartTime) / 1000);
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    callTimer.textContent = `${mm}:${ss}`;
  }, 1000);
}

// ═══════════════════════════════════════════════════════════
//  FULLSCREEN
// ═══════════════════════════════════════════════════════════
btnFullscreen.addEventListener("click", toggleFullscreen);

function toggleFullscreen() {
  const fsIcon = $("fullscreenIcon");
  if (!document.fullscreenElement) {
    roomDiv.requestFullscreen().catch(err => console.warn("FS:", err));
    fsIcon.className = "bi bi-fullscreen-exit";
  } else {
    document.exitFullscreen();
    fsIcon.className = "bi bi-fullscreen";
  }
}

document.addEventListener("fullscreenchange", () => {
  const fsIcon = $("fullscreenIcon");
  if (!document.fullscreenElement) {
    fsIcon.className = "bi bi-fullscreen";
  }
});

// ═══════════════════════════════════════════════════════════
//  FLIP LOCAL VIDEO
// ═══════════════════════════════════════════════════════════
btnFlip.addEventListener("click", () => {
  localMirrored = !localMirrored;
  localVideo.style.transform = localMirrored ? "scaleX(-1)" : "scaleX(1)";
});

// ═══════════════════════════════════════════════════════════
//  MIC / CAM TOGGLE (In-call)
// ═══════════════════════════════════════════════════════════
function toggleTrack(type) {
  if (!localStream) return;

  const track = type === "video"
    ? localStream.getVideoTracks()[0]
    : localStream.getAudioTracks()[0];
  if (!track) return;

  const enabled = !track.enabled;
  track.enabled = enabled;

  if (type === "audio") {
    micEnabled = enabled;
    btnToggleAudio.className = `ctrl-btn ${enabled ? "ctrl-active" : "ctrl-muted"}`;
    $("audioIcon").className = enabled ? "bi bi-mic-fill" : "bi bi-mic-mute-fill";
    showToast(enabled ? "Microphone on" : "Microphone muted",
              enabled ? "bi-mic-fill" : "bi-mic-mute-fill");
  } else {
    camEnabled = enabled;
    btnToggleVideo.className = `ctrl-btn ${enabled ? "ctrl-active" : "ctrl-muted"}`;
    $("videoIcon").className = enabled ? "bi bi-camera-video-fill" : "bi bi-camera-video-off-fill";
    showToast(enabled ? "Camera on" : "Camera off",
              enabled ? "bi-camera-video-fill" : "bi-camera-video-off-fill");
  }
}

btnToggleAudio.addEventListener("click", () => toggleTrack("audio"));
btnToggleVideo.addEventListener("click", () => toggleTrack("video"));

// ═══════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════
let toastTimer;
function showToast(msg, icon = "bi-info-circle") {
  const t = $("toast");
  $("toastMsg").textContent = msg;
  $("toastIcon").className = `bi ${icon} me-2`;
  t.classList.remove("d-none");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("d-none"), 2500);
}

// ═══════════════════════════════════════════════════════════
//  JOIN
// ═══════════════════════════════════════════════════════════
btnConnect.onclick = async () => {
  const val = roomNameInput.value.trim();
  if (!val) { showToast("Please enter a room name", "bi-exclamation-circle"); return; }

  roomName = val;
  callRoomLabel.textContent = roomName;
  ctrlRoomName.textContent = roomName;
  roomLabel.textContent = roomName;

  stopPreview(); // stop preview before joining

  socket.emit("joinRoom", roomName);
  divRoomConfig.classList.add("d-none");
  roomDiv.classList.remove("d-none");
  showControls();
};

// ═══════════════════════════════════════════════════════════
//  SIGNALLING EVENTS
// ═══════════════════════════════════════════════════════════
async function acquireStream() {
  const constraints = buildConstraints(audioSelect.value, videoSelect.value);
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  localVideo.srcObject = localStream;

  // Apply pre-join toggle state
  localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
  localStream.getVideoTracks().forEach(t => t.enabled = camEnabled);
  if (!micEnabled) btnToggleAudio.className = "ctrl-btn ctrl-muted";
  if (!camEnabled) btnToggleVideo.className = "ctrl-btn ctrl-muted";

  startCallAudioAnalyser(localStream);
}

handleSocketEvent("created", async () => {
  try {
    await acquireStream();
    isCaller = true;
  } catch (e) { showToast("Camera/Mic access denied"); console.error(e); }
});

handleSocketEvent("joined", async () => {
  try {
    await acquireStream();
    socket.emit("ready", roomName);
  } catch (e) { showToast("Camera/Mic access denied"); console.error(e); }
});

handleSocketEvent("candidate", e => {
  if (!rtcPeerConnection) return;
  const candidate = new RTCIceCandidate({ sdpMLineIndex: e.label, candidate: e.candidate });
  if (remoteDescriptionPromise) {
    remoteDescriptionPromise
      .then(() => candidate && rtcPeerConnection.addIceCandidate(candidate))
      .catch(err => console.warn("ICE candidate error:", err));
  }
});

handleSocketEvent("ready", () => {
  if (!isCaller) return;
  rtcPeerConnection = newPeerConnection();
  localStream.getTracks().forEach(t => rtcPeerConnection.addTrack(t, localStream));
  rtcPeerConnection.createOffer()
    .then(sd => {
      rtcPeerConnection.setLocalDescription(sd);
      socket.emit("offer", { type: "offer", sdp: sd, room: roomName });
    })
    .catch(console.error);
});

handleSocketEvent("offer", e => {
  if (isCaller) return;
  rtcPeerConnection = newPeerConnection();
  localStream.getTracks().forEach(t => rtcPeerConnection.addTrack(t, localStream));
  if (rtcPeerConnection.signalingState === "stable") {
    remoteDescriptionPromise = rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(e));
    remoteDescriptionPromise
      .then(() => rtcPeerConnection.createAnswer())
      .then(sd => {
        rtcPeerConnection.setLocalDescription(sd);
        socket.emit("answer", { type: "answer", sdp: sd, room: roomName });
      })
      .catch(console.error);
  }
});

handleSocketEvent("answer", e => {
  if (isCaller && rtcPeerConnection.signalingState === "have-local-offer") {
    remoteDescriptionPromise = rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(e));
    remoteDescriptionPromise.catch(console.error);
  }
});

handleSocketEvent("userDisconnected", () => {
  remoteVideo.srcObject = null;
  isCaller = true;
  peerPlaceholder.classList.remove("d-none");
  connBadge.className = "conn-badge conn-waiting";
  connStatus.textContent = "Waiting";
  clearInterval(timerInterval);
  callTimer.textContent = "00:00";
  showToast("Peer disconnected", "bi-person-x-fill");
});

handleSocketEvent("setCaller", id => { isCaller = socket.id === id; });

handleSocketEvent("full", () => {
  showToast("Room is full!", "bi-exclamation-triangle-fill");
  setTimeout(() => window.location.reload(), 2000);
});

// ── Peer Connection factory ──────────────────────────────
function newPeerConnection() {
  const pc = new RTCPeerConnection(iceServers);
  pc.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("candidate", {
        type: "candidate",
        label: e.candidate.sdpMLineIndex,
        id: e.candidate.sdpMid,
        candidate: e.candidate.candidate,
        room: roomName
      });
    }
  };
  pc.ontrack = onAddStream;
  return pc;
}

function onAddStream(e) {
  remoteVideo.srcObject = e.streams[0];
  peerPlaceholder.classList.add("d-none");
  connBadge.className = "conn-badge conn-connected";
  connStatus.textContent = "Connected";
  startTimer();
  showControls();
  showToast("Peer joined the room", "bi-person-check-fill");
}

// ═══════════════════════════════════════════════════════════
//  DRAGGABLE PIP
// ═══════════════════════════════════════════════════════════
(function makeDraggable() {
  const pip = $("localPip");
  let ox, oy, sx, sy, dragging = false;

  pip.addEventListener("mousedown", e => {
    dragging = true;
    const r = pip.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    sx = r.left;
    sy = r.top;
    pip.style.cursor = "grabbing";
    e.preventDefault();
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const x = e.clientX - ox;
    const y = e.clientY - oy;
    // Constrain within viewport
    const maxX = window.innerWidth  - pip.offsetWidth;
    const maxY = window.innerHeight - pip.offsetHeight;
    pip.style.right  = "auto";
    pip.style.bottom = "auto";
    pip.style.left   = Math.max(0, Math.min(x, maxX)) + "px";
    pip.style.top    = Math.max(0, Math.min(y, maxY)) + "px";
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
    pip.style.cursor = "grab";
  });
})();

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
window.addEventListener("DOMContentLoaded", () => {
  startPreview();
  // Enter key on room input
  roomNameInput.addEventListener("keydown", e => {
    if (e.key === "Enter") btnConnect.click();
  });
});
