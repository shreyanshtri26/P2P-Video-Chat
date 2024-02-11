# Building Scalable Peer-to-Peer Video Chat with Spring Boot and WebRTC

Developed a real-time video conferencing application using cutting-edge WebRTC technology and Spring Boot for smooth peer-to-peer communication.

#### Technologies:

- WebRTC
- Socket.IO
- BootStrap


WebRTC (Web Real-Time Communication): An open-source project that provides real-time communication between web browsers and mobile applications. Mostly used for video, audio communications, screen sharing, and streaming.



SocketIO: A JavaScript library designed for real-time, bidirectional communication. In this project, I have implemented "netty-socket.io" ( Java Spring Boot compatible) as a signaling mechanism.




### Instructions


#### write your local ip for each step

1) **Generate certificates:** 
   - you can use git bash 
   - write your local ip address of your computer/host like `192.168.0.3` 
   - install openSSL if not installed (download the light version)
   ```
   https://slproweb.com/products/Win32OpenSSL.html
   ```
   - create an empty ssl folder under the project directory (I have included in the file[Not required])(Replaceable)


```
mkdir ssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ssl/private_key.pem -out ssl/certificate.pem -subj "//C=US//ST=California//L=San Francisco//O=MyOrganization//OU=MyDepartment//CN=<YOUR_LOCAL_IP>"
```

2) **update nginx.conf**

change `<YOUR_LOCAL_IP>` with your local ip same as step 1

3) **update client.js file in resources**

file location: `src/main/resources/static/client.js`

```let socket = io.connect("https://<YOUR_LOCAL_IP>", {secure: true});```

4) **build docker image**

- Install docker and login

`docker-compose up -d --build`

### Examples


#### phone + computer connection example

![./images/image3.png](./images/image3.png)

![./images/image1.png](./images/image1.png)

![./images/image2.png](./images/image2.png)


### Key Highlights

1. Implemented WebRTC for browser-based real-time audio/video streaming and data transfer between peers without plugins.
2. Integrated Socket.IO on Spring Boot to enable low-latency, bi-directional signaling between clients.
3. Designed a flexible and modular architecture with RESTful APIs for easy maintainability and scalability.
4. Configured Nginx as a reverse proxy to enable HTTPS and auto-certificate generation through Let's Encrypt.
5. Built an intuitive UI with Bootstrap for seamless video chat experience across devices.
6. Containerized app using Docker for simplified deployment and portability across environments.
