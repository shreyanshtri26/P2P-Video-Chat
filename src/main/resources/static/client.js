/* ============================================================
   VOCEO — client.js   (Full-Mesh P2P, up to 4 participants)
============================================================ */

const LOCAL_IP_ADDRESS = "192.168.1.6"; // used only in local dev

// ── DOM helpers ───────────────────────────────────────────
const $ = id => document.getElementById(id);

const btnConnect       = $("btnConnect");
const btnToggleVideo   = $("toggleVideo");
const btnToggleAudio   = $("toggleAudio");
const btnFullscreen    = $("btnFullscreen");
const btnFlip          = $("btnFlip");
const divRoomConfig    = $("roomConfig");
const roomDiv          = $("roomDiv");
const roomNameInput    = $("roomName");
const localVideo       = $("localVideo");
const videoGrid        = $("videoGrid");
const peerPlaceholder  = $("peerPlaceholder");
const audioBars        = $("audioBars");
const localAudioRing   = $("localAudioRing");
const callTopbar       = $("callTopbar");
const callControls     = $("callControls");
const callTimer        = $("callTimer");
const callRoomLabel    = $("callRoomLabel");
const ctrlRoomName     = $("ctrlRoomName");
const roomLabel        = $("roomLabel");
const connBadge        = $("connectionBadge");
const connStatus       = $("connStatus");
const previewVideo     = $("previewVideo");
const previewMicIcon   = $("previewMicIcon");
const previewCamIcon   = $("previewCamIcon");
const previewToggleMic = $("previewToggleMic");
const previewToggleCam = $("previewToggleCam");
const previewAudioRing = $("previewAudioRing");
const audioSelect      = $("audioSelect");
const videoSelect      = $("videoSelect");

// ── Mesh State ────────────────────────────────────────────
const peers = new Map();   // peerId -> RTCPeerConnection
let myId        = null;
let roomName    = null;
let localStream = null;
let localMirrored = true;
let micEnabled  = true;
let camEnabled  = true;

// ── Pinning & Chat State ──────────────────────────────────
let pinnedElement = null;
let chatOpen = false;
let unreadCount = 0;

// ── Non-call state ────────────────────────────────────────
let audioContext, analyser, audioData, animFrameId;
let callStartTime, timerInterval;
let controlsHideTimer;
let previewStream, previewAudioCtx, previewAnalyser, previewAnimFrame;

// ── ICE Servers ───────────────────────────────────────────
const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: `stun:${LOCAL_IP_ADDRESS}:3478` },
    { urls: `turn:${LOCAL_IP_ADDRESS}:3478`, username: "username", credential: "password" }
  ]
};

// ── Stream Constraints ────────────────────────────────────
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

// ── Socket (auto-detects dev vs production) ───────────────
const isDev = window.location.port === "8080";
const socketUrl = isDev
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : `${window.location.protocol}//${window.location.host}`;

const socket = io.connect(socketUrl);
const on = (name, cb) => socket.on(name, cb);

// ═══════════════════════════════════════════════════════════
//  VIDEO GRID HELPERS
// ═══════════════════════════════════════════════════════════

function pinElement(el) {
  const roomDiv = $("roomDiv");
  
  if (pinnedElement === el) {
    unpinAll();
    return;
  }
  
  unpinAll();
  pinnedElement = el;
  roomDiv.classList.add("has-pinned");
  el.classList.add("is-pinned");
  
  const allTiles = document.querySelectorAll(".video-tile");
  const localPip = $("localPip");
  
  let miniPips = [];
  allTiles.forEach(tile => {
    if (tile !== el) {
      tile.classList.add("mini-pip");
      miniPips.push(tile);
    }
  });
  
  if (localPip !== el) {
    localPip.classList.add("mini-pip");
    miniPips.push(localPip);
  }
  
  miniPips.forEach((pip, index) => {
    pip.style.right = `${20 + index * 190}px`;
    pip.style.bottom = "110px";
    pip.style.left = "auto";
    pip.style.top = "auto";
  });
}

