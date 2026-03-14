// ── Config ──────────────────────────────────────────
const SERVER_URL = 'http://localhost:3000';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// ── State ────────────────────────────────────────────
let socket         = null;   // connection to signaling server
let peerConnection = null;   // WebRTC connection to friend
let localStream    = null;   // your camera/mic
let remoteStream   = null;   // friend's camera/mic
let dataChannel    = null;   // for text messages
let isMuted        = false;
let isCamOff       = false;

// ── UI Elements ──────────────────────────────────────
const loginScreen   = document.getElementById('login-screen');
const waitingScreen = document.getElementById('waiting-screen');
const appScreen     = document.getElementById('app-screen');

const passwordInput = document.getElementById('password-input');
const joinBtn       = document.getElementById('join-btn');
const loginError    = document.getElementById('login-error');

const localVideo    = document.getElementById('local-video');
const remoteVideo   = document.getElementById('remote-video');
const noVideoMsg    = document.getElementById('no-video-msg');

const messagesDiv   = document.getElementById('messages');
const chatInput     = document.getElementById('chat-input');
const sendBtn       = document.getElementById('send-btn');

const callBtn       = document.getElementById('call-btn');
const muteBtn       = document.getElementById('mute-btn');
const videoBtn      = document.getElementById('video-btn');
const endBtn        = document.getElementById('end-btn');

// ── Helpers ──────────────────────────────────────────
function showScreen(screen) {
  loginScreen.classList.add('hidden');
  waitingScreen.classList.add('hidden');
  appScreen.classList.add('hidden');
  screen.classList.remove('hidden');
}

function showError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove('hidden');
}

function setCallActive(active) {
  callBtn.disabled  =  active;
  muteBtn.disabled  = !active;
  videoBtn.disabled = !active;
  endBtn.disabled   = !active;
  if (!active) noVideoMsg.style.display = 'block';
  else         noVideoMsg.style.display = 'none';
}

// ── Join ─────────────────────────────────────────────
joinBtn.addEventListener('click', () => {
  const password = passwordInput.value.trim();
  if (!password) return;

  // Connect to signaling server
  socket = io(SERVER_URL);

  socket.on('connect', () => {
    // Once connected, send password to join the room
    socket.emit('join', password);
  });

  socket.on('error', (msg) => {
    showError(msg);
    socket.disconnect();
  });

  socket.on('joined', () => {
    // Successfully joined — wait for friend
    showScreen(waitingScreen);
  });

  socket.on('ready', () => {
    // Both people are here — show main app
    showScreen(appScreen);
  });

  socket.on('peer-left', () => {
    addMessage('system', 'Your friend disconnected');
    endCall();
  });

  // WebRTC signaling events (wired up below)
  socket.on('offer',         handleOffer);
  socket.on('answer',        handleAnswer);
  socket.on('ice-candidate', handleIceCandidate);
});

// ── WebRTC Setup ─────────────────────────────────────
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  // When ICE finds a candidate, send it to friend via server
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', event.candidate);
    }
  };

  // When friend's stream arrives, show it in the big video
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // Create data channel for text messages (caller side only)
  dataChannel = peerConnection.createDataChannel('chat');
  setupDataChannel(dataChannel);

  // When friend creates a data channel, receive it
  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel(dataChannel);
  };

  return peerConnection;
}

// ── Call Button ──────────────────────────────────────
callBtn.addEventListener('click', async () => {
  try {
    // 1. Ask for camera and microphone permission
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    // 2. Show your own video in the small corner box
    localVideo.srcObject = localStream;

    // 3. Create peer connection
    createPeerConnection();

    // 4. Add your stream to the connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // 5. Create an offer and send it to friend
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);

    setCallActive(true);

  } catch (err) {
    console.error('Call error:', err);
    alert('Could not access camera/microphone');
  }
});

// ── Handle Incoming Offer ────────────────────────────
async function handleOffer(offer) {
  try {
    // 1. Get camera and mic
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    localVideo.srcObject = localStream;

    // 2. Create peer connection
    createPeerConnection();

    // 3. Add your stream
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // 4. Set the offer you received as the remote description
    await peerConnection.setRemoteDescription(offer);

    // 5. Create an answer and send it back
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer);

    setCallActive(true);

  } catch (err) {
    console.error('Answer error:', err);
  }
}

// ── Handle Incoming Answer ───────────────────────────
async function handleAnswer(answer) {
  await peerConnection.setRemoteDescription(answer);
}

// ── Handle ICE Candidates ────────────────────────────
async function handleIceCandidate(candidate) {
  try {
    await peerConnection.addIceCandidate(candidate);
  } catch (err) {
    console.error('ICE error:', err);
  }
}

// ── Mute Button ──────────────────────────────────────
muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });
  muteBtn.textContent = isMuted ? '🔇 Unmute' : '🎤 Mute';
});

// ── Camera Toggle ────────────────────────────────────
videoBtn.addEventListener('click', () => {
  isCamOff = !isCamOff;
  localStream.getVideoTracks().forEach(track => {
    track.enabled = !isCamOff;
  });
  videoBtn.textContent = isCamOff ? '📷 Cam On' : '📷 Cam Off';
});

// ── End Call ─────────────────────────────────────────
endBtn.addEventListener('click', endCall);

function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  localVideo.srcObject  = null;
  remoteVideo.srcObject = null;
  setCallActive(false);
  isMuted  = false;
  isCamOff = false;
  muteBtn.textContent  = '🎤 Mute';
  videoBtn.textContent = '📷 Cam';
}

// ── Data Channel (Chat) ──────────────────────────────
function setupDataChannel(channel) {
  channel.onopen = () => {
    console.log('Data channel open');
  };

  channel.onmessage = (event) => {
    addMessage('them', event.data);
  };
}

function addMessage(sender, text) {
  const div = document.createElement('div');
  div.classList.add('message', sender);
  div.textContent = text;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !dataChannel || dataChannel.readyState !== 'open') return;
  dataChannel.send(text);
  addMessage('me', text);
  chatInput.value = '';
}