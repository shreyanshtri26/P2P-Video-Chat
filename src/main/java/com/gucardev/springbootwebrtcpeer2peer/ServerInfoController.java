package com.gucardev.springbootwebrtcpeer2peer;

import java.net.InetAddress;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ServerInfoController {

  @Value("${socket.port}")
  private int socketPort;

  @GetMapping("/server-info")
  public ResponseEntity<Map<String, Object>> serverInfo() {
    Map<String, Object> info = new HashMap<>();
    try {
      String hostname = InetAddress.getLocalHost().getHostName();
      info.put("hostname", hostname);
    } catch (Exception e) {
      info.put("hostname", "unknown");
    }
    info.put("signalingPort", socketPort);
    info.put("region", System.getenv("RENDER_REGION") != null
        ? System.getenv("RENDER_REGION")
        : "local");
    info.put("service", System.getenv("RENDER_SERVICE_NAME") != null
        ? System.getenv("RENDER_SERVICE_NAME")
        : "localhost");
    info.put("status", "online");
    return ResponseEntity.ok(info);
  }
}
