const socket = io();

let currentRoomCode = null;

// Elements - Join
const joinSection = document.getElementById('join-section');
const roomCodeInput = document.getElementById('room-code-input');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const errorMessage = document.getElementById('error-message');

// Elements - Waiting
const waitingSection = document.getElementById('waiting-section');
const playerNameDisplay = document.getElementById('player-name');

// Elements - Collect
const collectSection = document.getElementById('collect-section');
const promptDisplay = document.getElementById('prompt-display');
const responseInput = document.getElementById('response-input');
const submitBtn = document.getElementById('submit-btn');

// Elements - Other sections
const submittedSection = document.getElementById('submitted-section');
const processSection = document.getElementById('process-section');
const revealSection = document.getElementById('reveal-section');
const aiResultDisplay = document.getElementById('ai-result');
const endSection = document.getElementById('end-section');

// Button handlers
joinBtn.addEventListener('click', () => {
  const code = roomCodeInput.value.toUpperCase().trim();
  const name = nameInput.value.trim();

  if (code.length !== 4) {
    showError('Please enter a 4-letter room code');
    return;
  }

  errorMessage.hidden = true;
  joinBtn.disabled = true;
  currentRoomCode = code;
  socket.emit('join-room', { code, name });
});

submitBtn.addEventListener('click', () => {
  const response = responseInput.value.trim();

  if (!response) {
    return;
  }

  submitBtn.disabled = true;
  socket.emit('submit-response', { code: currentRoomCode, response });
  collectSection.hidden = true;
  submittedSection.hidden = false;
});

// Socket events - Join
socket.on('join-success', ({ name }) => {
  joinSection.hidden = true;
  waitingSection.hidden = false;
  playerNameDisplay.textContent = name;
});

socket.on('join-error', ({ message }) => {
  showError(message);
  joinBtn.disabled = false;
  currentRoomCode = null;
});

socket.on('room-closed', () => {
  hideAllSections();
  joinSection.hidden = false;
  joinBtn.disabled = false;
  currentRoomCode = null;
  showError('Room was closed by the host');
});

// Socket events - Game phases
socket.on('game-started', ({ prompt }) => {
  hideAllSections();
  collectSection.hidden = false;
  promptDisplay.textContent = prompt;
  responseInput.value = '';
  submitBtn.disabled = false;
});

socket.on('processing-started', () => {
  hideAllSections();
  processSection.hidden = false;
});

socket.on('show-results', ({ aiResult }) => {
  hideAllSections();
  revealSection.hidden = false;
  aiResultDisplay.textContent = aiResult;
});

socket.on('game-ended', () => {
  hideAllSections();
  endSection.hidden = false;
});

// Helper functions
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function hideAllSections() {
  joinSection.hidden = true;
  waitingSection.hidden = true;
  collectSection.hidden = true;
  submittedSection.hidden = true;
  processSection.hidden = true;
  revealSection.hidden = true;
  endSection.hidden = true;
}