function unpinAll() {
  const roomDiv = $("roomDiv");
  roomDiv.classList.remove("has-pinned");
  
  document.querySelectorAll(".is-pinned").forEach(el => el.classList.remove("is-pinned"));
  document.querySelectorAll(".mini-pip").forEach(el => {
    el.classList.remove("mini-pip");
    el.style.right = "";
    el.style.bottom = "";
    el.style.left = "";
    el.style.top = "";
  });
  
  pinnedElement = null;
}

function addVideoTile(peerId, stream) {
  if ($("tile-" + peerId)) return;

  const tile = document.createElement("div");
  tile.className = "video-tile";
  tile.id = "tile-" + peerId;

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.className = "remote-video-tile";
  video.srcObject = stream;

  const label = document.createElement("div");
  label.className = "tile-label";
  label.textContent = `Peer (${peerId.substring(0, 4)})`;

  tile.appendChild(video);
  tile.appendChild(label);
  
  // Wire pinning click
  tile.addEventListener("click", () => pinElement(tile));
  
  videoGrid.appendChild(tile);
  updateGrid();

  // If a video is pinned, update layouts for the newly joined peer
  if (pinnedElement) {
    pinElement(pinnedElement); 
  }

  peerPlaceholder.classList.add("d-none");
  updateConnectionBadge();
}

function removeVideoTile(peerId) {
  const tile = $("tile-" + peerId);
  if (tile) {
    if (pinnedElement === tile) {
      unpinAll();
    }
    tile.remove();
  }
  updateGrid();
  
  if (pinnedElement) {
    // Re-adjust remaining mini-pips
    pinElement(pinnedElement);
  }

  if (videoGrid.children.length === 0) {
    peerPlaceholder.classList.remove("d-none");
    unpinAll();
  }
  updateConnectionBadge();
}

function updateGrid() {
  videoGrid.dataset.peers = videoGrid.children.length;
}

function updateConnectionBadge() {
  const n = videoGrid.children.length;
  if (n === 0) {
    connBadge.className = "conn-badge conn-waiting";
    connStatus.textContent = "Waiting";
  } else {
    connBadge.className = "conn-badge conn-connected";
    connStatus.textContent = n === 1 ? "Connected" : `${n} peers`;
  }
}

// ═══════════════════════════════════════════════════════════
//  PEER CONNECTION FACTORY
// ═══════════════════════════════════════════════════════════

function createPeerConnection(peerId) {
  if (peers.has(peerId)) return peers.get(peerId);

  const pc = new RTCPeerConnection(iceServers);
  peers.set(peerId, pc);

  // Add all local tracks to this connection
  if (localStream) {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  }

  // Send ICE candidates addressed to this specific peer
  pc.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("candidate", {
        type: "candidate",
        label: e.candidate.sdpMLineIndex,
        id: e.candidate.sdpMid,
        candidate: e.candidate.candidate,
        room: roomName,
        targetId: peerId
      });
    }
  };

  // Incoming remote stream → create a video tile
  pc.ontrack = e => {
    addVideoTile(peerId, e.streams[0]);
    if (!timerInterval) startTimer();
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
      closePeer(peerId);
    }
  };

  return pc;
}

function closePeer(peerId) {
  const pc = peers.get(peerId);
  if (pc) {
    pc.close();
    peers.delete(peerId);
  }
  removeVideoTile(peerId);
}

// ═══════════════════════════════════════════════════════════
//  DEVICE ENUMERATION
// ═══════════════════════════════════════════════════════════

async function enumerateDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audios = devices.filter(d => d.kind === "audioinput");
    const videos = devices.filter(d => d.kind === "videoinput");
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
    previewStream = await navigator.mediaDevices.getUserMedia(
      buildConstraints(audioSelect.value, videoSelect.value)
    );
    previewVideo.srcObject = previewStream;
    startPreviewAudioAnalyser(previewStream);
    await enumerateDevices();
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

