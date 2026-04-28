package com.gucardev.springbootwebrtcpeer2peer;

import com.corundumstudio.socketio.AckRequest;
import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.corundumstudio.socketio.annotation.OnConnect;
import com.corundumstudio.socketio.annotation.OnDisconnect;
import com.corundumstudio.socketio.annotation.OnEvent;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class SocketHandler {

  private final SocketIOServer server;
  // clientId -> roomName
  private static final Map<String, String> users = new HashMap<>();
  // Maximum participants per room (mesh: 4 keeps connections manageable)
  private static final int MAX_ROOM_SIZE = 4;

  public SocketHandler(SocketIOServer server) {
    this.server = server;
    server.addListeners(this);
    server.start();
  }

  @OnConnect
  public void onConnect(SocketIOClient client) {
    log.info("Client connected: {}", client.getSessionId());
    users.put(client.getSessionId().toString(), null);
  }

  @OnDisconnect
  public void onDisconnect(SocketIOClient client) {
    String clientId = client.getSessionId().toString();
    String room = users.get(clientId);
    if (!Objects.isNull(room)) {
      log.info("Client disconnected: {} from: {}", clientId, room);
      users.remove(clientId);
      // Tell remaining peers the exact ID that left so they can remove that video tile
      client.getNamespace().getRoomOperations(room).sendEvent("userDisconnected", clientId);
    }
    printLog("onDisconnect", client, room);
  }

  @OnEvent("joinRoom")
  public void onJoinRoom(SocketIOClient client, String room) {
    int connectedClients = server.getRoomOperations(room).getClients().size();
    String clientId = client.getSessionId().toString();

    if (connectedClients >= MAX_ROOM_SIZE) {
      client.sendEvent("full", room);
      return;
    }

    // Collect existing peer IDs BEFORE the new client joins the room
    List<String> existingPeers = server.getRoomOperations(room).getClients()
        .stream()
        .map(c -> c.getSessionId().toString())
        .collect(Collectors.toList());

    // Join the Socket.IO room
    client.joinRoom(room);
    users.put(clientId, room);

    if (connectedClients == 0) {
      // First person — just wait for others
      client.sendEvent("created", clientId);
    } else {
      // Send the joiner: their own ID + list of who's already here
      Map<String, Object> joinPayload = new HashMap<>();
      joinPayload.put("myId", clientId);
      joinPayload.put("peers", existingPeers);
      client.sendEvent("joined", joinPayload);

      // Notify every existing peer that a new person arrived
      for (SocketIOClient existingClient : server.getRoomOperations(room).getClients()) {
        String existingId = existingClient.getSessionId().toString();
        if (!existingId.equals(clientId)) {
          existingClient.sendEvent("peerJoined", clientId);
        }
      }
    }

    printLog("onJoinRoom", client, room);
  }

  // ── Mesh signalling: all events carry targetId so the server routes point-to-point ──

  @OnEvent("offer")
  public void onOffer(SocketIOClient client, Map<String, Object> payload) {
    String room = (String) payload.get("room");
    String targetId = (String) payload.get("targetId");
    payload.put("fromId", client.getSessionId().toString());
    routeToTarget(room, targetId, "offer", payload);
    printLog("onOffer", client, room);
  }

  @OnEvent("answer")
  public void onAnswer(SocketIOClient client, Map<String, Object> payload) {
    String room = (String) payload.get("room");
    String targetId = (String) payload.get("targetId");
    payload.put("fromId", client.getSessionId().toString());
    routeToTarget(room, targetId, "answer", payload);
    printLog("onAnswer", client, room);
  }

  @OnEvent("candidate")
  public void onCandidate(SocketIOClient client, Map<String, Object> payload) {
    String room = (String) payload.get("room");
    String targetId = (String) payload.get("targetId");
    payload.put("fromId", client.getSessionId().toString());
    routeToTarget(room, targetId, "candidate", payload);
    printLog("onCandidate", client, room);
  }

  @OnEvent("leaveRoom")
  public void onLeaveRoom(SocketIOClient client, String room) {
    client.leaveRoom(room);
    printLog("onLeaveRoom", client, room);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private void routeToTarget(String room, String targetId, String event, Object payload) {
    if (targetId == null || room == null) return;
    server.getRoomOperations(room).getClients().stream()
        .filter(c -> c.getSessionId().toString().equals(targetId))
        .findFirst()
        .ifPresent(target -> target.sendEvent(event, payload));
  }

  private static void printLog(String header, SocketIOClient client, String room) {
    if (room == null) return;
    int size = 0;
    try {
      size = client.getNamespace().getRoomOperations(room).getClients().size();
    } catch (Exception e) {
      log.error("error", e);
    }
    log.info("#ConnectedClients - {} => room: {}, count: {}", header, room, size);
  }
}
