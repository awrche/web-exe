const appearanceControls = document.querySelector('.appearance-controls');

if (appearanceControls) {
  const bubblesToggle = document.getElementById('bubbles-toggle');
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  const nightModeToggle = document.getElementById('night-mode-toggle');
  const musicToggle = document.getElementById('music-toggle');
  const musicMuteToggle = document.getElementById('music-mute-toggle');
  const musicVolumeControl = document.getElementById('music-volume');
  const musicVolumeValue = document.getElementById('music-volume-value');
  const musicStatus = document.getElementById('music-status');
  const aboutEasterEgg = document.getElementById('about-easter-egg');
  const bubbleSpeedControl = document.getElementById('bubble-speed');
  const bubbleSpeedValue = document.getElementById('bubble-speed-value');
  const bubbleRateControl = document.getElementById('bubble-rate');
  const bubbleRateValue = document.getElementById('bubble-rate-value');
  const storageKey = 'webexe-appearance';
  const minimumBubbleSize = 18;
  const maximumBubbleSize = 96;
  const minimumRiseSpeed = 90;
  const maximumRiseSpeed = 270;
  const maximumBubbles = 72;
  const defaultBubbleSpeed = 100;
  const defaultBubbleRate = 1.1;
  let bubbleLayer = null;
  let bubbleTimer = null;
  let activeBubbles = [];
  let preferences = {};
  const introAudio = new Audio('sound/intro.ogg');
  const loopAudio = new Audio('sound/loop.ogg');
  let musicEnabled = false;
  let musicRequest = 0;
  let musicPlaybackBlocked = false;
  let introTransitionStarted = false;
  let introPauseTimer = null;
  const loopTransitionLeadTime = 0.4;
  const loopOverlapDuration = 0.2;
  introAudio.preload = 'auto';
  loopAudio.preload = 'auto';
  loopAudio.loop = true;

  try {
    const storedPreferences = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (storedPreferences && typeof storedPreferences === 'object') {
      preferences = storedPreferences;
    }
  } catch (error) {
    console.error('Unable to load appearance preferences.', error);
  }

  function getPreferenceNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  let bubbleSpeed = getPreferenceNumber(preferences.bubbleSpeed, 50, 200, defaultBubbleSpeed);
  let bubbleSpawnRate = getPreferenceNumber(preferences.bubbleSpawnRate, 0.4, 8, defaultBubbleRate);
  bubbleSpeedControl.value = String(bubbleSpeed);
  bubbleRateControl.value = String(bubbleSpawnRate);
  bubbleSpeed = Number(bubbleSpeedControl.value);
  bubbleSpawnRate = Number(bubbleRateControl.value);
  bubbleSpeedControl.setAttribute('aria-valuetext', `${bubbleSpeed}%`);
  bubbleRateControl.setAttribute('aria-valuetext', `${bubbleSpawnRate.toFixed(1)} bubbles per second`);
  bubbleSpeedValue.value = `${bubbleSpeed}%`;
  bubbleRateValue.value = `${bubbleSpawnRate.toFixed(1)}/s`;
  const musicVolume = getPreferenceNumber(preferences.musicVolume, 0, 100, 100) / 100;
  let musicMuted = preferences.musicMuted === true;
  musicVolumeControl.value = String(Math.round(musicVolume * 100));
  musicVolumeControl.setAttribute('aria-valuetext', `${musicVolumeControl.value}%`);
  musicVolumeValue.value = `${musicVolumeControl.value}%`;
  [introAudio, loopAudio].forEach((audio) => {
    audio.volume = musicVolume;
    audio.muted = musicMuted;
  });
  musicMuteToggle.setAttribute('aria-pressed', String(musicMuted));
  musicMuteToggle.setAttribute('aria-label', musicMuted ? 'Unmute music' : 'Mute music');
  musicMuteToggle.textContent = musicMuted ? 'Unmute' : 'Mute';

  function applyPreference(toggle, className, enabled, label) {
    document.body.classList.toggle(className, enabled);
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.setAttribute('aria-label', `${label}: ${enabled ? 'On' : 'Off'}`);
  }

  function savePreferences() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch (error) {
      console.error('Unable to save appearance preferences.', error);
    }
  }

  function saveMusicSession(phase, time) {
    try {
      sessionStorage.setItem('webexe-music-active', 'true');
      sessionStorage.setItem('webexe-music-phase', phase);
      sessionStorage.setItem('webexe-music-time', String(time));
    } catch (error) {
      console.error('Unable to save background music playback state.', error);
    }
  }

  function clearMusicSession() {
    try {
      sessionStorage.removeItem('webexe-music-active');
      sessionStorage.removeItem('webexe-music-phase');
      sessionStorage.removeItem('webexe-music-time');
    } catch (error) {
      console.error('Unable to clear background music playback state.', error);
    }
  }

  function showMusicError(error) {
    console.error('Unable to play background music.', error);
    if (location.protocol === 'file:' && error.name === 'NotSupportedError') {
      musicStatus.textContent = 'Music needs the site to be opened through a web server, such as VS Code Live Server.';
    } else if (error.name === 'NotAllowedError') {
      musicStatus.textContent = 'Your browser blocked automatic playback. Select Music to resume.';
    } else {
      musicStatus.textContent = 'Music could not play. Check that the audio files are available.';
    }
  }

  async function playTrack(audio, phase, startTime = 0, request = musicRequest) {
    try {
      if (startTime > 0) {
        if (audio.readyState === 0) {
          await new Promise((resolve, reject) => {
            audio.addEventListener('loadedmetadata', resolve, { once: true });
            audio.addEventListener('error', () => reject(new Error('Audio metadata failed to load.')), { once: true });
            audio.load();
          });
        }
        audio.currentTime = Math.min(startTime, audio.duration || startTime);
      }

      if (!musicEnabled || request !== musicRequest) {
        return;
      }

      await audio.play();
      musicStatus.textContent = '';
      saveMusicSession(phase, audio.currentTime);
      if (audio === loopAudio && !introAudio.paused) {
        window.clearTimeout(introPauseTimer);
        introPauseTimer = window.setTimeout(() => {
          if (musicEnabled && request === musicRequest && !loopAudio.paused) {
            introAudio.pause();
          }
          introPauseTimer = null;
        }, loopOverlapDuration * 1000);
      }
    } catch (error) {
      if (!musicEnabled || request !== musicRequest) {
        return;
      }

      musicPlaybackBlocked = error.name === 'NotAllowedError';
      showMusicError(error);
    }
  }

  function resumeMusic() {
    let musicSession = {};
    try {
      musicSession = {
        active: sessionStorage.getItem('webexe-music-active') === 'true',
        phase: sessionStorage.getItem('webexe-music-phase'),
        time: Number(sessionStorage.getItem('webexe-music-time'))
      };
    } catch (error) {
      console.error('Unable to restore background music playback state.', error);
    }

    if (!musicSession.active) {
      startMusic();
    } else if (musicSession.phase === 'loop') {
      playTrack(loopAudio, 'loop', Number.isFinite(musicSession.time) ? musicSession.time : 0);
    } else {
      playTrack(introAudio, 'intro', Number.isFinite(musicSession.time) ? musicSession.time : 0);
    }
  }

  function startMusic() {
    musicRequest += 1;
    const request = musicRequest;
    musicEnabled = true;
    introTransitionStarted = false;
    window.clearTimeout(introPauseTimer);
    introPauseTimer = null;
    musicToggle.setAttribute('aria-pressed', 'true');
    musicToggle.setAttribute('aria-label', 'Background music: On');
    musicStatus.textContent = '';
    introAudio.pause();
    loopAudio.pause();
    introAudio.currentTime = 0;
    loopAudio.currentTime = 0;
    saveMusicSession('intro', 0);
    playTrack(introAudio, 'intro', 0, request);
  }

  function stopMusic() {
    musicRequest += 1;
    musicEnabled = false;
    window.clearTimeout(introPauseTimer);
    introPauseTimer = null;
    musicToggle.setAttribute('aria-pressed', 'false');
    musicToggle.setAttribute('aria-label', 'Background music: Off');
    musicStatus.textContent = '';
    introAudio.pause();
    loopAudio.pause();
    introAudio.currentTime = 0;
    loopAudio.currentTime = 0;
    clearMusicSession();
  }

  function removeBubble(bubble) {
    bubble.animation?.cancel();
    bubble.element.remove();
    activeBubbles = activeBubbles.filter((activeBubble) => activeBubble !== bubble);

    if (!document.body.classList.contains('bubbles-enabled') && activeBubbles.length === 0) {
      bubbleLayer?.remove();
      bubbleLayer = null;
    }
  }

  function releaseBubble(bubble) {
    if (bubble.falling) {
      return;
    }

    const bounds = bubble.element.getBoundingClientRect();
    bubble.falling = true;
    bubble.element.classList.add('falling');
    bubble.element.setAttribute('aria-label', 'Bubble drifting away');
    bubble.element.style.left = `${bounds.left}px`;
    bubble.element.style.top = `${bounds.top}px`;
    bubble.element.style.transform = 'none';
    bubble.animation?.cancel();
    bubble.animation = bubble.element.animate(
      [
        {
          transform: 'translate3d(0, 0, 0)',
          opacity: 0.78,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
        },
        {
          transform: 'translate3d(0, -18px, 0)',
          opacity: 0.78,
          easing: 'cubic-bezier(0.4, 0, 1, 1)'
        },
        {
          transform: `translate3d(0, ${window.innerHeight + bounds.height + 32}px, 0)`,
          opacity: 0
        }
      ],
      { duration: 1800 + Math.random() * 500 }
    );
    bubble.animation.onfinish = () => removeBubble(bubble);
  }

  function createBubble(size, left, top) {
    if (!bubbleLayer || activeBubbles.length >= maximumBubbles) {
      return;
    }

    const element = document.createElement('button');
    const width = size * (0.78 + Math.random() * 0.44);
    const drift = (Math.random() - 0.5) * Math.min(window.innerWidth * 0.24, 180);
    const bubble = { element, animation: null };
    const shapes = [
      '50%',
      '44% 56% 61% 39% / 48% 42% 58% 52%',
      '58% 42% 45% 55% / 42% 57% 43% 58%',
      '46% 54% 54% 46% / 57% 44% 56% 43%'
    ];

    element.type = 'button';
    element.className = 'interactive-bubble';
    element.setAttribute('aria-label', 'Pop bubble');
    element.style.width = `${width}px`;
    element.style.height = `${size}px`;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.borderRadius = shapes[Math.floor(Math.random() * shapes.length)];
    activeBubbles.push(bubble);
    bubbleLayer.append(element);

    element.addEventListener('click', () => {
      if (bubble.falling) {
        return;
      }

      const bounds = element.getBoundingClientRect();
      const nextSize = size / 2;
      removeBubble(bubble);

      if (nextSize >= minimumBubbleSize) {
        createBubble(nextSize, bounds.left + bounds.width * 0.18, bounds.top + bounds.height * 0.2);
        createBubble(nextSize, bounds.left + bounds.width * 0.46, bounds.top + bounds.height * 0.2);
      }
    }, { once: true });

    const travelDistance = top + size + 24;
    const sizeProgress = (size - minimumBubbleSize) / (maximumBubbleSize - minimumBubbleSize);
    const riseSpeed = minimumRiseSpeed + sizeProgress * (maximumRiseSpeed - minimumRiseSpeed);
    const duration = (travelDistance / riseSpeed) * 1000;
    bubble.animation = element.animate(
      [
        { transform: 'translate3d(0, 0, 0)', opacity: 0.85 },
        { transform: `translate3d(${drift}px, -${travelDistance}px, 0)`, opacity: 0.72 }
      ],
      { duration, easing: 'linear' }
    );
    bubble.animation.playbackRate = bubbleSpeed / 100;
    bubble.animation.onfinish = () => removeBubble(bubble);
  }

  function spawnBubble() {
    if (document.visibilityState === 'hidden' || activeBubbles.length >= maximumBubbles) {
      return;
    }

    const size = minimumBubbleSize * 2 + Math.random() * (maximumBubbleSize - minimumBubbleSize * 2);
    const width = size * (0.78 + 0.44 / 2);
    const left = Math.random() * Math.max(0, window.innerWidth - width);
    const top = window.innerHeight + size;

    createBubble(size, left, top);
  }

  function startBubbleTimer() {
    window.clearInterval(bubbleTimer);
    bubbleTimer = window.setInterval(spawnBubble, 1000 / bubbleSpawnRate);
  }

  function setBubblesEnabled(enabled) {
    applyPreference(bubblesToggle, 'bubbles-enabled', enabled, 'Bubbles');

    if (enabled) {
      if (!bubbleLayer) {
        bubbleLayer = document.createElement('div');
        bubbleLayer.className = 'bubble-layer';
        bubbleLayer.setAttribute('aria-label', 'Floating bubbles. Activate a bubble to split it.');
        document.body.append(bubbleLayer);
      }

      spawnBubble();
      startBubbleTimer();
      return;
    }

    window.clearInterval(bubbleTimer);
    bubbleTimer = null;
    activeBubbles.slice().forEach(releaseBubble);
  }

  applyPreference(bubblesToggle, 'bubbles-enabled', preferences.bubbles === true, 'Bubbles');
  const nightModeEnabled = preferences.nightMode === true;
  const darkModeEnabled = preferences.darkMode === true || nightModeEnabled;
  applyPreference(darkModeToggle, 'dark-mode', darkModeEnabled, 'Dark mode');
  applyPreference(nightModeToggle, 'night-mode', nightModeEnabled, 'Night mode');
  musicEnabled = preferences.music === true;
  musicToggle.setAttribute('aria-pressed', String(musicEnabled));
  musicToggle.setAttribute('aria-label', `Background music: ${musicEnabled ? 'On' : 'Off'}`);
  if (musicEnabled) {
    let musicSession = {};
    try {
      musicSession = {
        active: sessionStorage.getItem('webexe-music-active') === 'true',
        phase: sessionStorage.getItem('webexe-music-phase'),
        time: Number(sessionStorage.getItem('webexe-music-time'))
      };
    } catch (error) {
      console.error('Unable to restore background music playback state.', error);
    }

    if (musicSession.active && musicSession.phase === 'loop') {
      playTrack(loopAudio, 'loop', Number.isFinite(musicSession.time) ? musicSession.time : 0);
    } else if (musicSession.active) {
      playTrack(introAudio, 'intro', Number.isFinite(musicSession.time) ? musicSession.time : 0);
    }
  }
  if (preferences.bubbles === true) {
    setBubblesEnabled(true);
  }
  document.body.classList.add('appearance-ready');

  introAudio.addEventListener('timeupdate', () => {
    if (musicEnabled && !introAudio.paused) {
      if (!introTransitionStarted) {
        saveMusicSession('intro', introAudio.currentTime);
      }
      if (!introTransitionStarted && introAudio.duration - introAudio.currentTime <= loopTransitionLeadTime) {
        introTransitionStarted = true;
        playTrack(loopAudio, 'loop');
      }
    }
  });
  loopAudio.addEventListener('timeupdate', () => {
    if (musicEnabled && !loopAudio.paused) {
      saveMusicSession('loop', loopAudio.currentTime);
    }
  });
  window.addEventListener('pagehide', () => {
    if (musicEnabled) {
      const currentAudio = introAudio.paused ? loopAudio : introAudio;
      const phase = currentAudio === introAudio ? 'intro' : 'loop';
      saveMusicSession(phase, currentAudio.currentTime);
    }
  });
  introAudio.addEventListener('ended', () => {
    if (musicEnabled && !introTransitionStarted) {
      introTransitionStarted = true;
      playTrack(loopAudio, 'loop');
    }
  });

  bubblesToggle.addEventListener('click', () => {
    preferences.bubbles = !document.body.classList.contains('bubbles-enabled');
    setBubblesEnabled(preferences.bubbles);
    savePreferences();
  });

  bubbleSpeedControl.addEventListener('input', () => {
    bubbleSpeed = Number(bubbleSpeedControl.value);
    bubbleSpeedControl.setAttribute('aria-valuetext', `${bubbleSpeed}%`);
    bubbleSpeedValue.value = `${bubbleSpeed}%`;
    preferences.bubbleSpeed = bubbleSpeed;
    activeBubbles.forEach((bubble) => {
      if (!bubble.falling && bubble.animation) {
        bubble.animation.playbackRate = bubbleSpeed / 100;
      }
    });
    savePreferences();
  });

  bubbleRateControl.addEventListener('input', () => {
    bubbleSpawnRate = Number(bubbleRateControl.value);
    bubbleRateControl.setAttribute('aria-valuetext', `${bubbleSpawnRate.toFixed(1)} bubbles per second`);
    bubbleRateValue.value = `${bubbleSpawnRate.toFixed(1)}/s`;
    preferences.bubbleSpawnRate = bubbleSpawnRate;
    if (document.body.classList.contains('bubbles-enabled')) {
      startBubbleTimer();
    }
    savePreferences();
  });

  musicVolumeControl.addEventListener('input', () => {
    const volume = Number(musicVolumeControl.value);
    const label = `${volume}%`;
    musicVolumeControl.setAttribute('aria-valuetext', label);
    musicVolumeValue.value = label;
    [introAudio, loopAudio].forEach((audio) => {
      audio.volume = volume / 100;
    });
    preferences.musicVolume = volume;
    savePreferences();
  });

  musicMuteToggle.addEventListener('click', () => {
    musicMuted = !musicMuted;
    [introAudio, loopAudio].forEach((audio) => {
      audio.muted = musicMuted;
    });
    musicMuteToggle.setAttribute('aria-pressed', String(musicMuted));
    musicMuteToggle.setAttribute('aria-label', musicMuted ? 'Unmute music' : 'Mute music');
    musicMuteToggle.textContent = musicMuted ? 'Unmute' : 'Mute';
    preferences.musicMuted = musicMuted;
    savePreferences();
  });

  darkModeToggle.addEventListener('click', () => {
    preferences.darkMode = !document.body.classList.contains('dark-mode');
    if (!preferences.darkMode) {
      preferences.nightMode = false;
      applyPreference(nightModeToggle, 'night-mode', false, 'Night mode');
    }
    applyPreference(darkModeToggle, 'dark-mode', preferences.darkMode, 'Dark mode');
    savePreferences();
  });

  musicToggle.addEventListener('click', () => {
    if (musicEnabled && musicPlaybackBlocked) {
      musicPlaybackBlocked = false;
      resumeMusic();
      return;
    }

    preferences.music = !musicEnabled;
    if (preferences.music) {
      startMusic();
    } else {
      stopMusic();
    }
    savePreferences();
  });

  nightModeToggle.addEventListener('click', () => {
    preferences.nightMode = !document.body.classList.contains('night-mode');
    if (preferences.nightMode) {
      preferences.darkMode = true;
      applyPreference(darkModeToggle, 'dark-mode', true, 'Dark mode');
    }
    applyPreference(nightModeToggle, 'night-mode', preferences.nightMode, 'Night mode');
    savePreferences();
  });

  if (aboutEasterEgg) {
    let aboutClickCount = 0;
    aboutEasterEgg.addEventListener('click', () => {
      aboutClickCount += 1;
      if (aboutClickCount === 7) {
        window.location.href = 'Easter_Egg.html';
      }
    });
  }
}