audioSelect.addEventListener("change", () => { stopPreview(); startPreview(); });
videoSelect.addEventListener("change", () => { stopPreview(); startPreview(); });

previewToggleMic.addEventListener("click", () => {
  micEnabled = !micEnabled;
  previewStream?.getAudioTracks().forEach(t => t.enabled = micEnabled);
  previewToggleMic.classList.toggle("muted", !micEnabled);
  previewMicIcon.className = micEnabled ? "bi bi-mic-fill" : "bi bi-mic-mute-fill";
});

previewToggleCam.addEventListener("click", () => {
  camEnabled = !camEnabled;
  previewStream?.getVideoTracks().forEach(t => t.enabled = camEnabled);
  previewToggleCam.classList.toggle("muted", !camEnabled);
  previewCamIcon.className = camEnabled ? "bi bi-camera-video-fill" : "bi bi-camera-video-off-fill";
});

// ═══════════════════════════════════════════════════════════
//  AUDIO ANALYSERS
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
    const speaking = vol > 10 && micEnabled;
    audioBars.classList.toggle("visible", speaking);
    localAudioRing.classList.toggle("speaking", speaking);
    if (speaking) {
      ab1.style.height = Math.max(3, (audioData[10] / 255) * 14) + "px";
      ab2.style.height = Math.max(3, (audioData[20] / 255) * 14) + "px";
      ab3.style.height = Math.max(3, (audioData[30] / 255) * 14) + "px";
    }
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
  controlsHideTimer = setTimeout(() => {
    callTopbar.classList.add("hidden");
    callControls.classList.add("hidden");
  }, 3500);
}

document.addEventListener("mousemove", () => {
  if (!roomDiv.classList.contains("d-none")) showControls();
});
document.addEventListener("touchstart", () => {
  if (!roomDiv.classList.contains("d-none")) showControls();
}, { passive: true });

// ═══════════════════════════════════════════════════════════
//  CALL TIMER
// ═══════════════════════════════════════════════════════════

function startTimer() {
  if (timerInterval) return;
  callStartTime = Date.now();
  timerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - callStartTime) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    callTimer.textContent = `${mm}:${ss}`;
  }, 1000);
}

// ═══════════════════════════════════════════════════════════
//  FULLSCREEN
// ═══════════════════════════════════════════════════════════

btnFullscreen.addEventListener("click", () => {
  const icon = $("fullscreenIcon");
  if (!document.fullscreenElement) {
    roomDiv.requestFullscreen().catch(console.warn);
    icon.className = "bi bi-fullscreen-exit";
  } else {
    document.exitFullscreen();
    icon.className = "bi bi-fullscreen";
  }
});

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    $("fullscreenIcon").className = "bi bi-fullscreen";
  }
});

// ═══════════════════════════════════════════════════════════
//  FLIP
// ═══════════════════════════════════════════════════════════

btnFlip.addEventListener("click", () => {
  localMirrored = !localMirrored;
  localVideo.style.transform = localMirrored ? "scaleX(-1)" : "scaleX(1)";
});

// ═══════════════════════════════════════════════════════════
//  MIC / CAM TOGGLE
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
    showToast(enabled ? "Microphone on" : "Microphone muted", enabled ? "bi-mic-fill" : "bi-mic-mute-fill");
  } else {
    camEnabled = enabled;
    btnToggleVideo.className = `ctrl-btn ${enabled ? "ctrl-active" : "ctrl-muted"}`;
    $("videoIcon").className = enabled ? "bi bi-camera-video-fill" : "bi bi-camera-video-off-fill";
    showToast(enabled ? "Camera on" : "Camera off", enabled ? "bi-camera-video-fill" : "bi-camera-video-off-fill");
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
//  ACQUIRE STREAM
// ═══════════════════════════════════════════════════════════

async function acquireStream() {
  if (localStream) return; // already acquired
  try {
    localStream = await navigator.mediaDevices.getUserMedia(
      buildConstraints(audioSelect.value, videoSelect.value)
    );
    localVideo.srcObject = localStream;
    localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
    localStream.getVideoTracks().forEach(t => t.enabled = camEnabled);
    if (!micEnabled) btnToggleAudio.className = "ctrl-btn ctrl-muted";
    if (!camEnabled) btnToggleVideo.className = "ctrl-btn ctrl-muted";
    startCallAudioAnalyser(localStream);
  } catch (e) {
    showToast("Camera/Mic access denied", "bi-exclamation-circle");
    console.error(e);
  }
}

// ═══════════════════════════════════════════════════════════
//  JOIN
// ═══════════════════════════════════════════════════════════

btnConnect.onclick = () => {
  const val = roomNameInput.value.trim();
  if (!val) { showToast("Please enter a room name", "bi-exclamation-circle"); return; }
  roomName = val;
  callRoomLabel.textContent = roomName;
  ctrlRoomName.textContent  = roomName;
  roomLabel.textContent     = roomName;
  stopPreview();
  socket.emit("joinRoom", roomName);
  divRoomConfig.classList.add("d-none");
  roomDiv.classList.remove("d-none");
  showControls();
};

// ═══════════════════════════════════════════════════════════
//  SIGNALLING — MESH EVENTS
// ═══════════════════════════════════════════════════════════

// First person in the room
on("created", async (clientId) => {
  myId = clientId;
  await acquireStream();
  showToast("Room created — waiting for peers", "bi-shield-check");
});

// Subsequent joiners receive their own ID + list of who's already here
on("joined", async (data) => {
  myId = data.myId;
  await acquireStream();

  // The new joiner always initiates offers to every existing peer
  for (const peerId of data.peers) {
    const pc = createPeerConnection(peerId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { type: "offer", sdp: offer, room: roomName, targetId: peerId });
    } catch (e) {
      console.error("Error creating offer to", peerId, e);
    }
  }
});

// Existing peer is told a newcomer joined — they wait for that peer's offer
on("peerJoined", (newPeerId) => {
  showToast("A new peer is joining…", "bi-person-plus-fill");
  // The peer connection for newPeerId will be created when we receive their offer
});

// Incoming offer from a peer that just joined
on("offer", async (payload) => {
  const fromId = payload.fromId;
  const pc = createPeerConnection(fromId);
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", { type: "answer", sdp: answer, room: roomName, targetId: fromId });
  } catch (e) {
    console.error("Error handling offer from", fromId, e);
  }
});

// Incoming answer from a peer we offered to
on("answer", async (payload) => {
  const fromId = payload.fromId;
  const pc = peers.get(fromId);
  if (pc && pc.signalingState === "have-local-offer") {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    } catch (e) {
      console.error("Error handling answer from", fromId, e);
    }
  }
});

// ICE candidate from a specific peer
on("candidate", (payload) => {
  const fromId = payload.fromId;
  const pc = peers.get(fromId);
  if (pc) {
    const candidate = new RTCIceCandidate({
      sdpMLineIndex: payload.label,
      candidate: payload.candidate
    });
    pc.addIceCandidate(candidate).catch(e => console.warn("ICE candidate error:", e));
  }
});

// A peer disconnected — close their connection and remove their tile
on("userDisconnected", (peerId) => {
  closePeer(peerId);
  showToast("A peer left the room", "bi-person-dash-fill");
  if (peers.size === 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    callTimer.textContent = "00:00";
  }
});

// Room is full
on("full", () => {
  showToast("Room is full (max 4 people)", "bi-exclamation-triangle-fill");
  setTimeout(() => window.location.reload(), 2500);
});

// ═══════════════════════════════════════════════════════════
//  DRAGGABLE PIP
// ═══════════════════════════════════════════════════════════

(function makeDraggable() {
  const pip = $("localPip");
  let dragging = false, ox, oy;
  let startX = 0, startY = 0;

  pip.addEventListener("mousedown", e => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const r = pip.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    pip.style.cursor = "grabbing";
    e.preventDefault();
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth  - pip.offsetWidth));
    const y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - pip.offsetHeight));
    pip.style.right  = "auto";
    pip.style.bottom = "auto";
    pip.style.left = x + "px";
    pip.style.top  = y + "px";
  });

  document.addEventListener("mouseup", e => {
    if (dragging) {
      dragging = false;
      pip.style.cursor = "grab";
      
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist < 5) {
        pinElement(pip);
      }
    }
  });
})();

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════

window.addEventListener("DOMContentLoaded", () => {
  startPreview();
  roomNameInput.addEventListener("keydown", e => {
    if (e.key === "Enter") btnConnect.click();
  });
  fetchServerInfo();
});

// ═══════════════════════════════════════════════════════════
//  SERVER INFO
// ═══════════════════════════════════════════════════════════

async function fetchServerInfo() {
  const badge    = document.getElementById("serverBadge");
  const badgeText= document.getElementById("serverBadgeText");
  const chip     = document.getElementById("serverChip");
  const chipText = document.getElementById("serverChipText");

  try {
    const res  = await fetch("/api/server-info");
    const data = await res.json();

    const region  = data.region  || "unknown";
    const service = data.service || window.location.host;
    const port    = data.signalingPort;

    let label = region !== "local"
      ? `${service} · ${region}`
      : `${window.location.hostname}`;

    try {
      const locRes = await fetch("https://ipapi.co/json/");
      const locData = await locRes.json();
      if (locData.city) {
        label = `${locData.city}, ${locData.country_code || locData.country_name}`;
      }
    } catch (e) {
      console.warn("Could not determine physical location:", e);
    }

    // Lobby badge
    badgeText.textContent = label;
    badge.classList.add("online");

    // Call topbar chip
    chipText.textContent = label;
    chip.classList.remove("d-none");

  } catch {
    if (badge) {
      badge.classList.add("offline");
      document.getElementById("serverBadgeText").textContent = "Server unreachable";
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  CHAT FEATURE
// ═══════════════════════════════════════════════════════════

const chatPanel    = $("chatPanel");
const toggleChat   = $("toggleChat");
const closeChat    = $("closeChat");
const chatInput    = $("chatInput");
const sendChatBtn  = $("sendChatBtn");
const chatMessages = $("chatMessages");
const chatBadge    = $("chatBadge");

toggleChat.addEventListener("click", () => {
  chatOpen = !chatOpen;
  chatPanel.classList.toggle("hidden", !chatOpen);
  if (chatOpen) {
    unreadCount = 0;
    chatBadge.textContent = "0";
    chatBadge.classList.add("d-none");
    chatInput.focus();
  }
});

closeChat.addEventListener("click", () => {
  chatOpen = false;
  chatPanel.classList.add("hidden");
});

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  
  socket.emit("chatMessage", {
    room: roomName,
    message: text
  });
  
  chatInput.value = "";
}

sendChatBtn.addEventListener("click", sendChatMessage);
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter") sendChatMessage();
});

on("chatMessage", (payload) => {
  const isMe = payload.fromId === myId;
  const msgEl = document.createElement("div");
  msgEl.className = `chat-msg ${isMe ? "me" : ""}`;
  
  const time = new Date(payload.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sender = isMe ? "You" : `Peer (${payload.fromId.substring(0, 4)})`;
  
  msgEl.innerHTML = `
    <div class="chat-msg-header">
      <span class="chat-msg-sender">${sender}</span>
      <span class="chat-msg-time">${time}</span>
    </div>
    <div class="chat-msg-text">${payload.message}</div>
  `;
  
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (!chatOpen) {
    unreadCount++;
    chatBadge.textContent = unreadCount;
    chatBadge.classList.remove("d-none");
    showToast("New message received", "bi-chat-dots-fill");
  }
});

